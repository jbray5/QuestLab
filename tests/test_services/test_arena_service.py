"""Practice Arena engine (Plan 84).

The dice are patched to a fixed roller so a fight is deterministic: max rolls
mean every attack crits and every save fails; min rolls mean everything
misses. The engine never writes to the real sheet.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.monster_repo import MonsterRepo
from domain.arena import ArenaAction
from domain.enums import CharacterClass, CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate
from services import arena_service as arena


class _Fixed:
    """A stand-in RNG whose every roll is the same number (max or min of the die)."""

    def __init__(self, high: bool):
        self.high = high

    def randint(self, a: int, b: int) -> int:
        return b if self.high else a

    def choice(self, seq):
        return seq[0]


def _pc(db, level: int = 3, cls: CharacterClass = CharacterClass.FIGHTER, hp: int = 28):
    dm = f"arena_{uuid.uuid4().hex[:6]}@example.com"
    campaign = camp_svc.create_campaign(db, name="Ring", setting="R", tone="T", dm_email=dm)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="Cory",
        character_name="Creed",
        race="Human",
        character_class=cls,
        level=level,
        score_str=16,
        score_dex=20,
        score_con=14,
        score_int=8,
        score_wis=10,
        score_cha=10,
        hp_max=hp,
        hp_current=hp,
        ac=16,
        speed=30,
    )
    _grant_features(db, pc, dm)
    return pc, dm


def _grant_features(db, pc, dm: str) -> None:
    """Plant the Fighter rows this suite relies on and grant what the level allows."""
    from db.repos.class_feature_repo import ClassFeatureRepo
    from integrations.dnd_rules.class_features_2024 import CLASS_FEATURES_2024
    from services import feature_service

    for payload in CLASS_FEATURES_2024:
        if (
            payload.name in ("Second Wind", "Action Surge")
            and payload.character_class == pc.character_class
        ):
            if (
                ClassFeatureRepo.find_by_name_class(db, payload.name, payload.character_class)
                is None
            ):
                ClassFeatureRepo.create(db, payload)
    feature_service.sync_for_level(db, pc.id, dm)


def _goblin(db, name: str = "Goblin", hp: int = 7, actions=None):
    return MonsterRepo.create(
        db,
        MonsterStatBlockCreate(
            name=f"{name} {uuid.uuid4().hex[:4]}",
            size=CreatureSize.SMALL,
            creature_type=CreatureType.HUMANOID,
            ac=15,
            hp_average=hp,
            hp_formula="2d6",
            score_str=8,
            score_dex=14,
            score_con=10,
            score_int=10,
            score_wis=8,
            score_cha=8,
            challenge_rating="1/4",
            xp=50,
            proficiency_bonus=2,
            actions=(
                actions
                if actions is not None
                else [{"name": "Scimitar", "desc": "+4 to hit, 1d6+2 slashing"}]
            ),
        ),
    )


class TestDice:
    """The parser reads the same expressions the sheet and stat blocks use."""

    def test_roll_expr_shapes(self, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        assert arena.roll_expr("1d8+3") == (11, "1d8+3 → [8]+3 = 11")
        assert arena.roll_expr("2d6", crit=True)[0] == 24
        assert arena.roll_expr("4") == (4, "4")
        assert arena.roll_expr("1d4-2")[0] == 2

    def test_d20_modes(self, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))
        assert arena.d20()[0] == 1
        assert arena.d20("adv")[0] == 1
        assert "advantage" in arena.d20("adv")[1]

    def test_cr_value(self):
        assert arena.cr_value("1/4") == 0.25
        assert arena.cr_value("3") == 3.0
        assert arena.cr_value("junk") == 0.0


class TestStatBlockParsing:
    """Foe attacks come out of free text; multiattack multiplies the first."""

    def test_parse_attacks_and_multiattack(self):
        atks = arena.parse_foe_attacks(
            [
                {"name": "Multiattack", "desc": "The wolf makes two attacks: one bite, one claw."},
                {"name": "Bite", "desc": "+4 to hit, 2d4+2 piercing"},
                {"name": "Claw", "desc": "+4 to hit, 1d6 + 2 slashing"},
                {"name": "Howl", "desc": "no roll here"},
            ]
        )
        assert [a.name for a in atks] == ["Bite", "Claw"]
        assert atks[0].count == 2 and atks[0].hit_bonus == 4 and atks[0].damage == "2d4+2"
        assert atks[0].damage_type == "piercing"
        assert atks[1].damage == "1d6+2"

    def test_unparseable_block_gets_a_slam(self):
        atks = arena.parse_foe_attacks([{"name": "Glare", "desc": "It stares."}])
        assert atks[0].name == "Slam"


class TestFight:
    """A whole fight, deterministic through the patched dice."""

    def test_start_builds_from_the_sheet(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session)
        foe = _goblin(duckdb_session)
        state = arena.start(duckdb_session, pc.id, foe.id)
        assert state.pc.name == "Creed" and state.pc.hp == 28 and state.pc.ac == 16
        # No weapon equipped → fists, with STR + proficiency to hit.
        assert state.pc.attacks[0].kind == "unarmed" and state.pc.attacks[0].hit_bonus == 3 + 2
        assert state.foe.name.startswith("Goblin") and state.foe.attacks[0].hit_bonus == 4
        # Fighter 3 has Second Wind and Action Surge modeled.
        keys = {f.key for f in state.pc.features}
        assert {"second_wind", "action_surge"} <= keys
        assert state.phase == "your_turn" and state.round == 1
        assert state.tips

    def test_max_rolls_win_in_one_hit(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session)
        foe = _goblin(duckdb_session, hp=3)
        state = arena.start(duckdb_session, pc.id, foe.id)
        state = arena.act(duckdb_session, state, ArenaAction(kind="attack", key="unarmed"))
        assert state.phase == "over" and state.result == "won"
        assert state.stats.crits == 1 and state.stats.dealt >= 3
        assert any(line.crit for line in state.log)
        with pytest.raises(ValueError, match="over"):
            arena.act(duckdb_session, state, ArenaAction(kind="end_turn"))

    def test_action_economy_and_foe_turn(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))  # everything misses
        pc, _dm = _pc(duckdb_session)
        foe = _goblin(duckdb_session, hp=50)
        state = arena.start(duckdb_session, pc.id, foe.id)
        state = arena.act(duckdb_session, state, ArenaAction(kind="attack", key="unarmed"))
        assert state.action_used and state.foe.hp == 50 and state.stats.misses == 1
        with pytest.raises(ValueError, match="used your action"):
            arena.act(duckdb_session, state, ArenaAction(kind="attack", key="unarmed"))
        # Action Surge buys a second action.
        state = arena.act(duckdb_session, state, ArenaAction(kind="feature", key="action_surge"))
        state = arena.act(duckdb_session, state, ArenaAction(kind="attack", key="unarmed"))
        assert state.stats.misses == 2
        # Second Wind at full HP is refused (Plan 85); wounded, it's a bonus action.
        with pytest.raises(ValueError, match="full HP"):
            arena.act(duckdb_session, state, ArenaAction(kind="feature", key="second_wind"))
        state.pc.hp = 10
        arena._seal(state)
        state = arena.act(duckdb_session, state, ArenaAction(kind="feature", key="second_wind"))
        assert state.bonus_used and state.pc.hp > 10
        with pytest.raises(ValueError, match="bonus action"):
            arena.act(duckdb_session, state, ArenaAction(kind="feature", key="second_wind"))
        # End turn: the foe swings (and misses on min rolls), a new round begins.
        state = arena.act(duckdb_session, state, ArenaAction(kind="end_turn"))
        assert state.round == 2 and not state.action_used and not state.bonus_used
        assert any(line.who == "foe" and line.hit is False for line in state.log)
        assert state.pc.hp == 14  # 10 + Second Wind's minimum (1 + level 3)

    def test_foe_can_drop_you_and_the_sheet_is_untouched(
        self, duckdb_session: Session, monkeypatch
    ):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, dm = _pc(duckdb_session, hp=5)
        foe = _goblin(
            duckdb_session,
            hp=200,
            actions=[{"name": "Maul", "desc": "+9 to hit, 4d12+9 bludgeoning"}],
        )
        state = arena.start(duckdb_session, pc.id, foe.id)
        state = arena.act(duckdb_session, state, ArenaAction(kind="dodge"))
        assert state.dodging
        state = arena.act(duckdb_session, state, ArenaAction(kind="end_turn"))
        assert state.result == "lost" and state.pc.hp == 0
        assert "death saves" in state.log[-1].text
        real = char_svc.get_character(duckdb_session, pc.id, dm)
        assert real.hp_current == 5

    def test_flee_and_foe_list(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, level=1)
        foe = _goblin(duckdb_session)
        foes = arena.list_foes(duckdb_session, pc.id)
        mine = next(f for f in foes if f.id == foe.id)
        assert mine.suggested is True and mine.cr == "1/4"
        state = arena.start(duckdb_session, pc.id, None)
        state = arena.act(duckdb_session, state, ArenaAction(kind="flee"))
        assert state.result == "fled" and state.phase == "over"

    def test_tampered_state_is_refused(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))
        pc, _dm = _pc(duckdb_session)
        foe = _goblin(duckdb_session, hp=50)
        state = arena.start(duckdb_session, pc.id, foe.id)
        state.foe.hp = 1  # the phone "edits" the foe
        with pytest.raises(ValueError, match="altered"):
            arena.act(duckdb_session, state, ArenaAction(kind="attack", key="unarmed"))

    def test_extra_attack_at_level_five(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))
        pc, _dm = _pc(duckdb_session, level=5, hp=40)
        foe = _goblin(duckdb_session, hp=50)
        state = arena.start(duckdb_session, pc.id, foe.id)
        assert state.pc.attacks_per_action == 2
        state = arena.act(duckdb_session, state, ArenaAction(kind="attack", key="unarmed"))
        assert state.action_used and state.attacks_left == 1
        state = arena.act(duckdb_session, state, ArenaAction(kind="attack", key="unarmed"))
        assert state.attacks_left == 0 and state.stats.misses == 2
        with pytest.raises(ValueError, match="used your action"):
            arena.act(duckdb_session, state, ArenaAction(kind="attack", key="unarmed"))

    def test_foe_takes_one_action_per_turn(self):
        atks = arena.parse_foe_attacks(
            [
                {"name": "Bite", "desc": "+4 to hit, 1d4 piercing"},
                {"name": "Spear", "desc": "+4 to hit, 1d6+2 piercing"},
                {"name": "Longbow", "desc": "+4 to hit, 1d8+2 piercing"},
            ]
        )
        best = max(atks, key=lambda a: arena._avg(a.damage) * a.count)
        assert best.name == "Longbow"
