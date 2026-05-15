"""Tests for combat-state helpers in character_service (Plan 00023)."""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from domain.enums import CharacterClass


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm):
    return camp_svc.create_campaign(db, name="C", setting="R", tone="T", dm_email=dm)


def _pc(db, cid, dm, *, hp_max: int = 20, hp_current: int = 20, temp_hp: int = 0):
    pc = char_svc.create_character(
        db,
        campaign_id=cid,
        dm_email=dm,
        player_name="P",
        character_name="Hero",
        race="Human",
        character_class=CharacterClass.FIGHTER,
        level=5,
        score_str=14,
        score_dex=14,
        score_con=14,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=hp_max,
        hp_current=hp_current,
        ac=16,
        speed=30,
    )
    if temp_hp > 0:
        # Set via patch through SQLModel directly (create_character signature
        # doesn't accept temp_hp yet)
        from db.repos.character_repo import CharacterRepo

        row = CharacterRepo.get_by_id(db, pc.id)
        row.temp_hp = temp_hp
        db.add(row)
        db.commit()
        db.refresh(row)
        return row
    return pc


class TestApplyDamage:
    """Damage waterfall: temp HP first, then real HP."""

    def test_damage_consumes_temp_first(self, duckdb_session: Session):
        """5 damage against 3 temp + 20 real → temp=0, real=18."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, temp_hp=3)
        result = char_svc.apply_damage(duckdb_session, pc.id, 5, dm)
        assert result.temp_hp == 0
        assert result.hp_current == 18

    def test_damage_under_temp_leaves_real_alone(self, duckdb_session: Session):
        """2 damage against 5 temp → temp=3, real unchanged."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, temp_hp=5)
        result = char_svc.apply_damage(duckdb_session, pc.id, 2, dm)
        assert result.temp_hp == 3
        assert result.hp_current == 20

    def test_damage_exceeds_real_clamps_to_zero(self, duckdb_session: Session):
        """100 damage against fresh PC → temp=0, real=0 (not negative)."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        result = char_svc.apply_damage(duckdb_session, pc.id, 100, dm)
        assert result.temp_hp == 0
        assert result.hp_current == 0

    def test_zero_damage_no_op(self, duckdb_session: Session):
        """0 damage doesn't change anything."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, temp_hp=5)
        result = char_svc.apply_damage(duckdb_session, pc.id, 0, dm)
        assert result.temp_hp == 5
        assert result.hp_current == 20

    def test_negative_damage_clamps_zero(self, duckdb_session: Session):
        """Negative input clamps to 0."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        result = char_svc.apply_damage(duckdb_session, pc.id, -5, dm)
        assert result.hp_current == 20

    def test_non_owner_denied(self, duckdb_session: Session):
        """Another DM cannot damage someone else's PC."""
        dm1, dm2 = _dm(), _dm()
        c = _campaign(duckdb_session, dm1)
        pc = _pc(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            char_svc.apply_damage(duckdb_session, pc.id, 5, dm2)


class TestApplyHealing:
    """Healing restores hp_current; clears death saves on revive."""

    def test_basic_healing(self, duckdb_session: Session):
        """5 healing to 12/20 → 17/20."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, hp_current=12)
        result = char_svc.apply_healing(duckdb_session, pc.id, 5, dm)
        assert result.hp_current == 17

    def test_healing_clamps_to_max(self, duckdb_session: Session):
        """Over-heal clamps to hp_max."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, hp_current=18)
        result = char_svc.apply_healing(duckdb_session, pc.id, 100, dm)
        assert result.hp_current == 20

    def test_healing_from_zero_clears_death_saves(self, duckdb_session: Session):
        """Reviving from 0 zeros both death-save tracks."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, hp_current=0)
        # Manually set some death-save state
        from db.repos.character_repo import CharacterRepo

        row = CharacterRepo.get_by_id(duckdb_session, pc.id)
        row.death_save_successes = 2
        row.death_save_failures = 1
        duckdb_session.add(row)
        duckdb_session.commit()

        result = char_svc.apply_healing(duckdb_session, pc.id, 5, dm)
        assert result.hp_current == 5
        assert result.death_save_successes == 0
        assert result.death_save_failures == 0

    def test_healing_at_zero_doesnt_clear_if_still_zero(self, duckdb_session: Session):
        """Zero healing on a downed PC doesn't clear death saves."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, hp_current=0)
        from db.repos.character_repo import CharacterRepo

        row = CharacterRepo.get_by_id(duckdb_session, pc.id)
        row.death_save_successes = 1
        duckdb_session.add(row)
        duckdb_session.commit()

        result = char_svc.apply_healing(duckdb_session, pc.id, 0, dm)
        assert result.death_save_successes == 1  # untouched


class TestResolveDeathSave:
    """Death-save resolution per 2024 RAW."""

    def _downed(self, db, dm):
        c = _campaign(db, dm)
        return _pc(db, c.id, dm, hp_current=0)

    def test_below_10_adds_failure(self, duckdb_session: Session):
        """d20=7 → +1 failure."""
        dm = _dm()
        pc = self._downed(duckdb_session, dm)
        result = char_svc.resolve_death_save(duckdb_session, pc.id, 7, dm)
        assert result.death_save_failures == 1
        assert result.death_save_successes == 0

    def test_10_or_above_adds_success(self, duckdb_session: Session):
        """d20=10 → +1 success."""
        dm = _dm()
        pc = self._downed(duckdb_session, dm)
        result = char_svc.resolve_death_save(duckdb_session, pc.id, 10, dm)
        assert result.death_save_successes == 1

    def test_nat_1_adds_two_failures(self, duckdb_session: Session):
        """d20=1 → +2 failures."""
        dm = _dm()
        pc = self._downed(duckdb_session, dm)
        result = char_svc.resolve_death_save(duckdb_session, pc.id, 1, dm)
        assert result.death_save_failures == 2

    def test_nat_20_revives_and_clears(self, duckdb_session: Session):
        """d20=20 → HP 1, both tracks zeroed."""
        dm = _dm()
        pc = self._downed(duckdb_session, dm)
        # Pre-load some failures
        from db.repos.character_repo import CharacterRepo

        row = CharacterRepo.get_by_id(duckdb_session, pc.id)
        row.death_save_failures = 2
        duckdb_session.add(row)
        duckdb_session.commit()

        result = char_svc.resolve_death_save(duckdb_session, pc.id, 20, dm)
        assert result.hp_current == 1
        assert result.death_save_successes == 0
        assert result.death_save_failures == 0

    def test_three_successes_clamps(self, duckdb_session: Session):
        """A 4th success doesn't push past 3."""
        dm = _dm()
        pc = self._downed(duckdb_session, dm)
        for _ in range(4):
            char_svc.resolve_death_save(duckdb_session, pc.id, 15, dm)
        from db.repos.character_repo import CharacterRepo

        row = CharacterRepo.get_by_id(duckdb_session, pc.id)
        assert row.death_save_successes == 3

    def test_d20_out_of_range_raises(self, duckdb_session: Session):
        """d20 must be 1..20."""
        dm = _dm()
        pc = self._downed(duckdb_session, dm)
        with pytest.raises(ValueError):
            char_svc.resolve_death_save(duckdb_session, pc.id, 0, dm)
        with pytest.raises(ValueError):
            char_svc.resolve_death_save(duckdb_session, pc.id, 21, dm)

    def test_not_dying_raises(self, duckdb_session: Session):
        """Death save on a full-HP PC is rejected."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        with pytest.raises(ValueError):
            char_svc.resolve_death_save(duckdb_session, pc.id, 15, dm)


class TestPersistedFields:
    """The five new columns round-trip through create + update."""

    def test_defaults(self, duckdb_session: Session):
        """Fresh PC has zero temp_hp, no inspiration, no concentration, no death saves."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        assert pc.temp_hp == 0
        assert pc.heroic_inspiration is False
        assert pc.concentration_on is None
        assert pc.death_save_successes == 0
        assert pc.death_save_failures == 0
