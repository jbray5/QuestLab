"""Tests for npc_service (Plan 00033)."""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.npc_service as npc_svc
from domain.enums import NpcStatus
from domain.npc import NpcCreate, NpcUpdate


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm):
    return camp_svc.create_campaign(db, name="C", setting="R", tone="T", dm_email=dm)


class TestCreateNpc:
    """create_npc — happy path + validation."""

    def test_create_minimal(self, duckdb_session: Session):
        """Just a name is enough."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        result = npc_svc.create_npc(duckdb_session, c.id, dm, NpcCreate(name="Captain Aldric"))
        assert result.name == "Captain Aldric"
        assert result.status == NpcStatus.ALIVE
        assert result.campaign_id == c.id

    def test_create_full(self, duckdb_session: Session):
        """All fields round-trip."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        payload = NpcCreate(
            name="Sage Mireldra",
            role="elven sage",
            race="Elf",
            gender="Female",
            age="ancient",
            appearance="Slim, silver-haired, eyes the color of frost.",
            personality="Patient but caustic with fools.",
            motivation="To prevent the second sundering.",
            secret="She is the second sundering's architect.",
            dialog_hooks=["What do you know of the Lattice?"],
            tags=["patron", "spellcaster"],
            status=NpcStatus.ALIVE,
            location="Tower of Mireldra, on the bluff",
            notes="Voice: dry whisper.",
        )
        result = npc_svc.create_npc(duckdb_session, c.id, dm, payload)
        assert result.role == "elven sage"
        assert result.tags == ["patron", "spellcaster"]
        assert result.dialog_hooks == ["What do you know of the Lattice?"]
        assert "second sundering" in (result.motivation or "")

    def test_create_empty_name_rejected(self, duckdb_session: Session):
        """Whitespace-only name raises ValueError."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        # Pydantic also enforces min_length=1; the service double-checks
        # after a strip.
        with pytest.raises(ValueError):
            npc_svc.create_npc(duckdb_session, c.id, dm, NpcCreate(name="   "))

    def test_non_owner_denied(self, duckdb_session: Session):
        """A different DM cannot create NPCs in someone else's campaign."""
        dm1, dm2 = _dm(), _dm()
        c = _campaign(duckdb_session, dm1)
        with pytest.raises(PermissionError):
            npc_svc.create_npc(duckdb_session, c.id, dm2, NpcCreate(name="Trickster"))

    def test_unknown_campaign_raises(self, duckdb_session: Session):
        """Bad campaign id raises ValueError."""
        dm = _dm()
        with pytest.raises(ValueError):
            npc_svc.create_npc(duckdb_session, uuid.uuid4(), dm, NpcCreate(name="Ghost"))


class TestListNpcs:
    """list_for_campaign."""

    def test_empty(self, duckdb_session: Session):
        """Fresh campaign returns []."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        assert npc_svc.list_for_campaign(duckdb_session, c.id, dm) == []

    def test_returns_only_own_campaign(self, duckdb_session: Session):
        """NPCs in another campaign don't leak."""
        dm1, dm2 = _dm(), _dm()
        c1 = _campaign(duckdb_session, dm1)
        c2 = _campaign(duckdb_session, dm2)
        npc_svc.create_npc(duckdb_session, c1.id, dm1, NpcCreate(name="In C1"))
        npc_svc.create_npc(duckdb_session, c2.id, dm2, NpcCreate(name="In C2"))
        c1_list = npc_svc.list_for_campaign(duckdb_session, c1.id, dm1)
        assert [n.name for n in c1_list] == ["In C1"]

    def test_orders_by_name(self, duckdb_session: Session):
        """Result is alphabetical."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        for n in ["Zara", "Aldric", "Marek"]:
            npc_svc.create_npc(duckdb_session, c.id, dm, NpcCreate(name=n))
        names = [n.name for n in npc_svc.list_for_campaign(duckdb_session, c.id, dm)]
        assert names == ["Aldric", "Marek", "Zara"]


class TestUpdateNpc:
    """update_npc — partial updates and status transitions."""

    def test_update_status_to_dead(self, duckdb_session: Session):
        """Status patches through."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        npc = npc_svc.create_npc(duckdb_session, c.id, dm, NpcCreate(name="Aldric"))
        updated = npc_svc.update_npc(duckdb_session, npc.id, dm, NpcUpdate(status=NpcStatus.DEAD))
        assert updated.status == NpcStatus.DEAD

    def test_update_dialog_hooks_replaces_list(self, duckdb_session: Session):
        """Updating dialog_hooks replaces the whole list."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        npc = npc_svc.create_npc(
            duckdb_session,
            c.id,
            dm,
            NpcCreate(name="Aldric", dialog_hooks=["Old one"]),
        )
        updated = npc_svc.update_npc(
            duckdb_session, npc.id, dm, NpcUpdate(dialog_hooks=["New A", "New B"])
        )
        assert updated.dialog_hooks == ["New A", "New B"]

    def test_unset_field_preserved(self, duckdb_session: Session):
        """Fields the patch doesn't touch keep their existing value."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        npc = npc_svc.create_npc(
            duckdb_session,
            c.id,
            dm,
            NpcCreate(name="Aldric", motivation="Power"),
        )
        # Patch only the role; motivation must survive.
        updated = npc_svc.update_npc(duckdb_session, npc.id, dm, NpcUpdate(role="captain"))
        assert updated.role == "captain"
        assert updated.motivation == "Power"

    def test_non_owner_denied(self, duckdb_session: Session):
        """A different DM can't update someone else's NPC."""
        dm1, dm2 = _dm(), _dm()
        c = _campaign(duckdb_session, dm1)
        npc = npc_svc.create_npc(duckdb_session, c.id, dm1, NpcCreate(name="Aldric"))
        with pytest.raises(PermissionError):
            npc_svc.update_npc(duckdb_session, npc.id, dm2, NpcUpdate(role="impersonator"))


class TestDeleteNpc:
    """delete_npc — happy path + authz."""

    def test_delete(self, duckdb_session: Session):
        """Delete removes the row."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        npc = npc_svc.create_npc(duckdb_session, c.id, dm, NpcCreate(name="Gone"))
        npc_svc.delete_npc(duckdb_session, npc.id, dm)
        with pytest.raises(ValueError):
            npc_svc.get_npc(duckdb_session, npc.id, dm)

    def test_non_owner_denied(self, duckdb_session: Session):
        """A different DM can't delete someone else's NPC."""
        dm1, dm2 = _dm(), _dm()
        c = _campaign(duckdb_session, dm1)
        npc = npc_svc.create_npc(duckdb_session, c.id, dm1, NpcCreate(name="Aldric"))
        with pytest.raises(PermissionError):
            npc_svc.delete_npc(duckdb_session, npc.id, dm2)


class TestGenerateFromAi:
    """generate_npc_from_ai — orchestrates ai_service + persists."""

    def test_saves_when_save_true(self, duckdb_session: Session, monkeypatch):
        """Default save=True persists the AI result."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)

        def fake_ai(role, setting, tone):
            return {
                "name": "Branwen the Patient",
                "appearance": "Gray robes, owl on her shoulder.",
                "personality": "Listens longer than she speaks.",
                "secret": "She runs the rumor network.",
                "dialog_hooks": ["What price for an honest answer?"],
            }

        from services import ai_service

        monkeypatch.setattr(ai_service, "generate_npc", fake_ai)

        result = npc_svc.generate_npc_from_ai(
            duckdb_session, c.id, dm, role="rumormonger", save=True
        )
        assert result.name == "Branwen the Patient"
        # It's persisted — re-fetch by ID.
        again = npc_svc.get_npc(duckdb_session, result.id, dm)
        assert again.name == "Branwen the Patient"
        assert again.role == "rumormonger"

    def test_preview_does_not_save(self, duckdb_session: Session, monkeypatch):
        """save=False returns a preview without committing."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)

        def fake_ai(role, setting, tone):
            return {
                "name": "Preview Pete",
                "personality": "Theoretical.",
                "dialog_hooks": [],
            }

        from services import ai_service

        monkeypatch.setattr(ai_service, "generate_npc", fake_ai)

        result = npc_svc.generate_npc_from_ai(duckdb_session, c.id, dm, role="theorist", save=False)
        assert result.name == "Preview Pete"
        # Not in DB — listing returns empty.
        assert npc_svc.list_for_campaign(duckdb_session, c.id, dm) == []

    def test_non_owner_denied(self, duckdb_session: Session):
        """A different DM can't generate in someone else's campaign."""
        dm1, dm2 = _dm(), _dm()
        c = _campaign(duckdb_session, dm1)
        with pytest.raises(PermissionError):
            npc_svc.generate_npc_from_ai(duckdb_session, c.id, dm2, role="anything")
