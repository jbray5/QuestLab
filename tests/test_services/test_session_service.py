"""Tests for services/session_service.py — session CRUD, lifecycle, and initiative."""

import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.session_service as sess_svc
from domain.enums import AdventureTier, SessionStatus
from domain.session import SessionUpdate

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _unique_dm() -> str:
    """Return a unique DM email per test."""
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _make_campaign(db: Session, dm_email: str):
    """Create a minimal test campaign."""
    return camp_svc.create_campaign(
        db, name="Test Campaign", setting="Forgotten Realms", tone="Epic", dm_email=dm_email
    )


def _make_adventure(db: Session, campaign_id: uuid.UUID, dm_email: str):
    """Create a minimal test adventure."""
    return adv_svc.create_adventure(
        db,
        campaign_id=campaign_id,
        title="Test Adventure",
        tier=AdventureTier.TIER2,
        dm_email=dm_email,
    )


def _make_session(
    db: Session,
    adventure_id: uuid.UUID,
    dm_email: str,
    session_number: int = 1,
    title: str = "Session One",
):
    """Create a minimal test game session."""
    return sess_svc.create_session(
        db,
        adventure_id=adventure_id,
        session_number=session_number,
        title=title,
        dm_email=dm_email,
    )


def _combatant(name: str, dex: int, hp: int = 20) -> dict:
    """Build a minimal combatant dict for roll_initiative."""
    return {"name": name, "dex_score": dex, "hp": hp, "max_hp": hp, "type": "pc"}


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------


class TestCreateSession:
    """Tests for session_service.create_session."""

    def test_create_minimal_session(self, duckdb_session: Session):
        """Create a session with required fields only."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        assert gs.title == "Session One"
        assert gs.session_number == 1
        assert gs.status == SessionStatus.DRAFT

    def test_empty_title_raises(self, duckdb_session: Session):
        """Empty session title raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        with pytest.raises(ValueError, match="title"):
            sess_svc.create_session(
                duckdb_session, adventure_id=adv.id, session_number=1, title="   ", dm_email=dm
            )

    def test_session_number_zero_raises(self, duckdb_session: Session):
        """session_number < 1 raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        with pytest.raises(ValueError, match=">="):
            sess_svc.create_session(
                duckdb_session, adventure_id=adv.id, session_number=0, title="X", dm_email=dm
            )

    def test_non_owner_cannot_create(self, duckdb_session: Session):
        """Non-owner gets PermissionError."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            sess_svc.create_session(
                duckdb_session, adventure_id=adv.id, session_number=1, title="X", dm_email=dm2
            )

    def test_session_limit_enforced(self, duckdb_session: Session):
        """Creating more than MAX_SESSIONS_PER_ADVENTURE raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        limit = sess_svc.MAX_SESSIONS_PER_ADVENTURE
        for i in range(1, limit + 1):
            sess_svc.create_session(
                duckdb_session, adventure_id=adv.id, session_number=i, title=f"S{i}", dm_email=dm
            )
        with pytest.raises(ValueError, match="maximum"):
            sess_svc.create_session(
                duckdb_session,
                adventure_id=adv.id,
                session_number=limit + 1,
                title="Too Many",
                dm_email=dm,
            )


class TestGetSession:
    """Tests for session_service.get_session."""

    def test_get_existing(self, duckdb_session: Session):
        """Returns correct session by ID."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        fetched = sess_svc.get_session(duckdb_session, gs.id, dm)
        assert fetched.id == gs.id

    def test_missing_raises(self, duckdb_session: Session):
        """Non-existent ID raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError):
            sess_svc.get_session(duckdb_session, uuid.uuid4(), dm)

    def test_non_owner_raises(self, duckdb_session: Session):
        """Non-owner gets PermissionError."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        gs = _make_session(duckdb_session, adv.id, dm1)
        with pytest.raises(PermissionError):
            sess_svc.get_session(duckdb_session, gs.id, dm2)


class TestUpdateSession:
    """Tests for session_service.update_session."""

    def test_update_title(self, duckdb_session: Session):
        """Updating title stores the new value."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        updated = sess_svc.update_session(
            duckdb_session, gs.id, dm, SessionUpdate(title="Renamed Session")
        )
        assert updated.title == "Renamed Session"


class TestDeleteSession:
    """Tests for session_service.delete_session."""

    def test_delete_removes_session(self, duckdb_session: Session):
        """Deleted session no longer appears in list."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        sess_svc.delete_session(duckdb_session, gs.id, dm)
        assert sess_svc.list_sessions(duckdb_session, adv.id, dm) == []

    def test_delete_missing_raises(self, duckdb_session: Session):
        """Deleting non-existent session raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError):
            sess_svc.delete_session(duckdb_session, uuid.uuid4(), dm)


# ---------------------------------------------------------------------------
# Status lifecycle
# ---------------------------------------------------------------------------


class TestAdvanceStatus:
    """Tests for session_service.advance_status."""

    def test_draft_to_ready(self, duckdb_session: Session):
        """Draft advances to Ready."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        assert gs.status == SessionStatus.DRAFT
        updated = sess_svc.advance_status(duckdb_session, gs.id, dm)
        assert updated.status == SessionStatus.READY

    def test_ready_to_in_progress(self, duckdb_session: Session):
        """Ready advances to InProgress."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        sess_svc.advance_status(duckdb_session, gs.id, dm)
        updated = sess_svc.advance_status(duckdb_session, gs.id, dm)
        assert updated.status == SessionStatus.IN_PROGRESS

    def test_in_progress_to_complete(self, duckdb_session: Session):
        """InProgress advances to Complete."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        for _ in range(3):
            sess_svc.advance_status(duckdb_session, gs.id, dm)
        fetched = sess_svc.get_session(duckdb_session, gs.id, dm)
        assert fetched.status == SessionStatus.COMPLETE

    def test_complete_cannot_advance(self, duckdb_session: Session):
        """Advancing a Complete session raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        for _ in range(3):
            sess_svc.advance_status(duckdb_session, gs.id, dm)
        with pytest.raises(ValueError, match="Complete"):
            sess_svc.advance_status(duckdb_session, gs.id, dm)

    def test_non_owner_cannot_advance(self, duckdb_session: Session):
        """Non-owner gets PermissionError."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        gs = _make_session(duckdb_session, adv.id, dm1)
        with pytest.raises(PermissionError):
            sess_svc.advance_status(duckdb_session, gs.id, dm2)


# ---------------------------------------------------------------------------
# Initiative roller
# ---------------------------------------------------------------------------


class TestRollInitiative:
    """Tests for session_service.roll_initiative (pure function)."""

    def test_returns_all_combatants(self):
        """All input combatants appear in output."""
        combatants = [_combatant("Aldric", dex=14), _combatant("Goblin", dex=8)]
        result = sess_svc.roll_initiative(combatants)
        assert len(result) == 2
        names = {c["name"] for c in result}
        assert names == {"Aldric", "Goblin"}

    def test_adds_required_fields(self):
        """Each result has initiative, roll, active, defeated fields."""
        result = sess_svc.roll_initiative([_combatant("Troll", dex=10)])
        r = result[0]
        assert "initiative" in r
        assert "roll" in r
        assert r["active"] is False
        assert isinstance(r["defeated"], bool)

    def test_roll_within_bounds(self):
        """Roll is between 1 and 20 inclusive; initiative = roll + dex_mod."""
        combatants = [_combatant("Fighter", dex=16)]  # dex_mod = +3
        for _ in range(20):
            result = sess_svc.roll_initiative(combatants)
            r = result[0]
            assert 1 <= r["roll"] <= 20
            assert r["initiative"] == r["roll"] + 3

    def test_negative_dex_modifier(self):
        """Combatant with dex 6 (mod -2) has initiative = roll - 2."""
        for _ in range(10):
            result = sess_svc.roll_initiative([_combatant("Oaf", dex=6)])
            assert result[0]["initiative"] == result[0]["roll"] - 2

    def test_sorted_highest_first(self):
        """Results are sorted by initiative descending."""
        # Run many times to catch random ordering bugs
        for _ in range(30):
            combatants = [_combatant(f"C{i}", dex=10 + i) for i in range(5)]
            result = sess_svc.roll_initiative(combatants)
            initiatives = [r["initiative"] for r in result]
            assert initiatives == sorted(initiatives, reverse=True)

    def test_defeated_flag_set_for_zero_hp(self):
        """Combatant with hp=0 gets defeated=True."""
        result = sess_svc.roll_initiative([_combatant("Dying Goblin", dex=8, hp=0)])
        assert result[0]["defeated"] is True

    def test_alive_combatant_not_defeated(self):
        """Combatant with hp>0 gets defeated=False."""
        result = sess_svc.roll_initiative([_combatant("Hero", dex=14, hp=30)])
        assert result[0]["defeated"] is False

    def test_five_combatants_all_present(self):
        """Five combatants all appear in output with correct structure."""
        combatants = [_combatant(f"Actor{i}", dex=8 + i * 2) for i in range(5)]
        result = sess_svc.roll_initiative(combatants)
        assert len(result) == 5
        for r in result:
            assert r["roll"] >= 1
            assert r["roll"] <= 20

    def test_missing_field_raises(self):
        """Combatant missing a required field raises ValueError."""
        bad = {"name": "NoHp", "dex_score": 10, "hp": 10, "type": "pc"}  # missing max_hp
        with pytest.raises(ValueError, match="max_hp"):
            sess_svc.roll_initiative([bad])

    def test_empty_list_returns_empty(self):
        """Empty combatant list returns empty list."""
        assert sess_svc.roll_initiative([]) == []


# ---------------------------------------------------------------------------
# Update notes
# ---------------------------------------------------------------------------


class TestUpdateNotes:
    """Tests for session_service.update_notes."""

    def test_saves_notes(self, duckdb_session: Session):
        """Notes are stored on the session."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        updated = sess_svc.update_notes(duckdb_session, gs.id, dm, "The party killed the dragon.")
        assert updated.actual_notes == "The party killed the dragon."

    def test_empty_notes_clears(self, duckdb_session: Session):
        """Passing empty string sets notes to None."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        sess_svc.update_notes(duckdb_session, gs.id, dm, "Some notes")
        cleared = sess_svc.update_notes(duckdb_session, gs.id, dm, "")
        assert cleared.actual_notes is None

    def test_non_owner_cannot_update_notes(self, duckdb_session: Session):
        """Non-owner gets PermissionError."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        gs = _make_session(duckdb_session, adv.id, dm1)
        with pytest.raises(PermissionError):
            sess_svc.update_notes(duckdb_session, gs.id, dm2, "Hacked notes")
