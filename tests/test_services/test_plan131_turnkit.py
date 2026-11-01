"""Plan 131 — the phone's turn kit (Now tab) for a PC on the 2014 rules.

A 2014 PC's kit follows SRD 5.1: the 2014 basic actions (Use an Object, no Influence,
Study or Utilize), Lay on Hands and Wild Shape as actions, Divine Smite as a no-action
rider from Paladin level 2, the d4 Martial Arts die and ki costs, no Innate Sorcery, and
the Dragonborn's ancestry breath (2d6, once per rest). A 2024 PC's kit is unchanged; the
2024 checks here pin a few of its numbers. Values are the SRD numbers, hard-coded.
"""

import uuid

import pytest
from sqlmodel import Session, delete, select

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.spell_repo import SpellRepo
from domain.character import CharacterFeature, CharacterSpell, CharacterSpellCreate, ClassFeature
from domain.enums import CharacterClass
from domain.spell import SpellCreate
from services import arena_service as arena
from services import feature_service, spellcasting_service

_C = CharacterClass
_MADE: list[tuple[uuid.UUID, str]] = []
_SPELLS: list[uuid.UUID] = []


@pytest.fixture(autouse=True)
def _tidy(duckdb_session: Session):
    """Delete this test's campaigns, spells and 2014 catalog rows; other suites see 2024 only."""
    yield
    db = duckdb_session
    db.rollback()
    while _MADE:
        cid, dm = _MADE.pop()
        try:
            camp_svc.delete_campaign(db, cid, dm)
        except Exception:  # noqa: BLE001 — best effort
            db.rollback()
    while _SPELLS:
        sid = _SPELLS.pop()
        try:
            db.exec(delete(CharacterSpell).where(CharacterSpell.spell_id == sid))
            db.commit()
            spell = SpellRepo.get_by_id(db, sid)
            if spell is not None:
                SpellRepo.delete(db, spell)
        except Exception:  # noqa: BLE001 — best effort
            db.rollback()
    ids = [r.id for r in db.exec(select(ClassFeature).where(ClassFeature.ruleset == "2014"))]
    if ids:
        db.exec(delete(CharacterFeature).where(CharacterFeature.feature_id.in_(ids)))
        db.commit()
        db.exec(delete(ClassFeature).where(ClassFeature.id.in_(ids)))
        db.commit()


def _pc(
    db: Session,
    cls: CharacterClass,
    level: int,
    ruleset: str = "2014",
    subclass=None,
    race: str = "Human",
    feats=None,
    **scores,
):
    """A PC in its own campaign on ``ruleset``, with its tracked features synced."""
    dm = f"p131a_{uuid.uuid4().hex[:6]}@example.com"
    campaign = camp_svc.create_campaign(db, name="C", dm_email=dm, ruleset=ruleset)
    _MADE.append((campaign.id, dm))
    base = dict(score_str=16, score_dex=14, score_con=14, score_int=10, score_wis=16, score_cha=16)
    base.update(scores)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Hero",
        race=race,
        character_class=cls,
        subclass=subclass,
        level=level,
        hp_max=40,
        hp_current=40,
        ac=16,
        speed=30,
        feats=feats,
        **base,
    )
    feature_service.sync_for_level(db, pc.id, dm)
    return pc, dm


def _kit(db: Session, pc, dm):
    """The phone's turn kit for this PC."""
    return arena.turn_kit(db, pc, dm)


def _all(kit):
    """Every option in the kit, whatever it costs."""
    return kit.action + kit.bonus + kit.reaction + kit.free


def _keys(options) -> set[str]:
    """The options' keys."""
    return {o.key for o in options}


def _row(db: Session, pc, dm, name: str):
    """The PC's tracked feature row with this name."""
    return next(
        r for r in feature_service.list_for_character(db, pc.id, dm) if r.feature_name == name
    )


def _learn_2014(db: Session, pc, dm, name: str, **kw):
    """Plant a 2014 catalog spell (removed afterwards) and learn it prepared."""
    spell = SpellRepo.create(
        db,
        SpellCreate(
            name=name,
            level=kw.pop("level", 1),
            school="Evocation",
            casting_time=kw.pop("casting_time", "1 action"),
            range="60 feet",
            duration="Instantaneous",
            description="x",
            source="SRD 5.1 (2014)",
            ruleset="2014",
            **kw,
        ),
    )
    _SPELLS.append(spell.id)
    spellcasting_service.learn_spell(
        db, pc.id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=True), dm
    )
    return spell


class TestBasicActions:
    """The "something else" list under the action."""

    def test_2014_has_use_an_object_and_no_2024_actions(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.FIGHTER, 1)
        basics = _kit(duckdb_session, pc, dm).basic_actions
        assert "Use an Object" in basics
        assert not {"Influence", "Study", "Utilize", "Magic"} & set(basics)
        assert basics == [
            "Dash",
            "Disengage",
            "Dodge",
            "Help",
            "Hide",
            "Ready",
            "Search",
            "Use an Object",
        ]

    def test_2024_keeps_its_actions(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.FIGHTER, 1, ruleset="2024")
        basics = _kit(duckdb_session, pc, dm).basic_actions
        assert {"Influence", "Study", "Utilize"} <= set(basics)
        assert "Use an Object" not in basics


class TestPaladin:
    """Lay on Hands is an action; Divine Smite is a no-action rider from level 2."""

    def test_lay_on_hands_is_an_action_with_its_pool(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, 2)
        kit = _kit(duckdb_session, pc, dm)
        assert "lay_on_hands" not in _keys(kit.bonus)
        loh = next(o for o in kit.action if o.key == "lay_on_hands")
        assert loh.note.startswith("Action:") and "10 of 10 left" in loh.note
        assert loh.uses_left == 10
        assert any(t.startswith("Lay on Hands is an action") for t in kit.tips)

    def test_divine_smite_rides_a_hit_with_a_slot_and_no_free_cast(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, 2)
        kit = _kit(duckdb_session, pc, dm)
        assert "divine_smite" not in _keys(kit.bonus + kit.action)
        smite = next(o for o in kit.free if o.key == "divine_smite")
        assert "hit with a melee weapon" in smite.note and "slot" in smite.note
        assert "no action" in smite.note and "5d8 at most" in smite.note
        assert smite.damage == "2d8" and smite.damage_type == "radiant"
        # 2024's Paladin's Smite (one cast with no slot) doesn't exist in 2014.
        assert "no slot" not in smite.note and "Long Rest" not in smite.note
        names = {
            r.feature_name for r in feature_service.list_for_character(duckdb_session, pc.id, dm)
        }
        assert "Paladin's Smite" not in names

    def test_level_one_has_no_smite(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, 1)
        assert "divine_smite" not in _keys(_all(_kit(duckdb_session, pc, dm)))

    def test_devotion_channel_divinity_is_an_action(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, 3, subclass="Oath of Devotion")
        cd = next(o for o in _kit(duckdb_session, pc, dm).action if o.key == "oath_channel")
        assert "Sacred Weapon" in cd.note and cd.uses_left == 1

    def test_2024_paladin_unchanged(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, 2, ruleset="2024")
        kit = _kit(duckdb_session, pc, dm)
        assert "lay_on_hands" in _keys(kit.bonus) and "divine_smite" in _keys(kit.bonus)


class TestMonk:
    """The 2014 Martial Arts die and ki costs."""

    def test_level_one_martial_arts_d4(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.MONK, 1, score_str=10, score_dex=16)
        kit = _kit(duckdb_session, pc, dm)
        fist = next(o for o in kit.action if o.key == "unarmed")
        assert fist.damage == "1d4+3"
        assert {"flurry", "patient_defense", "step_of_the_wind"}.isdisjoint(_keys(kit.bonus))
        assert "martial_bonus" in _keys(kit.bonus)

    def test_level_five_d6_and_ki_costs(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.MONK, 5, score_str=10, score_dex=16)
        kit = _kit(duckdb_session, pc, dm)
        fist = next(o for o in kit.action if o.key == "unarmed")
        assert fist.damage == "1d6+3"
        bonus = {o.key: o for o in kit.bonus}
        assert {"martial_bonus", "flurry", "patient_defense", "step_of_the_wind"} <= set(bonus)
        assert bonus["patient_defense"].note.startswith("1 ki point")
        assert "Dash or Disengage" in bonus["step_of_the_wind"].note
        # Each ki option shows how many times the pool can still pay: 5 ki at level 5.
        assert bonus["flurry"].uses_left == 5
        stun = next(o for o in kit.free if o.key == "stunning_strike")
        assert "1 ki point" in stun.note and stun.uses_left == 5
        feature_service.spend_use(duckdb_session, _row(duckdb_session, pc, dm, "Ki").id, dm, 2)
        bonus = {o.key: o for o in _kit(duckdb_session, pc, dm).bonus}
        assert bonus["patient_defense"].uses_left == 3

    def test_higher_dice(self, duckdb_session: Session):
        for level, die in ((11, "1d8"), (17, "1d10")):
            pc, dm = _pc(duckdb_session, _C.MONK, level, score_str=10, score_dex=16)
            fist = next(o for o in _kit(duckdb_session, pc, dm).action if o.key == "unarmed")
            assert fist.damage.startswith(die)

    def test_2024_monk_unchanged(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.MONK, 1, ruleset="2024", score_str=10, score_dex=16)
        fist = next(o for o in _kit(duckdb_session, pc, dm).action if o.key == "unarmed")
        assert fist.damage == "1d6+3"


class TestSorcerer:
    """No Innate Sorcery; Font of Magic from level 2; Quickened Spell only if known."""

    def test_level_three_kit(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.SORCERER, 3, subclass="Draconic Bloodline")
        kit = _kit(duckdb_session, pc, dm)
        keys = _keys(_all(kit))
        assert "innate_sorcery" not in keys and "tides_of_chaos" not in keys
        assert {"create_slot", "convert_slot"} <= _keys(kit.bonus)
        make = next(o for o in kit.bonus if o.key == "create_slot")
        assert make.note.startswith("Bonus action") and "level 5 costs 7" in make.note
        assert "quicken" not in keys  # no Metamagic: Quickened Spell on the sheet

    def test_font_of_magic_starts_at_two(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.SORCERER, 1)
        keys = _keys(_all(_kit(duckdb_session, pc, dm)))
        assert not {"create_slot", "convert_slot", "innate_sorcery"} & keys

    def test_quickened_spell_costs_two_points(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.SORCERER, 3, feats=["Metamagic: Quickened Spell"])
        quick = next(o for o in _kit(duckdb_session, pc, dm).free if o.key == "quicken")
        assert quick.note.startswith("2 sorcery points")
        assert quick.uses_left == 1  # 3 sorcery points pay for one

    def test_2024_sorcerer_unchanged(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.SORCERER, 3, ruleset="2024")
        assert "innate_sorcery" in _keys(_kit(duckdb_session, pc, dm).bonus)


class TestDragonborn:
    """The breath follows the ancestry: area, save, 2d6 and once per rest."""

    def test_blue_is_a_line_with_a_dex_save(self, duckdb_session: Session):
        pc, dm = _pc(
            duckdb_session, _C.FIGHTER, 1, race="Dragonborn", feats=["Draconic Ancestry: Blue"]
        )
        kit = _kit(duckdb_session, pc, dm)
        breath = next(o for o in kit.action if o.key == "breath_weapon")
        assert breath.name == "Breath Weapon (lightning)"
        assert breath.damage == "2d6" and breath.damage_type == "lightning"
        assert breath.save == "DC 12 Dexterity"  # 8 + CON 2 + proficiency 2
        assert "5 by 30 ft. line" in breath.note
        assert "Once per short or long rest" in breath.note
        # The phone needs no separate counter row for it.
        assert [o.key for o in _all(kit)].count("breath_weapon") == 1

    def test_green_is_a_cone_with_a_con_save_and_dice_scale(self, duckdb_session: Session):
        pc, dm = _pc(
            duckdb_session, _C.FIGHTER, 6, race="Dragonborn", feats=["Draconic Ancestry: Green"]
        )
        breath = next(o for o in _kit(duckdb_session, pc, dm).action if o.key == "breath_weapon")
        assert breath.damage == "3d6" and breath.damage_type == "poison"
        assert breath.save == "DC 13 Constitution" and "15 ft. cone" in breath.note

    def test_no_ancestry_falls_back_to_red(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.FIGHTER, 16, race="Dragonborn")
        breath = next(o for o in _kit(duckdb_session, pc, dm).action if o.key == "breath_weapon")
        assert breath.damage == "5d6" and breath.damage_type == "fire"
        assert "15 ft. cone" in breath.note and "Dexterity" in breath.save


class TestOtherClasses:
    """Wild Shape, Channel Divinity, Rage, the Rogue and the Fighter."""

    def test_druid_wild_shape_is_an_action(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.DRUID, 2)
        kit = _kit(duckdb_session, pc, dm)
        assert "wild_shape" not in _keys(kit.bonus)
        ws = next(o for o in kit.action if o.key == "wild_shape")
        assert ws.note.startswith("Action") and ws.uses_left == 2

    def test_cleric_channel_divinity_is_turn_undead_not_divine_spark(self, duckdb_session):
        pc, dm = _pc(duckdb_session, _C.CLERIC, 2, subclass="Life Domain")
        kit = _kit(duckdb_session, pc, dm)
        assert "divine_spark" not in _keys(_all(kit))
        cd = next(o for o in kit.action if o.key == "channel_divinity")
        assert "Turn Undead" in cd.note and "Preserve Life" in cd.note and cd.uses_left == 1

    def test_rage_damage_grows_and_is_unlimited_at_twenty(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.BARBARIAN, 9)
        kit = _kit(duckdb_session, pc, dm)
        rage = next(o for o in kit.bonus if o.key == "rage")
        assert "+3 damage" in rage.note and rage.uses_left == 4
        assert "reckless" in _keys(kit.free)
        pc, dm = _pc(duckdb_session, _C.BARBARIAN, 20)
        rage = next(o for o in _kit(duckdb_session, pc, dm).bonus if o.key == "rage")
        assert "+4 damage" in rage.note and rage.uses_left == 99  # no counter shown

    def test_rogue_has_cunning_action_and_no_2024_extras(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.ROGUE, 3, subclass="Thief")
        kit = _kit(duckdb_session, pc, dm)
        assert kit.bonus[0].key == "cunning_action"
        assert not {"steady_aim", "cunning_dodge"} & _keys(_all(kit))

    def test_fighter_second_wind_and_action_surge(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.FIGHTER, 2)
        kit = _kit(duckdb_session, pc, dm)
        assert "second_wind" in _keys(kit.bonus) and "action_surge" in _keys(kit.free)

    def test_lore_bard_cutting_words_die_grows(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.BARD, 5, subclass="College of Lore")
        words = next(o for o in _kit(duckdb_session, pc, dm).reaction if o.key == "cutting_words")
        assert "d8" in words.note


class TestSpells:
    """2014 heal dice, the "1 bonus action" casting time and 2014 upcast wording."""

    def test_heal_dice_are_2014_numbers(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.CLERIC, 5)
        assert arena.heal_dice(pc, "Cure Wounds", 1) == "1d8+3"
        assert arena.heal_dice(pc, "Cure Wounds", 1, 3) == "3d8+3"
        assert arena.heal_dice(pc, "Healing Word", 1, 2) == "2d4+3"
        assert arena.heal_dice(pc, "Mass Cure Wounds", 5) == "3d8+3"
        old, dm24 = _pc(duckdb_session, _C.CLERIC, 5, ruleset="2024")
        assert arena.heal_dice(old, "Cure Wounds", 1) == "2d8+3"

    def test_kit_spells(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.CLERIC, 3)
        _learn_2014(duckdb_session, pc, dm, "Healing Word", casting_time="1 bonus action")
        _learn_2014(
            duckdb_session,
            pc,
            dm,
            "Burning Hands",
            damage_dice="3d6",
            damage_type="fire",
            save_ability="DEX",
            higher_levels="When you cast this spell using a spell slot of 2nd level or higher, "
            "the damage increases by 1d6 for each slot level above 1st.",
        )
        kit = _kit(duckdb_session, pc, dm)
        word = next(o for o in kit.bonus if o.name == "Healing Word")
        assert word.damage == "1d4+3" and "+1d4 per slot level up" in word.note
        hands = next(o for o in kit.action if o.name == "Burning Hands")
        assert hands.damage == "3d6" and "+1d6 per slot level up" in hands.note
        assert any(t.startswith("Cast a spell as a bonus action") for t in kit.tips)

    def test_agonizing_blast_needs_the_invocation(self, duckdb_session: Session):
        def blast(feats):
            pc, dm = _pc(duckdb_session, _C.WARLOCK, 2, feats=feats)
            _learn_2014(
                duckdb_session,
                pc,
                dm,
                "Eldritch Blast",
                level=0,
                damage_dice="1d10",
                damage_type="force",
                attack_type="ranged",
            )
            return next(
                o for o in _kit(duckdb_session, pc, dm).action if o.name == "Eldritch Blast"
            )

        assert blast(None).damage == "1×1d10"
        assert blast(["Eldritch Invocation: Agonizing Blast"]).damage == "1×1d10+3"


class TestArena:
    """The admin-only Arena stays 2024-flavoured, but a 2014 sheet builds and starts."""

    def test_every_class_builds(self, duckdb_session: Session):
        for cls in (_C.BARBARIAN, _C.BARD, _C.CLERIC, _C.DRUID, _C.FIGHTER, _C.MONK):
            pc, dm = _pc(duckdb_session, cls, 5)
            assert arena._build_pc(duckdb_session, pc, dm).level == 5
        for cls in (_C.PALADIN, _C.RANGER, _C.ROGUE, _C.SORCERER, _C.WARLOCK, _C.WIZARD):
            pc, dm = _pc(duckdb_session, cls, 5, race="Dragonborn")
            apc = arena._build_pc(duckdb_session, pc, dm)
            assert not apc.wild_magic and any(a.key == "breath_weapon" for a in apc.attacks)
