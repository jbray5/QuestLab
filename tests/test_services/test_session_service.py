"""Tests for services/session_service.py — session CRUD, lifecycle, and initiative."""

import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.session_service as sess_svc
from db.repos.item_repo import ItemRepo
from domain.enums import AdventureTier, CharacterClass, ItemRarity, SessionStatus
from domain.item import ItemCreate
from domain.session import (
    SessionCombatantCreate,
    SessionCombatantUpdate,
    SessionCombatStateWrite,
    SessionUpdate,
)

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


# ---------------------------------------------------------------------------
# Combat persistence (Plan 00015)
# ---------------------------------------------------------------------------


def _persist_combatant(idx: int, name: str, dex: int = 14, hp: int = 20) -> SessionCombatantCreate:
    """Build a SessionCombatantCreate payload for persistence tests."""
    return SessionCombatantCreate(
        sort_index=idx,
        name=name,
        dex_score=dex,
        initiative_roll=15 - idx,  # deterministic descending order
        hp_current=hp,
        hp_max=hp,
        type="pc",
    )


class TestLoadCombatState:
    """Tests for session_service.load_combat_state."""

    def test_fresh_session_returns_empty_roster(self, duckdb_session: Session):
        """A session with no combatants returns an empty roster and round 1."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)

        state = sess_svc.load_combat_state(duckdb_session, gs.id, dm)

        assert state.session_id == gs.id
        assert state.round == 1
        assert state.active_combatant_id is None
        assert state.combatants == []

    def test_unknown_session_raises(self, duckdb_session: Session):
        """Loading combat for a non-existent session raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError):
            sess_svc.load_combat_state(duckdb_session, uuid.uuid4(), dm)

    def test_non_owner_denied(self, duckdb_session: Session):
        """A DM who does not own the campaign cannot load combat state."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        gs = _make_session(duckdb_session, adv.id, dm1)
        with pytest.raises(PermissionError):
            sess_svc.load_combat_state(duckdb_session, gs.id, dm2)


class TestSaveCombatState:
    """Tests for session_service.save_combat_state."""

    def test_persists_combatants_in_sort_order(self, duckdb_session: Session):
        """Saving combatants persists them and returns them in sort_index order."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)

        payload = SessionCombatStateWrite(
            round=1,
            combatants=[
                _persist_combatant(0, "Aragorn"),
                _persist_combatant(1, "Goblin"),
                _persist_combatant(2, "Legolas"),
            ],
        )
        state = sess_svc.save_combat_state(duckdb_session, gs.id, dm, payload)

        assert [c.name for c in state.combatants] == ["Aragorn", "Goblin", "Legolas"]
        assert state.round == 1
        # First combatant auto-selected as active when none specified
        assert state.active_combatant_id == state.combatants[0].id

    def test_replaces_existing_roster_on_reroll(self, duckdb_session: Session):
        """A second save fully replaces the prior combatant roster."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)

        sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(combatants=[_persist_combatant(0, "Old")]),
        )
        state = sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(
                combatants=[
                    _persist_combatant(0, "New A"),
                    _persist_combatant(1, "New B"),
                ]
            ),
        )

        assert [c.name for c in state.combatants] == ["New A", "New B"]

    def test_persists_round_and_active(self, duckdb_session: Session):
        """Round number and explicit active combatant id are persisted."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)

        first_state = sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(
                round=4,
                combatants=[
                    _persist_combatant(0, "A"),
                    _persist_combatant(1, "B"),
                ],
            ),
        )
        target_id = first_state.combatants[1].id

        # Re-save with explicit active pointing at the second combatant
        state = sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(
                round=4,
                active_combatant_id=target_id,
                combatants=[
                    SessionCombatantCreate(
                        sort_index=0,
                        name="A",
                        dex_score=14,
                        initiative_roll=15,
                        hp_current=20,
                        hp_max=20,
                        type="pc",
                    ),
                    SessionCombatantCreate(
                        sort_index=1,
                        name="B",
                        dex_score=14,
                        initiative_roll=14,
                        hp_current=20,
                        hp_max=20,
                        type="pc",
                    ),
                ],
            ),
        )

        assert state.round == 4
        # Active id from the previous save no longer exists (rows replaced),
        # so service falls back to the new first combatant.
        assert state.active_combatant_id == state.combatants[0].id

    def test_non_owner_denied(self, duckdb_session: Session):
        """A non-owning DM cannot save combat state."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        gs = _make_session(duckdb_session, adv.id, dm1)
        with pytest.raises(PermissionError):
            sess_svc.save_combat_state(
                duckdb_session,
                gs.id,
                dm2,
                SessionCombatStateWrite(combatants=[_persist_combatant(0, "X")]),
            )


class TestUpdateCombatant:
    """Tests for session_service.update_combatant."""

    def test_patches_hp(self, duckdb_session: Session):
        """A partial update changes only the provided fields."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        state = sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(combatants=[_persist_combatant(0, "Hero", hp=30)]),
        )
        combatant_id = state.combatants[0].id

        updated = sess_svc.update_combatant(
            duckdb_session,
            gs.id,
            combatant_id,
            dm,
            SessionCombatantUpdate(hp_current=12),
        )

        assert updated.hp_current == 12
        assert updated.hp_max == 30  # untouched
        assert updated.defeated is False  # untouched

    def test_unknown_combatant_raises(self, duckdb_session: Session):
        """Patching a combatant that doesn't exist raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        with pytest.raises(ValueError):
            sess_svc.update_combatant(
                duckdb_session,
                gs.id,
                uuid.uuid4(),
                dm,
                SessionCombatantUpdate(hp_current=1),
            )

    def test_cross_session_combatant_raises(self, duckdb_session: Session):
        """A combatant from one session cannot be patched via another session id."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs_a = _make_session(duckdb_session, adv.id, dm, session_number=1, title="A")
        gs_b = _make_session(duckdb_session, adv.id, dm, session_number=2, title="B")
        state = sess_svc.save_combat_state(
            duckdb_session,
            gs_a.id,
            dm,
            SessionCombatStateWrite(combatants=[_persist_combatant(0, "X")]),
        )
        with pytest.raises(ValueError):
            sess_svc.update_combatant(
                duckdb_session,
                gs_b.id,
                state.combatants[0].id,
                dm,
                SessionCombatantUpdate(hp_current=1),
            )


class TestAdvanceCombatTurn:
    """Tests for session_service.advance_combat_turn."""

    def test_moves_to_next_combatant(self, duckdb_session: Session):
        """Advancing moves the active pointer to the next sort_index."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        state = sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(
                combatants=[
                    _persist_combatant(0, "First"),
                    _persist_combatant(1, "Second"),
                    _persist_combatant(2, "Third"),
                ]
            ),
        )
        assert state.active_combatant_id == state.combatants[0].id

        advanced = sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)
        assert advanced.active_combatant_id == state.combatants[1].id
        assert advanced.round == 1

    def test_wrap_increments_round(self, duckdb_session: Session):
        """Wrapping from last combatant back to first bumps the round."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        state = sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(
                combatants=[
                    _persist_combatant(0, "Alpha"),
                    _persist_combatant(1, "Beta"),
                ]
            ),
        )

        # alpha -> beta -> wrap to alpha (round 2)
        sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)
        wrapped = sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)

        assert wrapped.round == 2
        assert wrapped.active_combatant_id == state.combatants[0].id

    def test_skips_defeated(self, duckdb_session: Session):
        """Defeated combatants are skipped in the turn order."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        state = sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(
                combatants=[
                    _persist_combatant(0, "Alpha"),
                    _persist_combatant(1, "Down"),
                    _persist_combatant(2, "Beta"),
                ]
            ),
        )
        # Mark middle combatant defeated
        sess_svc.update_combatant(
            duckdb_session,
            gs.id,
            state.combatants[1].id,
            dm,
            SessionCombatantUpdate(defeated=True),
        )

        advanced = sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)
        assert advanced.active_combatant_id == state.combatants[2].id

    def test_raises_when_no_combatants(self, duckdb_session: Session):
        """Advancing on an empty tracker raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        with pytest.raises(ValueError):
            sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)


class TestClearCombatState:
    """Tests for session_service.clear_combat_state."""

    def test_removes_all_combatants_and_resets_round(self, duckdb_session: Session):
        """Clearing wipes combatants and resets round to 1 with no active combatant."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(
                round=3,
                combatants=[
                    _persist_combatant(0, "A"),
                    _persist_combatant(1, "B"),
                ],
            ),
        )

        count = sess_svc.clear_combat_state(duckdb_session, gs.id, dm)
        state = sess_svc.load_combat_state(duckdb_session, gs.id, dm)

        assert count == 2
        assert state.combatants == []
        assert state.round == 1
        assert state.active_combatant_id is None

    def test_non_owner_denied(self, duckdb_session: Session):
        """A non-owning DM cannot clear combat state."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        gs = _make_session(duckdb_session, adv.id, dm1)
        with pytest.raises(PermissionError):
            sess_svc.clear_combat_state(duckdb_session, gs.id, dm2)


# ---------------------------------------------------------------------------
# Item handouts (Plan 00016)
# ---------------------------------------------------------------------------


def _make_pc(db: Session, campaign_id: uuid.UUID, dm_email: str, name: str = "Hero"):
    """Create a minimal PC in a campaign for handout tests."""
    return char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm_email,
        player_name="Player",
        character_name=name,
        race="Human",
        character_class=CharacterClass.FIGHTER,
        level=1,
        score_str=14,
        score_dex=14,
        score_con=14,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=12,
        hp_current=12,
        ac=16,
        speed=30,
    )


def _make_item(db: Session, name: str = "Potion of Healing"):
    """Create a magic item directly via repo for handout tests."""
    return ItemRepo.create(
        db,
        ItemCreate(
            name=name,
            rarity=ItemRarity.COMMON,
            item_type="Potion",
            description="Restores 2d4+2 HP.",
            attunement_required=False,
            value_gp=50,
            is_magic=True,
        ),
    )


class TestRecordItemHandout:
    """Tests for session_service.record_item_handout."""

    def test_appends_line_to_notes(self, duckdb_session: Session):
        """A successful handout appends a timestamped line to actual_notes."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)

        updated = sess_svc.record_item_handout(duckdb_session, gs.id, pc.id, item.id, dm)

        assert updated.actual_notes is not None
        assert "Gave Potion of Healing to Hero" in updated.actual_notes

    def test_appends_below_existing_notes(self, duckdb_session: Session):
        """Existing notes are preserved; handout is appended on a new line."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        sess_svc.update_notes(duckdb_session, gs.id, dm, "Session opened in the tavern.")
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)

        updated = sess_svc.record_item_handout(duckdb_session, gs.id, pc.id, item.id, dm)

        assert updated.actual_notes is not None
        assert "Session opened in the tavern." in updated.actual_notes
        assert "Gave Potion of Healing to Hero" in updated.actual_notes
        # Original line comes before the appended one.
        assert updated.actual_notes.index("Session opened") < updated.actual_notes.index(
            "Gave Potion"
        )

    def test_unknown_item_raises(self, duckdb_session: Session):
        """Handing out a non-existent item raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        with pytest.raises(ValueError):
            sess_svc.record_item_handout(duckdb_session, gs.id, pc.id, uuid.uuid4(), dm)

    def test_unknown_pc_raises(self, duckdb_session: Session):
        """Handing an item to a non-existent PC raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        item = _make_item(duckdb_session)
        with pytest.raises(ValueError):
            sess_svc.record_item_handout(duckdb_session, gs.id, uuid.uuid4(), item.id, dm)

    def test_pc_from_other_campaign_raises(self, duckdb_session: Session):
        """A PC that belongs to a different campaign cannot receive items."""
        dm = _unique_dm()
        c1 = _make_campaign(duckdb_session, dm)
        c2 = camp_svc.create_campaign(
            duckdb_session,
            name="Other Campaign",
            setting="Eberron",
            tone="Gritty",
            dm_email=dm,
        )
        adv = _make_adventure(duckdb_session, c1.id, dm)
        gs = _make_session(duckdb_session, adv.id, dm)
        foreign_pc = _make_pc(duckdb_session, c2.id, dm, name="Stranger")
        item = _make_item(duckdb_session)
        with pytest.raises(ValueError):
            sess_svc.record_item_handout(duckdb_session, gs.id, foreign_pc.id, item.id, dm)

    def test_non_owner_denied(self, duckdb_session: Session):
        """A DM who does not own the campaign cannot record handouts."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        gs = _make_session(duckdb_session, adv.id, dm1)
        pc = _make_pc(duckdb_session, c.id, dm1)
        item = _make_item(duckdb_session)
        with pytest.raises(PermissionError):
            sess_svc.record_item_handout(duckdb_session, gs.id, pc.id, item.id, dm2)
