"""Tests for services/feature_service.py (Plan 00021)."""

import uuid

import pytest
from sqlmodel import Session, delete

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.feature_service as feat_svc
from db.repos.class_feature_repo import ClassFeatureRepo
from domain.character import (
    CharacterFeature,
    CharacterFeatureCreate,
    ClassFeature,
    ClassFeatureCreate,
)
from domain.enums import CharacterClass, RecoveryType, UsesFormula


@pytest.fixture(autouse=True)
def _clean(duckdb_session: Session):
    """Wipe class_features and character_features before each test.

    Two commits: DuckDB checks FK constraints at statement time, so we
    must commit the child-table delete before deleting parent rows.
    """
    duckdb_session.exec(delete(CharacterFeature))
    duckdb_session.commit()
    duckdb_session.exec(delete(ClassFeature))
    duckdb_session.commit()
    yield


def _unique_dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm):
    return camp_svc.create_campaign(db, name="C", setting="R", tone="T", dm_email=dm)


def _pc(
    db,
    campaign_id,
    dm,
    *,
    character_class: CharacterClass = CharacterClass.FIGHTER,
    level: int = 5,
    score_int: int = 10,
    score_wis: int = 10,
    score_cha: int = 10,
):
    return char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm,
        player_name="P",
        character_name="Hero",
        race="Human",
        character_class=character_class,
        level=level,
        score_str=14,
        score_dex=14,
        score_con=14,
        score_int=score_int,
        score_wis=score_wis,
        score_cha=score_cha,
        hp_max=20,
        hp_current=20,
        ac=16,
        speed=30,
    )


def _feature(
    db,
    *,
    name: str = "Action Surge",
    character_class: CharacterClass = CharacterClass.FIGHTER,
    level_acquired: int = 2,
    recovery: RecoveryType = RecoveryType.SHORT,
    uses_formula: UsesFormula = UsesFormula.FIXED_1,
):
    return ClassFeatureRepo.create(
        db,
        ClassFeatureCreate(
            name=name,
            character_class=character_class,
            level_acquired=level_acquired,
            recovery=recovery,
            uses_formula=uses_formula,
            description=f"{name} description.",
        ),
    )


# ── resolve_max_uses ────────────────────────────────────────────────────────


class TestResolveMaxUses:
    """Formula → integer translation for various PCs."""

    def test_fixed_values(self, duckdb_session: Session):
        """Fixed-N formulas return N."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        for formula, expected in [
            (UsesFormula.NONE, 0),
            (UsesFormula.FIXED_1, 1),
            (UsesFormula.FIXED_2, 2),
            (UsesFormula.FIXED_3, 3),
            (UsesFormula.FIXED_4, 4),
        ]:
            assert feat_svc.resolve_max_uses(formula, pc) == expected

    def test_prof_bonus(self, duckdb_session: Session):
        """PROF_BONUS resolves to the 5e proficiency bonus."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        # L5 → +3 prof
        pc = _pc(duckdb_session, c.id, dm, level=5)
        assert feat_svc.resolve_max_uses(UsesFormula.PROF_BONUS, pc) == 3
        # L9 → +4 prof — different PC to avoid name collision via service
        pc2 = char_svc.create_character(
            duckdb_session,
            campaign_id=c.id,
            dm_email=dm,
            player_name="P",
            character_name="Hero9",
            race="Human",
            character_class=CharacterClass.FIGHTER,
            level=9,
            score_str=14,
            score_dex=14,
            score_con=14,
            score_int=10,
            score_wis=10,
            score_cha=10,
            hp_max=30,
            hp_current=30,
            ac=16,
            speed=30,
        )
        assert feat_svc.resolve_max_uses(UsesFormula.PROF_BONUS, pc2) == 4

    def test_ability_mods_floor_one(self, duckdb_session: Session):
        """Ability-mod formulas floor at 1 even when the mod is 0 or negative."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, score_cha=10)
        # CHA 10 = mod 0 → floors to 1
        assert feat_svc.resolve_max_uses(UsesFormula.CHA_MOD, pc) == 1

    def test_level_formulas(self, duckdb_session: Session):
        """LEVEL / LEVEL_DIV_3 / LEVEL_DIV_2."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, level=9)
        assert feat_svc.resolve_max_uses(UsesFormula.LEVEL, pc) == 9
        assert feat_svc.resolve_max_uses(UsesFormula.LEVEL_DIV_3, pc) == 3
        assert feat_svc.resolve_max_uses(UsesFormula.LEVEL_DIV_2, pc) == 4


# ── learn / spend / restore / forget ───────────────────────────────────────


class TestLearnFeature:
    """Tests for feature_service.learn_feature."""

    def test_first_learn_creates(self, duckdb_session: Session):
        """First learn returns a hydrated row with max_uses computed."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        f = _feature(duckdb_session)
        row = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=f.id), dm
        )
        assert row.feature_name == "Action Surge"
        assert row.max_uses == 1
        assert row.uses_spent == 0

    def test_idempotent_keeps_state(self, duckdb_session: Session):
        """Re-learning is a no-op — current uses_spent is preserved."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        f = _feature(duckdb_session)
        first = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=f.id), dm
        )
        # Spend a use
        feat_svc.spend_use(duckdb_session, first.id, dm)
        # Re-learn
        second = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=f.id), dm
        )
        assert second.id == first.id
        assert second.uses_spent == 1  # not reset to 0

    def test_unknown_feature_raises(self, duckdb_session: Session):
        """Unknown feature_id raises ValueError."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        with pytest.raises(ValueError):
            feat_svc.learn_feature(
                duckdb_session,
                pc.id,
                CharacterFeatureCreate(feature_id=uuid.uuid4()),
                dm,
            )

    def test_non_owner_denied(self, duckdb_session: Session):
        """Non-owning DM is blocked."""
        dm1, dm2 = _unique_dm(), _unique_dm()
        c = _campaign(duckdb_session, dm1)
        pc = _pc(duckdb_session, c.id, dm1)
        f = _feature(duckdb_session)
        with pytest.raises(PermissionError):
            feat_svc.learn_feature(
                duckdb_session, pc.id, CharacterFeatureCreate(feature_id=f.id), dm2
            )


class TestSpendAndRestore:
    """spend_use clamps to max; restore floors at 0."""

    def test_spend_increments(self, duckdb_session: Session):
        """spend_use bumps uses_spent by 1."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        f = _feature(duckdb_session, name="Wild Shape", uses_formula=UsesFormula.FIXED_2)
        row = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=f.id), dm
        )
        a = feat_svc.spend_use(duckdb_session, row.id, dm)
        assert a.uses_spent == 1
        b = feat_svc.spend_use(duckdb_session, row.id, dm)
        assert b.uses_spent == 2

    def test_spend_clamps_at_max(self, duckdb_session: Session):
        """Can't spend past max_uses."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        f = _feature(duckdb_session, uses_formula=UsesFormula.FIXED_1)
        row = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=f.id), dm
        )
        feat_svc.spend_use(duckdb_session, row.id, dm)  # → 1 (max)
        clamped = feat_svc.spend_use(duckdb_session, row.id, dm)  # stays at 1
        assert clamped.uses_spent == 1

    def test_restore_floors_zero(self, duckdb_session: Session):
        """restore_use never goes negative."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        f = _feature(duckdb_session)
        row = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=f.id), dm
        )
        restored = feat_svc.restore_use(duckdb_session, row.id, dm)
        assert restored.uses_spent == 0


class TestForgetFeature:
    """Forget removes the row."""

    def test_delete(self, duckdb_session: Session):
        """forget_feature deletes the row."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        f = _feature(duckdb_session)
        row = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=f.id), dm
        )
        feat_svc.forget_feature(duckdb_session, row.id, dm)
        assert feat_svc.list_for_character(duckdb_session, pc.id, dm) == []


class TestListCatalog:
    """Catalog filters."""

    def test_filter_by_class(self, duckdb_session: Session):
        """character_class scopes the catalog."""
        _feature(duckdb_session, name="Rage", character_class=CharacterClass.BARBARIAN)
        _feature(
            duckdb_session,
            name="Action Surge",
            character_class=CharacterClass.FIGHTER,
        )
        results = feat_svc.list_catalog(duckdb_session, character_class=CharacterClass.FIGHTER)
        assert [r.name for r in results] == ["Action Surge"]

    def test_max_level_filter(self, duckdb_session: Session):
        """max_level filter excludes features above the cap."""
        _feature(
            duckdb_session,
            name="Action Surge",
            level_acquired=2,
        )
        _feature(
            duckdb_session,
            name="Indomitable",
            level_acquired=9,
        )
        results = feat_svc.list_catalog(duckdb_session, max_level=5)
        assert {r.name for r in results} == {"Action Surge"}


class TestSeedCatalog:
    """Catalog seed is idempotent."""

    def test_seeds_when_empty(self, duckdb_session: Session):
        """First call inserts all payloads."""
        payloads = [
            ClassFeatureCreate(
                name="X",
                character_class=CharacterClass.FIGHTER,
                level_acquired=1,
                recovery=RecoveryType.SHORT,
                uses_formula=UsesFormula.FIXED_1,
                description="x",
            ),
            ClassFeatureCreate(
                name="Y",
                character_class=CharacterClass.WIZARD,
                level_acquired=1,
                recovery=RecoveryType.LONG,
                uses_formula=UsesFormula.PROF_BONUS,
                description="y",
            ),
        ]
        n = feat_svc.seed_catalog(duckdb_session, payloads)
        assert n == 2

    def test_idempotent(self, duckdb_session: Session):
        """Second call is a no-op."""
        _feature(duckdb_session)
        n = feat_svc.seed_catalog(
            duckdb_session,
            [
                ClassFeatureCreate(
                    name="Z",
                    character_class=CharacterClass.WIZARD,
                    level_acquired=1,
                    recovery=RecoveryType.LONG,
                    uses_formula=UsesFormula.PROF_BONUS,
                    description="z",
                ),
            ],
        )
        assert n == 0


class TestSyncForLevel:
    """Level-up helper: grant everything the PC now qualifies for."""

    def _catalog(self, db):
        """L1/L2/L3 generic + an L3 subclass feature for Fighter."""
        f1 = _feature(db, name="Second Wind", level_acquired=1)
        f2 = _feature(db, name="Action Surge", level_acquired=2)
        f3 = _feature(db, name="Tactical Master", level_acquired=3)
        champ = ClassFeatureRepo.create(
            db,
            ClassFeatureCreate(
                name="Improved Critical",
                character_class=CharacterClass.FIGHTER,
                subclass="Champion",
                level_acquired=3,
                recovery=RecoveryType.NONE,
                uses_formula=UsesFormula.NONE,
                description="Crit on 19-20.",
            ),
        )
        return f1, f2, f3, champ

    def test_grants_up_to_level_and_is_idempotent(self, duckdb_session: Session):
        """A level-2 PC gets L1+L2 generics; re-sync grants nothing."""
        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, level=2)
        self._catalog(duckdb_session)

        granted = feat_svc.sync_for_level(duckdb_session, pc.id, dm)

        assert sorted(granted) == ["Action Surge", "Second Wind"]
        assert feat_svc.sync_for_level(duckdb_session, pc.id, dm) == []

    def test_level_up_with_subclass_grants_the_rest(self, duckdb_session: Session):
        """Bumping to 3 + choosing Champion grants L3 generic + subclass."""
        from db.repos.character_repo import CharacterRepo
        from domain.character import PlayerCharacterUpdate

        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, level=2)
        self._catalog(duckdb_session)
        feat_svc.sync_for_level(duckdb_session, pc.id, dm)

        row = CharacterRepo.get_by_id(duckdb_session, pc.id)
        CharacterRepo.update(
            duckdb_session, row, PlayerCharacterUpdate(level=3, subclass="Champion")
        )
        granted = feat_svc.sync_for_level(duckdb_session, pc.id, dm)

        assert sorted(granted) == ["Improved Critical", "Tactical Master"]

    def test_wrong_subclass_features_stay_out(self, duckdb_session: Session):
        """A Battle Master never receives Champion features."""
        from db.repos.character_repo import CharacterRepo
        from domain.character import PlayerCharacterUpdate

        dm = _unique_dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, level=3)
        self._catalog(duckdb_session)
        row = CharacterRepo.get_by_id(duckdb_session, pc.id)
        CharacterRepo.update(duckdb_session, row, PlayerCharacterUpdate(subclass="Battle Master"))

        granted = feat_svc.sync_for_level(duckdb_session, pc.id, dm)

        assert "Improved Critical" not in granted
        assert sorted(granted) == ["Action Surge", "Second Wind", "Tactical Master"]
