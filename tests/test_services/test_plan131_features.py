"""Plan 131 — the 2014 rules' class trackers, their catalog and the 2014 rests.

A campaign on the 2014 rules seeds and grants the SRD 5.1 counters (Rage 2 at level 1,
Channel Divinity 1 with a short rest bringing back every use, Second Wind 1, Divine
Sense 1 + CHA...). The catalog keeps both editions side by side, and a PC only ever gets
its own edition's rows. Values are the SRD 5.1 numbers, hard-coded (the dataset isn't
in the repo).
"""

import uuid

import pytest
from sqlmodel import Session, delete, select

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.class_feature_repo import CharacterFeatureRepo, ClassFeatureRepo
from domain.character import CharacterFeature, ClassFeature, PlayerCharacterUpdate
from domain.enums import CharacterClass, RecoveryType, UsesFormula
from integrations.dnd_rules import rulesets
from integrations.dnd_rules.class_features_2014 import CLASS_FEATURES_2014, SOURCE_2014
from integrations.dnd_rules.class_features_2024 import CLASS_FEATURES_2024
from services import feature_service, rest_service

_C = CharacterClass
_MADE: list[tuple[uuid.UUID, str]] = []


@pytest.fixture(autouse=True)
def _tidy(duckdb_session: Session):
    """Delete this test's campaigns and the 2014 catalog rows, so other suites see 2024 only."""
    yield
    duckdb_session.rollback()
    while _MADE:
        cid, dm = _MADE.pop()
        try:
            camp_svc.delete_campaign(duckdb_session, cid, dm)
        except Exception:  # noqa: BLE001 — best effort
            duckdb_session.rollback()
    ids = [
        r.id
        for r in duckdb_session.exec(select(ClassFeature).where(ClassFeature.ruleset == "2014"))
    ]
    if ids:
        duckdb_session.exec(delete(CharacterFeature).where(CharacterFeature.feature_id.in_(ids)))
        duckdb_session.commit()
        duckdb_session.exec(delete(ClassFeature).where(ClassFeature.id.in_(ids)))
        duckdb_session.commit()


def _wipe_catalog(db: Session) -> None:
    """Empty both feature tables (children first: DuckDB checks FKs per statement)."""
    db.exec(delete(CharacterFeature))
    db.commit()
    db.exec(delete(ClassFeature))
    db.commit()


def _pc(db: Session, cls: CharacterClass, level: int, ruleset="2014", subclass=None, **scores):
    """A PC in its own campaign on ``ruleset``, with its tracked features synced."""
    dm = f"p131f_{uuid.uuid4().hex[:6]}@example.com"
    campaign = camp_svc.create_campaign(db, name="C", dm_email=dm, ruleset=ruleset)
    _MADE.append((campaign.id, dm))
    base = dict(score_str=16, score_dex=12, score_con=14, score_int=10, score_wis=14, score_cha=16)
    base.update(scores)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Hero",
        race="Human",
        character_class=cls,
        subclass=subclass,
        level=level,
        hp_max=40,
        hp_current=40,
        ac=16,
        speed=30,
        **base,
    )
    feature_service.sync_for_level(db, pc.id, dm)
    return pc, dm


def _have(db: Session, pc, dm) -> dict[str, object]:
    """The PC's tracked features by name."""
    return {r.feature_name: r for r in feature_service.list_for_character(db, pc.id, dm)}


def _editions(db: Session, pc) -> set[str]:
    """The rulesets of every catalog row the PC holds."""
    out = set()
    for row in CharacterFeatureRepo.list_for_character(db, pc.id):
        out.add(ClassFeatureRepo.get_by_id(db, row.feature_id).ruleset)
    return out


# ── The catalog itself ────────────────────────────────────────────────────


class _Stub:
    """Just enough of a PC for the max-uses maths (CHA 16, WIS 14)."""

    ruleset = "2014"

    def __init__(self, cls, level):
        self.character_class = cls
        self.level = level
        self.score_str = self.score_con = self.score_wis = 14
        self.score_dex = self.score_int = 10
        self.score_cha = 16


# (class, name, level gained, recovery, {character level: max uses}), SRD 5.1.
_EXPECTED = [
    (_C.BARBARIAN, "Rage", 1, "long", {1: 2, 2: 2, 3: 3, 6: 4, 12: 5, 17: 6, 19: 6, 20: 0}),
    (_C.BARD, "Bardic Inspiration", 1, "long", {1: 3, 5: 3}),
    (_C.CLERIC, "Channel Divinity", 2, "short", {2: 1, 5: 1, 6: 2, 17: 2, 18: 3}),
    (_C.CLERIC, "Divine Intervention", 10, "long", {10: 1}),
    (_C.DRUID, "Wild Shape", 2, "short", {2: 2, 6: 2, 17: 2, 20: 0}),
    (_C.DRUID, "Natural Recovery", 2, "long", {2: 1}),
    (_C.FIGHTER, "Second Wind", 1, "short", {1: 1, 10: 1}),
    (_C.FIGHTER, "Action Surge", 2, "short", {2: 1, 16: 1, 17: 2}),
    (_C.FIGHTER, "Indomitable", 9, "long", {9: 1, 12: 1, 13: 2, 16: 2, 17: 3}),
    (_C.MONK, "Ki", 2, "short", {2: 2, 5: 5, 20: 20}),
    (_C.MONK, "Wholeness of Body", 6, "long", {6: 1}),
    (_C.PALADIN, "Divine Sense", 1, "long", {1: 4}),
    (_C.PALADIN, "Lay on Hands", 1, "long", {1: 5, 5: 25, 20: 100}),
    (_C.PALADIN, "Channel Divinity (Paladin)", 3, "short", {3: 1, 11: 1}),
    (_C.PALADIN, "Cleansing Touch", 14, "long", {14: 3}),
    (_C.PALADIN, "Holy Nimbus", 20, "long", {20: 1}),
    (_C.ROGUE, "Stroke of Luck", 20, "short", {20: 1}),
    (_C.SORCERER, "Sorcery Points", 2, "long", {2: 2, 9: 9}),
    (_C.WARLOCK, "Mystic Arcanum (6th level)", 11, "long", {11: 1}),
    (_C.WARLOCK, "Mystic Arcanum (9th level)", 17, "long", {17: 1}),
    (_C.WARLOCK, "Dark One's Own Luck", 6, "short", {6: 1}),
    (_C.WIZARD, "Arcane Recovery", 1, "long", {1: 1}),
    (_C.WIZARD, "Signature Spells", 20, "short", {20: 2}),
]


@pytest.mark.parametrize("cls,name,gained,recovery,uses", _EXPECTED)
def test_the_catalog_has_the_2014_counters(cls, name, gained, recovery, uses):
    """Each SRD 5.1 counter: the right level, recovery and uses (0 = no limit at 20)."""
    row = next(
        (p for p in CLASS_FEATURES_2014 if p.name == name and p.character_class == cls), None
    )
    assert row is not None, name
    assert row.level_acquired == gained
    assert row.recovery == RecoveryType(recovery)
    for level, expected in uses.items():
        assert feature_service.max_uses_for(row, _Stub(cls, level)) == expected, (name, level)


def test_every_2014_row_is_marked_and_well_formed():
    """Ruleset and source on every row, no 2024 'one back' recovery, unique keys."""
    keys = [(p.name, p.character_class, p.subclass) for p in CLASS_FEATURES_2014]
    assert len(keys) == len(set(keys))
    for p in CLASS_FEATURES_2014:
        assert p.ruleset == "2014" and p.source == SOURCE_2014, p.name
        assert p.recovery != RecoveryType.SHORT_ONE, p.name
    subclasses = {p.subclass for p in CLASS_FEATURES_2014 if p.subclass}
    assert subclasses == {
        "Circle of the Land",
        "Way of the Open Hand",
        "Oath of Devotion",
        "The Fiend",
        "School of Evocation",
    }
    assert rulesets.class_features("2014") is CLASS_FEATURES_2014


def test_subclass_names_are_the_builders():
    """Each subclass row names a subclass the 2014 builder offers for that class."""
    classes = rulesets.options("2014").CLASSES
    for p in CLASS_FEATURES_2014:
        if p.subclass:
            assert p.subclass in classes[p.character_class.value]["srd_subclasses"], p.name


def test_uses_formula_names_fit_the_column():
    """The DB stores the member NAME in a String(20) column."""
    assert all(len(member.name) <= 20 for member in UsesFormula)


def test_2014_rows_ignore_the_2024_level_tables():
    """Same names, different counts: 2014 Wild Shape stays 2, the Paladin's CD stays 1."""
    by_name = {(p.character_class, p.name): p for p in CLASS_FEATURES_2014}
    twins = {(p.character_class, p.name): p for p in CLASS_FEATURES_2024}
    wild = (_C.DRUID, "Wild Shape")
    cd = (_C.PALADIN, "Channel Divinity (Paladin)")
    assert feature_service.max_uses_for(by_name[wild], _Stub(_C.DRUID, 6)) == 2
    assert feature_service.max_uses_for(twins[wild], _Stub(_C.DRUID, 6)) == 3
    assert feature_service.max_uses_for(by_name[cd], _Stub(_C.PALADIN, 11)) == 1
    assert feature_service.max_uses_for(twins[cd], _Stub(_C.PALADIN, 11)) == 3


def test_divine_sense_is_at_least_one():
    """1 + CHA modifier, never below 1 (CHA 8 would make it 0)."""
    stub = _Stub(_C.PALADIN, 1)
    stub.score_cha = 8
    assert feature_service.resolve_max_uses(UsesFormula.CHA_MOD_PLUS_1, stub) == 1


# ── Seeding ───────────────────────────────────────────────────────────────


class TestSeeding:
    """Both editions seed side by side, insert-if-missing."""

    def test_both_editions_seed_once(self, duckdb_session: Session):
        """2014 rows arrive next to the 2024 ones; a second run adds nothing."""
        _wipe_catalog(duckdb_session)
        both = [*CLASS_FEATURES_2024, *CLASS_FEATURES_2014]
        out = feature_service.seed_and_backfill(duckdb_session, both)
        assert out["inserted"] == len(both)
        rows = ClassFeatureRepo.list_all(duckdb_session)
        assert len(rows) == len(both)
        assert sum(1 for r in rows if r.ruleset == "2014") == len(CLASS_FEATURES_2014)
        assert feature_service.seed_and_backfill(duckdb_session, both) == {
            "inserted": 0,
            "granted": 0,
        }

    def test_the_two_rages_are_separate_rows(self, duckdb_session: Session):
        """Seeding 2014 never rewrites the 2024 Rage's formula or recovery (or the reverse)."""
        _wipe_catalog(duckdb_session)
        feature_service.seed_catalog(duckdb_session, CLASS_FEATURES_2024)
        feature_service.seed_catalog(duckdb_session, CLASS_FEATURES_2014)
        feature_service.seed_catalog(duckdb_session, CLASS_FEATURES_2024)
        rages = {
            r.ruleset: r
            for r in ClassFeatureRepo.list_all(duckdb_session, character_class=_C.BARBARIAN)
            if r.name == "Rage"
        }
        assert rages["2024"].uses_formula == UsesFormula.RAGE
        assert rages["2024"].recovery == RecoveryType.SHORT_ONE
        assert rages["2014"].uses_formula == UsesFormula.RAGE_2014
        assert rages["2014"].recovery == RecoveryType.LONG

    def test_backfill_grants_each_edition_to_its_own(self, duckdb_session: Session):
        """A startup seed of both catalogs gives a 2014 Paladin only 2014 rows, and so on."""
        _wipe_catalog(duckdb_session)
        old, dm_old = _pc(duckdb_session, _C.PALADIN, 5)
        new, dm_new = _pc(duckdb_session, _C.PALADIN, 5, ruleset="2024")
        # sync_for_level seeded each PC's own edition; start again from an empty catalog.
        _wipe_catalog(duckdb_session)
        feature_service.seed_and_backfill(
            duckdb_session, [*CLASS_FEATURES_2024, *CLASS_FEATURES_2014]
        )
        assert _editions(duckdb_session, old) == {"2014"}
        assert _editions(duckdb_session, new) == {"2024"}
        assert set(_have(duckdb_session, old, dm_old)) == {
            "Divine Sense",
            "Lay on Hands",
            "Channel Divinity (Paladin)",
        }
        assert "Paladin's Smite" in _have(duckdb_session, new, dm_new)

    def test_sync_seeds_only_the_pcs_edition(self, duckdb_session: Session):
        """A 2024 PC's sync on an empty catalog plants 2024 rows only, as before Plan 131."""
        _wipe_catalog(duckdb_session)
        _pc(duckdb_session, _C.FIGHTER, 1, ruleset="2024")
        assert {r.ruleset for r in ClassFeatureRepo.list_all(duckdb_session)} == {"2024"}
        _pc(duckdb_session, _C.FIGHTER, 1)
        assert {r.ruleset for r in ClassFeatureRepo.list_all(duckdb_session)} == {"2024", "2014"}


# ── Granting and the counters on a sheet ──────────────────────────────────


class TestTrackers:
    """2014 PCs get the SRD 5.1 counts."""

    def test_barbarian_rage_two_then_three(self, duckdb_session: Session):
        """Rage 2 at level 1; levelling to 3 makes it 3."""
        pc, dm = _pc(duckdb_session, _C.BARBARIAN, 1)
        assert _have(duckdb_session, pc, dm)["Rage"].max_uses == 2
        char_svc.update_character(duckdb_session, pc.id, dm, PlayerCharacterUpdate(level=3))
        assert _have(duckdb_session, pc, dm)["Rage"].max_uses == 3

    def test_cleric_channel_divinity_comes_back_on_a_short_rest(self, duckdb_session: Session):
        """1 use at level 2; a short rest brings back every use (2 at level 6)."""
        pc, dm = _pc(duckdb_session, _C.CLERIC, 2, subclass="Life Domain")
        cd = _have(duckdb_session, pc, dm)["Channel Divinity"]
        assert cd.max_uses == 1 and cd.recovery == RecoveryType.SHORT
        feature_service.spend_use(duckdb_session, cd.id, dm)
        summary = rest_service.short_rest_pc(duckdb_session, pc.id, dm)
        assert "Channel Divinity" in summary.features_restored
        assert _have(duckdb_session, pc, dm)["Channel Divinity"].uses_spent == 0

        char_svc.update_character(duckdb_session, pc.id, dm, PlayerCharacterUpdate(level=6))
        feature_service.spend_use(duckdb_session, cd.id, dm, amount=2)
        assert _have(duckdb_session, pc, dm)["Channel Divinity"].uses_spent == 2
        rest_service.short_rest_pc(duckdb_session, pc.id, dm)
        assert _have(duckdb_session, pc, dm)["Channel Divinity"].uses_spent == 0

    def test_second_wind_one_in_2014_two_in_2024(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.FIGHTER, 1)
        assert _have(duckdb_session, pc, dm)["Second Wind"].max_uses == 1
        pc24, dm24 = _pc(duckdb_session, _C.FIGHTER, 1, ruleset="2024")
        assert _have(duckdb_session, pc24, dm24)["Second Wind"].max_uses == 2

    def test_action_surge_two_at_seventeen(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.FIGHTER, 17)
        have = _have(duckdb_session, pc, dm)
        assert have["Action Surge"].max_uses == 2
        assert have["Indomitable"].max_uses == 3

    def test_paladin_divine_sense_and_lay_on_hands(self, duckdb_session: Session):
        """CHA 16: Divine Sense 4. Level 5: Lay on Hands 25, Channel Divinity 1."""
        pc, dm = _pc(duckdb_session, _C.PALADIN, 5, score_cha=16)
        have = _have(duckdb_session, pc, dm)
        assert have["Divine Sense"].max_uses == 4
        assert have["Lay on Hands"].max_uses == 25
        assert have["Channel Divinity (Paladin)"].max_uses == 1
        # The pool spends any number of points at once.
        after = feature_service.spend_use(duckdb_session, have["Lay on Hands"].id, dm, amount=7)
        assert after.uses_spent == 7

    def test_ki_at_five_is_five(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.MONK, 5)
        assert _have(duckdb_session, pc, dm)["Ki"].max_uses == 5

    def test_rage_has_no_limit_at_twenty(self, duckdb_session: Session):
        """No limit means no counter: max 0, as a passive feature shows."""
        pc, dm = _pc(duckdb_session, _C.BARBARIAN, 20)
        assert _have(duckdb_session, pc, dm)["Rage"].max_uses == 0


class TestEditions:
    """A PC never gets the other edition's rows."""

    @pytest.mark.parametrize("cls", list(CharacterClass))
    def test_2014_pc_gets_2014_rows_only(self, duckdb_session: Session, cls):
        feature_service.seed_catalog(duckdb_session, CLASS_FEATURES_2024)
        pc, _dm = _pc(duckdb_session, cls, 20)
        assert _editions(duckdb_session, pc) <= {"2014"}

    @pytest.mark.parametrize("cls", list(CharacterClass))
    def test_2024_pc_gets_2024_rows_only(self, duckdb_session: Session, cls):
        feature_service.seed_catalog(duckdb_session, CLASS_FEATURES_2014)
        pc, _dm = _pc(duckdb_session, cls, 20, ruleset="2024")
        assert _editions(duckdb_session, pc) <= {"2024"}

    def test_2014_sorcerer_has_no_innate_sorcery(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.SORCERER, 5)
        assert set(_have(duckdb_session, pc, dm)) == {"Sorcery Points"}


class TestSubclasses:
    """2014 subclass rows match the 2014 names, short or long."""

    @pytest.mark.parametrize(
        "cls,written,level,expected",
        [
            (_C.DRUID, "Circle of the Land", 2, "Natural Recovery"),
            (_C.DRUID, "Land", 2, "Natural Recovery"),
            (_C.MONK, "Way of the Open Hand", 6, "Wholeness of Body"),
            (_C.MONK, "Open Hand", 6, "Wholeness of Body"),
            (_C.WARLOCK, "The Fiend", 6, "Dark One's Own Luck"),
            (_C.WARLOCK, "Fiend", 14, "Hurl Through Hell"),
            (_C.WIZARD, "Evocation", 14, "Overchannel"),
            (_C.PALADIN, "Devotion", 20, "Holy Nimbus"),
        ],
    )
    def test_subclass_rows_are_granted(
        self, duckdb_session: Session, cls, written, level, expected
    ):
        pc, dm = _pc(duckdb_session, cls, level, subclass=written)
        assert expected in _have(duckdb_session, pc, dm)

    def test_wholeness_of_body_is_once_a_day_in_2014(self, duckdb_session: Session):
        """2014: once per long rest. (2024 gives WIS-modifier uses.)"""
        pc, dm = _pc(duckdb_session, _C.MONK, 6, subclass="Open Hand", score_wis=18)
        assert _have(duckdb_session, pc, dm)["Wholeness of Body"].max_uses == 1

    def test_other_subclasses_stay_out(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.WIZARD, 14, subclass="School of Divination")
        assert "Overchannel" not in _have(duckdb_session, pc, dm)
        pc, dm = _pc(duckdb_session, _C.DRUID, 6, subclass="Circle of the Moon")
        assert "Natural Recovery" not in _have(duckdb_session, pc, dm)


def test_the_every_feature_list_opens_for_a_2014_pc(duckdb_session: Session):
    """The class-features listing (Plan 128) answers for a 2014 PC (its 2014 notes: M2-L)."""
    pc, dm = _pc(duckdb_session, _C.PALADIN, 5, subclass="Oath of Devotion")
    rows = feature_service.list_class_features(duckdb_session, pc.id, dm)
    assert rows and all({"name", "level", "source", "note"} <= set(r) for r in rows)


# ── The DM's "learn a feature" list ──────────────────────────────────────


def test_catalog_filters_by_edition(duckdb_session: Session):
    """``ruleset`` narrows the catalog to one edition; no filter lists both."""
    feature_service.seed_catalog(duckdb_session, CLASS_FEATURES_2024)
    feature_service.seed_catalog(duckdb_session, CLASS_FEATURES_2014)
    old = feature_service.list_catalog(duckdb_session, character_class=_C.BARBARIAN, ruleset="2014")
    assert [r.name for r in old] == ["Rage"]
    assert all(r.ruleset == "2014" for r in old)
    new = feature_service.list_catalog(duckdb_session, character_class=_C.BARBARIAN, ruleset="2024")
    assert "Persistent Rage" in {r.name for r in new}
    assert all(r.ruleset == "2024" for r in new)
    both = feature_service.list_catalog(duckdb_session, character_class=_C.BARBARIAN)
    assert len(both) == len(old) + len(new)


# ── Long rests ────────────────────────────────────────────────────────────


def _spend_hit_dice(db: Session, pc, spent: int, exhaustion: int = 0):
    """Mark ``spent`` Hit Dice used (and an exhaustion level) straight on the row."""
    row = char_svc.CharacterRepo.get_by_id(db, pc.id)
    row.hit_dice_spent = spent
    row.exhaustion = exhaustion
    db.add(row)
    db.commit()


class TestLongRest:
    """2014: regain half your total Hit Dice (at least 1) and lose one exhaustion level."""

    @pytest.mark.parametrize(
        "ruleset,level,spent,left",
        [
            ("2014", 5, 5, 3),  # regains 2 (5 // 2)
            ("2014", 1, 1, 0),  # regains at least 1
            ("2014", 8, 2, 0),  # never more than were spent
            ("2024", 8, 5, 1),  # 2024 unchanged: the same half rule it always used
        ],
    )
    def test_hit_dice(self, duckdb_session: Session, ruleset, level, spent, left):
        pc, dm = _pc(duckdb_session, _C.FIGHTER, level, ruleset=ruleset)
        _spend_hit_dice(duckdb_session, pc, spent)
        rest_service.long_rest_pc(duckdb_session, pc.id, dm)
        assert char_svc.CharacterRepo.get_by_id(duckdb_session, pc.id).hit_dice_spent == left

    def test_exhaustion_drops_one_level(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.FIGHTER, 5)
        _spend_hit_dice(duckdb_session, pc, 0, exhaustion=3)
        rest_service.long_rest_pc(duckdb_session, pc.id, dm)
        assert char_svc.CharacterRepo.get_by_id(duckdb_session, pc.id).exhaustion == 2

    def test_long_rest_refills_every_tracker(self, duckdb_session: Session):
        """Short- and long-rest rows alike come back on a long rest."""
        pc, dm = _pc(duckdb_session, _C.PALADIN, 5)
        have = _have(duckdb_session, pc, dm)
        feature_service.spend_use(duckdb_session, have["Lay on Hands"].id, dm, amount=10)
        feature_service.spend_use(duckdb_session, have["Channel Divinity (Paladin)"].id, dm)
        feature_service.spend_use(duckdb_session, have["Divine Sense"].id, dm)
        rest_service.long_rest_pc(duckdb_session, pc.id, dm)
        assert all(r.uses_spent == 0 for r in _have(duckdb_session, pc, dm).values())

    def test_short_rest_leaves_long_rest_rows(self, duckdb_session: Session):
        pc, dm = _pc(duckdb_session, _C.PALADIN, 5)
        have = _have(duckdb_session, pc, dm)
        feature_service.spend_use(duckdb_session, have["Divine Sense"].id, dm)
        rest_service.short_rest_pc(duckdb_session, pc.id, dm)
        assert _have(duckdb_session, pc, dm)["Divine Sense"].uses_spent == 1
