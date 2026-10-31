"""Characters complete for their level: the class-feature catalog, its seeding and the turn kit.

Plan 128 (persona run 3, Marco and Nina): a level-5 Paladin from the builder had "No features
learned yet" because the catalog seed only ran on an empty table, Lay on Hands never reached
the phone, Divine Smite was offered at level 1 unprepared, and Cure Wounds read "force".
"""

import uuid

import pytest
from sqlmodel import Session, delete

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.class_feature_repo import CharacterFeatureRepo, ClassFeatureRepo
from domain.character import CharacterFeature, ClassFeature, PlayerCharacterUpdate
from domain.enums import CharacterClass, RecoveryType, UsesFormula
from integrations.dnd_rules import levelup_2024 as rules
from integrations.dnd_rules.class_features_2024 import (
    _FALLBACK_NOTE,
    CLASS_FEATURES_2024,
    NON_SRD_SUBCLASSES,
    canonical_subclass,
    feature_note,
    features_for_level,
)
from services import arena_service as arena
from services import feature_service
from tests.test_services.test_arena_rules import (  # noqa: F401 — fixtures
    _MADE,
    _learn,
    _owners_table,
    _pc,
    _spell,
    _tidy,
)

_C = CharacterClass


def _wipe_catalog(db: Session) -> None:
    """Empty both feature tables (children first: DuckDB checks FKs per statement)."""
    db.exec(delete(CharacterFeature))
    db.commit()
    db.exec(delete(ClassFeature))
    db.commit()


def _bare_pc(db: Session, cls: CharacterClass, level: int, subclass=None, **scores):
    """A PC made the plain way (no feature sync), in its own campaign."""
    dm = f"p128_{uuid.uuid4().hex[:6]}@example.com"
    campaign = camp_svc.create_campaign(db, name="C", setting="R", tone="T", dm_email=dm)
    _MADE.append((campaign.id, dm))
    base = dict(score_str=16, score_dex=12, score_con=14, score_int=10, score_wis=14, score_cha=16)
    base.update(scores)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Corwin",
        race="Dwarf",
        character_class=cls,
        subclass=subclass,
        level=level,
        hp_max=49,
        hp_current=49,
        ac=18,
        speed=30,
        **base,
    )
    return pc, dm


def _names(db: Session, pc, dm) -> dict[str, object]:
    return {r.feature_name: r for r in feature_service.list_for_character(db, pc.id, dm)}


# ── The catalog itself ────────────────────────────────────────────────────


# (class, name, level gained, {character level: max uses}) for the 2024 counters.
_EXPECTED = [
    (_C.BARBARIAN, "Rage", 1, {1: 2, 3: 3, 6: 4, 12: 5, 17: 6}),
    (_C.BARBARIAN, "Persistent Rage", 15, {15: 1}),
    (_C.BARD, "Bardic Inspiration", 1, {1: 3}),  # CHA 16
    (_C.CLERIC, "Channel Divinity", 2, {2: 2, 6: 3, 18: 4}),
    (_C.CLERIC, "Divine Intervention", 10, {10: 1}),
    (_C.DRUID, "Wild Shape", 2, {2: 2, 6: 3, 17: 4}),
    (_C.DRUID, "Wild Resurgence", 5, {5: 1}),
    (_C.FIGHTER, "Second Wind", 1, {1: 2, 4: 3, 10: 4}),
    (_C.FIGHTER, "Action Surge", 2, {2: 1, 16: 1, 17: 2}),
    (_C.FIGHTER, "Indomitable", 9, {9: 1, 13: 2, 17: 3}),
    (_C.MONK, "Focus Points (Ki)", 2, {2: 2, 10: 10}),
    (_C.MONK, "Uncanny Metabolism", 2, {2: 1}),
    (_C.PALADIN, "Lay on Hands", 1, {1: 5, 5: 25, 20: 100}),
    (_C.PALADIN, "Paladin's Smite", 2, {2: 1}),
    (_C.PALADIN, "Channel Divinity (Paladin)", 3, {3: 2, 10: 2, 11: 3}),
    (_C.PALADIN, "Faithful Steed", 5, {5: 1}),
    (_C.RANGER, "Favored Enemy", 1, {1: 2, 5: 3, 9: 4, 13: 5, 17: 6}),
    (_C.RANGER, "Tireless", 10, {10: 2}),  # WIS 14
    (_C.RANGER, "Nature's Veil", 14, {14: 2}),
    (_C.ROGUE, "Stroke of Luck", 20, {20: 1}),
    (_C.SORCERER, "Innate Sorcery", 1, {1: 2}),
    (_C.SORCERER, "Sorcery Points", 2, {2: 2, 9: 9}),
    (_C.SORCERER, "Sorcerous Restoration", 5, {5: 1}),
    (_C.WARLOCK, "Magical Cunning", 2, {2: 1}),
    (_C.WARLOCK, "Contact Patron", 9, {9: 1}),
    (_C.WARLOCK, "Mystic Arcanum (6th level)", 11, {11: 1}),
    (_C.WARLOCK, "Mystic Arcanum (9th level)", 17, {17: 1}),
    (_C.WIZARD, "Arcane Recovery", 1, {1: 1}),
    (_C.WIZARD, "Signature Spells", 20, {20: 2}),
]


class _Stub:
    """Just enough of a PC for the max-uses maths."""

    def __init__(self, cls, level):
        self.character_class = cls
        self.level = level
        self.score_str = self.score_con = 14
        self.score_dex = self.score_int = 10
        self.score_wis = 14
        self.score_cha = 16


@pytest.mark.parametrize("cls,name,gained,uses", _EXPECTED)
def test_the_catalog_has_the_2024_counters(cls, name, gained, uses):
    """Every SRD class's limited-use features, at the right level, with the right uses."""
    row = next(
        (p for p in CLASS_FEATURES_2024 if p.name == name and p.character_class == cls), None
    )
    assert row is not None, f"{cls.value}: {name} missing"
    assert row.level_acquired == gained
    feature = ClassFeature.model_validate(row)
    for level, expected in uses.items():
        assert feature_service.max_uses_for(feature, _Stub(cls, level)) == expected, (
            name,
            level,
        )


def test_rest_rules_follow_2024():
    """Rage and Wild Shape give back one use on a Short Rest (2024), not none or all."""
    by_name = {(p.character_class, p.name): p for p in CLASS_FEATURES_2024}
    assert by_name[(_C.BARBARIAN, "Rage")].recovery == RecoveryType.SHORT_ONE
    assert by_name[(_C.DRUID, "Wild Shape")].recovery == RecoveryType.SHORT_ONE
    assert by_name[(_C.FIGHTER, "Action Surge")].recovery == RecoveryType.SHORT
    assert not any(p.name == "Song of Rest" for p in CLASS_FEATURES_2024)  # a 2014 feature


def test_catalog_rows_are_unique_and_subclasses_are_known():
    """No duplicate identities; every subclass row names an SRD subclass (or a personal one)."""
    keys = [(p.name, p.character_class, p.subclass) for p in CLASS_FEATURES_2024]
    assert len(keys) == len(set(keys))
    for p in CLASS_FEATURES_2024:
        if p.subclass:
            assert p.subclass in rules.SUBCLASS_LEVEL_FEATURES or p.subclass in NON_SRD_SUBCLASSES


# Catalog names that differ from the SRD table's spelling of the same feature.
_TABLE_NAME = {
    "Focus Points (Ki)": "Monk's Focus",
    "Sorcery Points": "Font of Magic",
    "Font of Magic — Slot Conversion": "Font of Magic",
    "Channel Divinity (Paladin)": "Channel Divinity",
    "Lay on Hands": "Lay On Hands",
    "Nature Magician": "Archdruid",
    "Natural Recovery (free spell)": "Natural Recovery",
    "Natural Recovery (slots)": "Natural Recovery",
    "Cunning Strike (Withdraw / Trip / Poison)": "Cunning Strike",
}


def test_srd_catalog_rows_match_the_class_tables():
    """Each SRD row arrives at the level its class (or subclass) table says it does."""
    for p in CLASS_FEATURES_2024:
        if p.subclass in NON_SRD_SUBCLASSES:
            continue
        name = _TABLE_NAME.get(p.name, p.name)
        cls = p.character_class.value
        table = (
            rules.SUBCLASS_LEVEL_FEATURES[p.subclass]
            if p.subclass
            else rules.CLASS_LEVEL_FEATURES[cls]
        )
        assert name in table.get(p.level_acquired, []), (cls, p.name, p.level_acquired)


# ── Seeding a partial catalog (the root cause) ────────────────────────────


class TestSeeding:
    """The startup seed fills in whatever a database is missing, and grants it."""

    def test_two_planted_rows_no_longer_block_the_rest(self, duckdb_session: Session):
        """Migration 0036's two rows used to make the seed skip; now the rest arrive."""
        _wipe_catalog(duckdb_session)
        for p in CLASS_FEATURES_2024:
            if p.name in ("Psionic Energy Dice", "Star Map — Free Guiding Bolt"):
                ClassFeatureRepo.create(duckdb_session, p)
        out = feature_service.seed_and_backfill(duckdb_session, CLASS_FEATURES_2024)
        assert out["inserted"] == len(CLASS_FEATURES_2024) - 2
        assert len(ClassFeatureRepo.list_all(duckdb_session)) == len(CLASS_FEATURES_2024)
        again = feature_service.seed_and_backfill(duckdb_session, CLASS_FEATURES_2024)
        assert again == {"inserted": 0, "granted": 0}

    def test_new_rows_reach_existing_characters_once(self, duckdb_session: Session):
        """Corwin, made while the catalog was partial, gets his Paladin features at startup."""
        _wipe_catalog(duckdb_session)
        pc, dm = _bare_pc(duckdb_session, _C.PALADIN, 5)
        assert feature_service.list_for_character(duckdb_session, pc.id, dm) == []

        out = feature_service.seed_and_backfill(duckdb_session, CLASS_FEATURES_2024)
        assert out["granted"] >= 4
        have = _names(duckdb_session, pc, dm)
        assert {
            "Lay on Hands",
            "Paladin's Smite",
            "Channel Divinity (Paladin)",
            "Faithful Steed",
        } <= set(have)
        assert have["Lay on Hands"].max_uses == 25

        # A feature the DM removed on purpose doesn't come back on the next restart.
        feature_service.forget_feature(duckdb_session, have["Faithful Steed"].id, dm)
        feature_service.seed_and_backfill(duckdb_session, CLASS_FEATURES_2024)
        assert "Faithful Steed" not in _names(duckdb_session, pc, dm)

    def test_formula_and_recovery_follow_the_rules_module(self, duckdb_session: Session):
        """An old row (Rage on a Long Rest only) is corrected in place, keeping its id."""
        _wipe_catalog(duckdb_session)
        rage = next(p for p in CLASS_FEATURES_2024 if p.name == "Rage")
        old = ClassFeatureRepo.create(
            duckdb_session, rage.model_copy(update={"recovery": RecoveryType.LONG})
        )
        feature_service.seed_catalog(duckdb_session, CLASS_FEATURES_2024)
        duckdb_session.expire_all()
        row = ClassFeatureRepo.get_by_id(duckdb_session, old.id)
        assert row is not None and row.recovery == RecoveryType.SHORT_ONE
        assert row.uses_formula == UsesFormula.RAGE


# ── Builder / level-up sync ───────────────────────────────────────────────


class TestSync:
    """sync_for_level grants the full set even on a catalog that is empty."""

    def test_paladin_five_from_an_empty_catalog(self, duckdb_session: Session):
        _wipe_catalog(duckdb_session)
        pc, dm = _bare_pc(duckdb_session, _C.PALADIN, 5)
        granted = feature_service.sync_for_level(duckdb_session, pc.id, dm)
        assert set(granted) == {
            "Lay on Hands",
            "Paladin's Smite",
            "Channel Divinity (Paladin)",
            "Faithful Steed",
        }
        assert feature_service.sync_for_level(duckdb_session, pc.id, dm) == []

    def test_level_up_grants_the_next_rows(self, duckdb_session: Session):
        """A level-1 Sorcerer has Innate Sorcery; level 2 adds Sorcery Points."""
        pc, dm = _bare_pc(duckdb_session, _C.SORCERER, 1)
        assert feature_service.sync_for_level(duckdb_session, pc.id, dm) == ["Innate Sorcery"]
        char_svc.update_character(duckdb_session, pc.id, dm, PlayerCharacterUpdate(level=2))
        have = _names(duckdb_session, pc, dm)
        assert {"Innate Sorcery", "Sorcery Points", "Magical Cunning"} & set(have) == {
            "Innate Sorcery",
            "Sorcery Points",
        }

    @pytest.mark.parametrize(
        "cls,written,level,expected",
        [
            (_C.BARBARIAN, "Path of the Berserker", 14, "Intimidating Presence"),
            (_C.WIZARD, "School of Evocation", 14, "Overchannel"),
            (_C.WARLOCK, "The Fiend", 6, "Dark One's Own Luck"),
            (_C.SORCERER, "Draconic Bloodline", 14, "Dragon Wings"),
            (_C.MONK, "Way of the Open Hand", 6, "Wholeness of Body"),
        ],
    )
    def test_subclass_however_it_was_written(
        self, duckdb_session: Session, cls, written, level, expected
    ):
        """'Path of the Berserker' is the Berserker; its rows are granted."""
        pc, dm = _bare_pc(duckdb_session, cls, level, subclass=written)
        assert expected in feature_service.sync_for_level(duckdb_session, pc.id, dm)

    def test_other_subclass_rows_stay_out(self, duckdb_session: Session):
        pc, dm = _bare_pc(duckdb_session, _C.WIZARD, 14, subclass="School of Divination")
        assert "Overchannel" not in feature_service.sync_for_level(duckdb_session, pc.id, dm)

    def test_canonical_subclass(self):
        assert canonical_subclass(_C.PALADIN, "Oath of Devotion") == "Oath of Devotion"
        assert canonical_subclass("paladin", "devotion") == "Oath of Devotion"
        assert canonical_subclass(_C.PALADIN, "Oath of Vengeance") is None
        assert canonical_subclass(_C.PALADIN, "") is None


# ── Pools ─────────────────────────────────────────────────────────────────


def test_lay_on_hands_is_a_pool_spent_in_any_amount(duckdb_session: Session):
    """25 points at level 5; a 7-point heal spends 7; spending clamps at the pool."""
    pc, dm = _bare_pc(duckdb_session, _C.PALADIN, 5)
    feature_service.sync_for_level(duckdb_session, pc.id, dm)
    loh = _names(duckdb_session, pc, dm)["Lay on Hands"]
    assert loh.max_uses == 25
    after = feature_service.spend_use(duckdb_session, loh.id, dm, amount=7)
    assert after.uses_spent == 7
    after = feature_service.restore_use(duckdb_session, loh.id, dm, amount=2)
    assert after.uses_spent == 5
    after = feature_service.spend_use(duckdb_session, loh.id, dm, amount=99)
    assert after.uses_spent == 25
    assert feature_service.spend_use(duckdb_session, loh.id, dm).uses_spent == 25


# ── Every feature at a level ──────────────────────────────────────────────


def test_paladin_five_lists_its_passive_features():
    """Extra Attack, Weapon Mastery, Fighting Style: the things the builder preview promised."""
    rows = features_for_level(_C.PALADIN, "", 5, {"cha": 3})
    names = [r["name"] for r in rows]
    for want in (
        "Lay on Hands",
        "Weapon Mastery",
        "Fighting Style",
        "Paladin's Smite",
        "Channel Divinity",
        "Extra Attack",
        "Faithful Steed",
    ):
        assert want in names
    assert "Ability Score Improvement" not in names
    assert all(set(r) == {"name", "level", "source", "note"} for r in rows)
    loh = next(r for r in rows if r["name"] == "Lay on Hands")
    assert "25 hit points" in loh["note"]
    cd = next(r for r in rows if r["name"] == "Channel Divinity")
    assert cd["note"].startswith("2 uses")
    # No subclass yet: the sheet says so instead of inventing one.
    pick = next(r for r in rows if r["name"] == "Paladin Subclass")
    assert "None is on this sheet yet" in pick["note"] and pick["level"] == 3
    assert [r["level"] for r in rows] == sorted(r["level"] for r in rows)


def test_subclass_features_and_replacements():
    """Devotion's features join the list; a level-11 Fighter shows Two Extra Attacks only."""
    rows = features_for_level(_C.PALADIN, "Oath of Devotion", 7)
    subs = {r["name"] for r in rows if r["source"] == "subclass"}
    assert subs == {"Oath of Devotion Spells", "Sacred Weapon", "Aura of Devotion"}
    fighter = [r["name"] for r in features_for_level(_C.FIGHTER, "Champion", 17)]
    assert "Two Extra Attacks" in fighter and "Extra Attack" not in fighter
    assert "Indomitable (two uses)" not in fighter
    indomitable = next(
        r for r in features_for_level(_C.FIGHTER, "", 17) if r["name"] == "Indomitable"
    )
    assert "3 uses" in indomitable["note"]
    custom = features_for_level(_C.PALADIN, "Oath of Vengeance", 7)
    assert {"Oath of Vengeance", "Oath of Vengeance feature"} <= {r["name"] for r in custom}


def test_every_srd_feature_has_a_note():
    """No feature in the SRD tables falls back to "see your book"."""
    skip = {"Ability Score Improvement", "Epic Boon", "Subclass feature"}
    for cls, table in rules.CLASS_LEVEL_FEATURES.items():
        for names in table.values():
            for name in names:
                if name in skip or name.endswith(" Subclass") or "uses)" in name:
                    continue
                assert feature_note(cls, name, 20) != _FALLBACK_NOTE, (cls, name)
    for sub, table in rules.SUBCLASS_LEVEL_FEATURES.items():
        for names in table.values():
            for name in names:
                assert feature_note("", name, 20) != _FALLBACK_NOTE, (sub, name)


# ── The turn kit (the phone's Now screen) ─────────────────────────────────


def _kit(db, pc, dm):
    return arena.turn_kit(db, pc, dm)


def _all(kit):
    return kit.action + kit.bonus + kit.reaction + kit.free


class TestTurnKit:
    """What the phone offers on a turn, checked against Nina's and Marco's sheets."""

    def test_level_one_paladin_has_no_smite_unless_prepared(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, level=1)
        assert not any(o.key == "divine_smite" for o in _all(_kit(duckdb_session, pc, dm)))
        smite = _spell(duckdb_session, "Divine Smite", 1, ["Paladin"], casting_time="Bonus Action")
        _learn(duckdb_session, pc, dm, smite)
        assert any(o.key == "divine_smite" for o in _kit(duckdb_session, pc, dm).bonus)

    def test_level_two_paladin_always_has_smite(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, level=2)
        smite = next(o for o in _kit(duckdb_session, pc, dm).bonus if o.key == "divine_smite")
        assert "no slot (1 left)" in smite.note

    def test_lay_on_hands_is_a_bonus_action_with_its_pool(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, level=1)
        loh = next(o for o in _kit(duckdb_session, pc, dm).bonus if o.key == "lay_on_hands")
        assert loh.uses_left == 5 and "5 of 5 left" in loh.note
        row = _names(duckdb_session, pc, dm)["Lay on Hands"]
        feature_service.spend_use(duckdb_session, row.id, dm, amount=3)
        loh = next(o for o in _kit(duckdb_session, pc, dm).bonus if o.key == "lay_on_hands")
        assert loh.uses_left == 2
        # The Arena still spends it 5 at a time: 2 points left is no full use.
        st = arena._build_pc(duckdb_session, pc, dm)
        assert next(f for f in st.features if f.key == "lay_on_hands").uses_left == 0

    def test_cure_wounds_heals_it_does_not_deal_force(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, level=1, score_cha=16)
        _learn(duckdb_session, pc, dm, _spell(duckdb_session, "Cure Wounds", 1, ["Paladin"]))
        cure = next(o for o in _kit(duckdb_session, pc, dm).action if o.name == "Cure Wounds")
        assert cure.damage == "2d8+3" and cure.damage_type == "healing" and cure.kind == "heal"

    def test_a_javelin_shows_once(self, duckdb_session: Session):
        from tests.test_services.test_plan101_thrown import JAVELIN, _give

        pc, dm = _pc(duckdb_session, _C.PALADIN, level=3, score_str=16)
        _give(duckdb_session, pc, dm, **JAVELIN)
        kit = _kit(duckdb_session, pc, dm)
        javelins = [o for o in kit.action if o.name.startswith("Javelin")]
        assert len(javelins) == 1
        assert "or throw it, 30/120 ft" in javelins[0].note and "no smite" in javelins[0].note
        # The Arena keeps both: only the swing smites.
        st = arena._build_pc(duckdb_session, pc, dm)
        assert {a.name for a in st.attacks} >= {"Javelin", "Javelin (thrown)"}

    def test_uses_left_come_from_the_sheet(self, duckdb_session: Session):
        """Innate Sorcery spent once on the sheet shows 1 left on the phone, not the model's 2."""
        pc, dm = _pc(duckdb_session, _C.SORCERER, level=1)
        row = _names(duckdb_session, pc, dm)["Innate Sorcery"]
        feature_service.spend_use(duckdb_session, row.id, dm)
        innate = next(o for o in _kit(duckdb_session, pc, dm).bonus if o.name == "Innate Sorcery")
        assert innate.uses_left == 1


# ── Casting a heal from the phone ─────────────────────────────────────────


def test_heal_dice_for_the_phone(duckdb_session: Session):
    """Cure Wounds at 1st: 2d8+3; at 2nd: 4d8+3; a damage spell has none."""
    pc, _dm = _bare_pc(duckdb_session, _C.PALADIN, 5, score_cha=16)
    assert arena.heal_dice(pc, "Cure Wounds", 1) == "2d8+3"
    assert arena.heal_dice(pc, "Cure Wounds", 1, 2) == "4d8+3"
    assert arena.heal_dice(pc, "Healing Word", 1, 3) == "6d4+3"
    assert arena.heal_dice(pc, "Mass Healing Word", 3, 4) == "3d4+3"
    assert arena.heal_dice(pc, "Heal", 6, 7) == "80"
    assert arena.heal_dice(pc, "Fire Bolt", 0) is None


def test_cast_spell_returns_heal_dice(duckdb_session: Session, monkeypatch):
    """player_service.cast_spell hands the phone the heal to roll."""
    from services import player_service, spellcasting_service

    pc, dm = _pc(duckdb_session, _C.PALADIN, level=3, score_cha=16)
    cure = _spell(duckdb_session, "Cure Wounds", 1, ["Paladin"])
    _learn(duckdb_session, pc, dm, cure)
    row = next(
        r
        for r in spellcasting_service.list_known_for_character(duckdb_session, pc.id, dm)
        if r.spell_id == cure.id
    )
    out = player_service.cast_spell(duckdb_session, pc.id, row.id, slot_level=1)
    assert out["heal_dice"] == "2d8+3" and out["slot_level"] == 1
    feature_rows = CharacterFeatureRepo.list_for_character(duckdb_session, pc.id)
    assert feature_rows  # the sync gave this Paladin its features
