"""Practice Arena rules engine, class by class through level 5 (Plan 87).

Dice are patched: ``_Fixed`` rolls the same face every time; ``_Seq`` plays a
queue of faces so a single fight can be scripted roll by roll.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.class_feature_repo import ClassFeatureRepo
from db.repos.monster_repo import MonsterRepo
from db.repos.spell_repo import SpellRepo
from domain.arena import ArenaAction
from domain.character import CharacterSpellCreate
from domain.enums import CharacterClass, CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate
from domain.spell import SpellCreate
from integrations.dnd_rules.class_features_2024 import CLASS_FEATURES_2024
from services import arena_service as arena
from services import feature_service, spellcasting_service


class _Fixed:
    """Every roll is the same face (max or min of the die)."""

    def __init__(self, high: bool):
        self.high = high

    def randint(self, a: int, b: int) -> int:
        return b if self.high else a

    def choice(self, seq):
        return seq[0]


class _Seq:
    """Play a queue of faces; after that, the max face."""

    def __init__(self, faces):
        self.faces = list(faces)

    def randint(self, a: int, b: int) -> int:
        if self.faces:
            return max(a, min(b, self.faces.pop(0)))
        return b

    def choice(self, seq):
        return seq[0]


_MADE: list[tuple[uuid.UUID, str]] = []


@pytest.fixture(autouse=True)
def _tidy(duckdb_session: Session):
    """Delete each test's campaign afterwards so spell fixtures elsewhere stay FK-free."""
    yield
    while _MADE:
        cid, dm = _MADE.pop()
        try:
            camp_svc.delete_campaign(duckdb_session, cid, dm)
        except Exception:  # noqa: BLE001 — best effort
            duckdb_session.rollback()


def _pc(db, cls: CharacterClass, level: int = 3, subclass=None, feats=None, **scores):
    dm = f"arena87_{uuid.uuid4().hex[:6]}@example.com"
    campaign = camp_svc.create_campaign(db, name="Ring", setting="R", tone="T", dm_email=dm)
    _MADE.append((campaign.id, dm))
    base = dict(score_str=16, score_dex=20, score_con=14, score_int=10, score_wis=16, score_cha=16)
    base.update(scores)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Tester",
        race="Human",
        character_class=cls,
        subclass=subclass,
        level=level,
        hp_max=30,
        hp_current=30,
        ac=15,
        speed=30,
        feats=feats,
        **base,
    )
    # Plant the catalog rows this suite relies on, then grant what the level allows.
    for payload in CLASS_FEATURES_2024:
        if payload.character_class == cls and payload.level_acquired <= level:
            if (
                ClassFeatureRepo.find_by_name_class(db, payload.name, payload.character_class)
                is None
            ):
                ClassFeatureRepo.create(db, payload)
    feature_service.sync_for_level(db, pc.id, dm)
    return pc, dm


def _spell(db, name, level, classes, **kw):
    existing = next((s for s in SpellRepo.list_all(db) if s.name == name), None)
    if existing:
        return existing
    return SpellRepo.create(
        db,
        SpellCreate(
            name=name,
            level=level,
            school="Evocation",
            classes=classes,
            casting_time=kw.pop("casting_time", "Action"),
            range="60 ft",
            duration="Instant",
            description="x",
            **kw,
        ),
    )


def _learn(db, pc, dm, spell):
    spellcasting_service.learn_spell(
        db, pc.id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=True), dm
    )


def _foe(db, hp=30, ac=10, ctype=CreatureType.HUMANOID, actions=None, name="Brute", cr="1/2"):
    return MonsterRepo.create(
        db,
        MonsterStatBlockCreate(
            name=f"{name} {uuid.uuid4().hex[:4]}",
            size=CreatureSize.MEDIUM,
            creature_type=ctype,
            ac=ac,
            hp_average=hp,
            hp_formula="6d8",
            score_str=14,
            score_dex=10,
            score_con=12,
            score_int=8,
            score_wis=8,
            score_cha=8,
            challenge_rating=cr,
            xp=100,
            proficiency_bonus=2,
            actions=actions or [{"name": "Club", "desc": "+4 to hit, 1d6+2 bludgeoning"}],
        ),
    )


class TestPaladin:
    """Divine Smite is a bonus action after a melee hit, spending a slot (Justin's Creed)."""

    def test_smite_needs_a_melee_hit_then_spends_a_slot(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3, feats=["Dueling"])
        foe = _foe(duckdb_session, hp=80)
        st = arena.start(duckdb_session, pc.id, foe.id)
        smite = next(a for a in st.pc.attacks if a.key == "divine_smite")
        assert smite.cost == "bonus" and smite.after_melee_hit
        assert st.pc.slots.get("1", 0) >= 2
        with pytest.raises(ValueError, match="needs a melee hit"):
            arena.act(
                duckdb_session, st, ArenaAction(kind="cast", key="divine_smite", slot_level=1)
            )
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="unarmed"))
        assert st.melee_hit_this_turn
        slots_before = st.pc.slots["1"]
        hp_before = st.foe.hp
        st = arena.act(
            duckdb_session, st, ArenaAction(kind="cast", key="divine_smite", slot_level=1)
        )
        assert st.pc.slots["1"] == slots_before - 1 and st.bonus_used
        assert st.foe.hp == hp_before - 16  # 2d8 at max faces
        assert "Divine Smite (level 1 slot): 16 radiant" in st.log[-1].text
        with pytest.raises(ValueError, match="bonus action"):
            arena.act(
                duckdb_session, st, ArenaAction(kind="cast", key="divine_smite", slot_level=1)
            )

    def test_smite_adds_a_die_against_fiends_and_lay_on_hands_is_bonus(
        self, duckdb_session, monkeypatch
    ):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3)
        foe = _foe(duckdb_session, hp=200, ctype=CreatureType.FIEND)
        st = arena.start(duckdb_session, pc.id, foe.id)
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="unarmed"))
        hp = st.foe.hp
        st = arena.act(
            duckdb_session, st, ArenaAction(kind="cast", key="divine_smite", slot_level=1)
        )
        assert st.foe.hp == hp - 24  # 2d8 + 1d8 vs a fiend
        loh = next(f for f in st.pc.features if f.key == "lay_on_hands")
        assert loh.cost == "bonus"


class TestRogue:
    """Sneak Attack rides a finesse hit with advantage; Steady Aim buys the advantage."""

    def test_steady_aim_then_sneak_attack_once_per_turn(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, CharacterClass.ROGUE, level=3, subclass="Soulknife")
        foe = _foe(duckdb_session, hp=200)
        st = arena.start(duckdb_session, pc.id, foe.id)
        keys = {a.key for a in st.pc.attacks}
        assert {"psychic_blade", "psychic_blade_off"} <= keys and st.pc.sneak_dice == 2
        with pytest.raises(ValueError, match="first blade"):
            arena.act(duckdb_session, st, ArenaAction(kind="attack", key="psychic_blade_off"))
        st = arena.act(duckdb_session, st, ArenaAction(kind="feature", key="steady_aim"))
        assert st.adv_next and st.bonus_used
        hp = st.foe.hp
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="psychic_blade"))
        line = st.log[-1]
        assert "Sneak Attack" in (line.dice or "") and st.sneak_used
        # 1d6+5 doubled on the crit (12+5) + 2d6 sneak doubled (24) = 41
        assert hp - st.foe.hp == 41
        # The second blade is a bonus action — already spent on Steady Aim this turn.
        with pytest.raises(ValueError, match="bonus action"):
            arena.act(duckdb_session, st, ArenaAction(kind="attack", key="psychic_blade_off"))

    def test_offhand_blade_after_the_first_and_cunning_dodge(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))
        pc, _dm = _pc(duckdb_session, CharacterClass.ROGUE, level=3, subclass="Soulknife")
        foe = _foe(duckdb_session, hp=200)
        st = arena.start(duckdb_session, pc.id, foe.id)
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="psychic_blade"))
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="psychic_blade_off"))
        assert st.bonus_used and st.action_used
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        st = arena.act(duckdb_session, st, ArenaAction(kind="feature", key="cunning_dodge"))
        assert st.dodging


class TestMonk:
    """Martial Arts, Flurry of Blows for a Focus Point, Stunning Strike at 5."""

    def test_flurry_and_focus(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))
        pc, _dm = _pc(duckdb_session, CharacterClass.MONK, level=2)
        foe = _foe(duckdb_session, hp=200)
        st = arena.start(duckdb_session, pc.id, foe.id)
        unarmed = next(a for a in st.pc.attacks if a.key == "unarmed")
        assert unarmed.damage.startswith("1d6") and st.pc.focus == 2
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="unarmed"))
        misses = st.stats.misses
        st = arena.act(duckdb_session, st, ArenaAction(kind="feature", key="flurry"))
        assert st.pc.focus == 1 and st.stats.misses == misses + 2 and st.bonus_used

    def test_stunning_strike_costs_the_foe_its_turn(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(
            arena, "_RNG", _Seq([20, 1, 20, 8, 8, 1])
        )  # hit+crit, damage, foe's CON save fails
        pc, _dm = _pc(duckdb_session, CharacterClass.MONK, level=5)
        foe = _foe(duckdb_session, hp=200)
        st = arena.start(duckdb_session, pc.id, foe.id)
        assert st.pc.attacks_per_action == 2 and st.pc.martial_die == 8
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="unarmed"))
        assert st.melee_hit_this_turn
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key="stunning_strike"))
        assert "stunned" in st.foe.conditions and st.pc.focus == 4
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        assert any("loses its turn" in line.text for line in st.log) and st.pc.hp == 30


class TestBarbarian:
    """Reckless Attack: advantage both ways; Rage halves weapon damage only."""

    def test_reckless_gives_and_takes_advantage(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))
        pc, _dm = _pc(duckdb_session, CharacterClass.BARBARIAN, level=2)
        foe = _foe(duckdb_session, hp=200)
        st = arena.start(duckdb_session, pc.id, foe.id)
        st = arena.act(duckdb_session, st, ArenaAction(kind="reckless"))
        assert st.reckless
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="unarmed"))
        assert "advantage" in (st.log[-1].dice or "")
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        foe_line = next(line for line in reversed(st.log) if line.who == "foe")
        assert "advantage" in (foe_line.dice or "") and not st.reckless


class TestCastersAndBuffs:
    """Marks, Guiding Bolt's advantage, Healing Word as a bonus action, Sleep, Shield."""

    def test_hex_rides_every_eldritch_blast_beam(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, dm = _pc(duckdb_session, CharacterClass.WARLOCK, level=5)
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Hex",
                1,
                ["Warlock"],
                casting_time="Bonus Action",
                is_concentration=True,
                damage_dice="1d6",
                damage_type="necrotic",
            ),
        )
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Eldritch Blast",
                0,
                ["Warlock"],
                damage_dice="1d10",
                damage_type="force",
                attack_type="ranged",
            ),
        )
        foe = _foe(duckdb_session, hp=500)
        st = arena.start(duckdb_session, pc.id, foe.id)
        blast = next(a for a in st.pc.attacks if a.name == "Eldritch Blast")
        assert blast.damage.startswith("2×")  # two beams at level 5
        hex_ = next(a for a in st.pc.attacks if a.name == "Hex")
        assert hex_.cost == "bonus"
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=hex_.key))
        assert st.marks == ["Hex"] and st.concentration == "Hex"
        hp = st.foe.hp
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=blast.key))
        beams = [line for line in st.log if line.who == "you" and "Eldritch Blast" in line.text]
        assert len(beams) == 2 and all("Hex" in (b.dice or "") for b in beams)
        assert hp - st.foe.hp == 2 * (20 + 3 + 12)  # (1d10 crit + CHA 3 + 1d6 crit) per beam

    def test_guiding_bolt_then_healing_word(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, dm = _pc(duckdb_session, CharacterClass.CLERIC, level=1)
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Guiding Bolt",
                1,
                ["Cleric"],
                damage_dice="4d6",
                damage_type="radiant",
                attack_type="ranged",
            ),
        )
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(duckdb_session, "Healing Word", 1, ["Cleric"], casting_time="Bonus Action"),
        )
        foe = _foe(duckdb_session, hp=500)
        st = arena.start(duckdb_session, pc.id, foe.id)
        bolt = next(a for a in st.pc.attacks if a.name == "Guiding Bolt")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=bolt.key))
        assert st.adv_next and st.pc.slots["1"] == 1
        st.pc.hp = 10
        arena._seal(st)
        word = next(a for a in st.pc.attacks if a.name == "Healing Word")
        assert word.cost == "bonus" and word.kind == "heal"
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=word.key))
        assert st.pc.hp == 10 + 8 + 3 and st.bonus_used  # 2d4 max + WIS 3

    def test_sleep_and_shield(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, dm = _pc(duckdb_session, CharacterClass.WIZARD, level=1, score_int=16)
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(duckdb_session, "Sleep", 1, ["Wizard"], save_ability="WIS"),
        )
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Shield",
                1,
                ["Wizard"],
                casting_time="Reaction, which you take when you are hit",
            ),
        )
        foe = _foe(duckdb_session, hp=20)
        st = arena.start(duckdb_session, pc.id, foe.id)
        assert "reaction:shield" in st.pc.feats
        sleep = next(a for a in st.pc.attacks if a.name == "Sleep")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=sleep.key))
        assert "asleep" in st.foe.conditions
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        assert any("asleep and does nothing" in line.text for line in st.log)
        # A melee hit on a sleeping foe is a critical and wakes it.
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="unarmed"))
        assert st.log[-1].crit and "asleep" not in st.foe.conditions
        # Shield: the foe's 12 vs AC 15 would miss anyway; 16 vs 15 is turned by +5.
        monkeypatch.setattr(
            arena, "_RNG", _Seq([12])
        )  # my (useless) roll, then foe d20 = 12 → 16 vs AC 15
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        foe_line = next(line for line in reversed(st.log) if line.who == "foe")
        assert "Shield (reaction" in foe_line.text and st.pc.hp == 30


class TestDruid:
    """Wild Shape: a catalog beast's attacks and AC over the druid's own HP."""

    def test_wild_shape_from_the_catalog(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, CharacterClass.DRUID, level=2)
        wolf = _foe(
            duckdb_session,
            hp=11,
            ac=13,
            ctype=CreatureType.BEAST,
            name="Wolf",
            cr="1/4",
            actions=[{"name": "Bite", "desc": "+4 to hit, 2d4+2 piercing"}],
        )
        foe = _foe(
            duckdb_session,
            hp=200,
            actions=[{"name": "Maul", "desc": "+9 to hit, 1d1+0 bludgeoning"}],
        )
        beasts = arena.list_beasts(duckdb_session, pc.id)
        assert any(b.id == wolf.id for b in beasts)
        st = arena.start(duckdb_session, pc.id, foe.id)
        st = arena.act(duckdb_session, st, ArenaAction(kind="wild_shape", key=str(wolf.id)))
        assert st.pc.beast and st.pc.beast.temp_hp == 2 and st.bonus_used
        bite = next(a for a in st.pc.attacks if a.key == "beast-0")
        assert bite.hit_bonus == 4 and bite.damage == "2d4+2"
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="beast-0"))
        assert st.stats.dealt > 0
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        # The 1-point maul hit (a crit at max faces: 2) chews the form's temp HP first.
        assert st.pc.hp == 30 and (st.pc.beast is None or st.pc.beast.temp_hp == 0)
