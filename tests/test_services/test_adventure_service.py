"""Tests for services/adventure_service.py — business logic and authorization."""

import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
from domain.adventure import AdventureUpdate
from domain.enums import AdventureTier

DM1 = "advsvc_dm1@example.com"
DM2 = "advsvc_dm2@example.com"


def _campaign(session: Session, dm_email: str = DM1):
    """Helper: create a campaign."""
    return camp_svc.create_campaign(
        session, name="Parent Campaign", setting="Eberron", tone="Noir", dm_email=dm_email
    )


def _adventure(
    session: Session, campaign_id: uuid.UUID, dm_email: str = DM1, title: str = "Test Adventure"
):
    """Helper: create an adventure."""
    return adv_svc.create_adventure(
        session,
        campaign_id=campaign_id,
        title=title,
        tier=AdventureTier.TIER1,
        dm_email=dm_email,
    )


class TestCreateAdventure:
    """Tests for adventure_service.create_adventure."""

    def test_create_returns_adventure_read(self, duckdb_session: Session):
        """create_adventure returns populated AdventureRead."""
        c = _campaign(duckdb_session)
        a = _adventure(duckdb_session, c.id)
        assert a.title == "Test Adventure"
        assert a.campaign_id == c.id
        assert a.tier == AdventureTier.TIER1

    def test_non_owner_cannot_create(self, duckdb_session: Session):
        """DM who doesn't own the campaign cannot add adventures."""
        c = _campaign(duckdb_session, dm_email=DM1)
        with pytest.raises(PermissionError):
            _adventure(duckdb_session, c.id, dm_email=DM2)

    def test_invalid_npc_roster_raises(self, duckdb_session: Session):
        """NPC roster entry without name raises ValueError."""
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="name"):
            adv_svc.create_adventure(
                duckdb_session,
                campaign_id=c.id,
                title="Bad NPCs",
                tier=AdventureTier.TIER1,
                dm_email=DM1,
                npc_roster=[{"role": "villain"}],  # missing name
            )

    def test_npc_roster_missing_role_raises(self, duckdb_session: Session):
        """NPC roster entry without role raises ValueError."""
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="role"):
            adv_svc.create_adventure(
                duckdb_session,
                campaign_id=c.id,
                title="Bad NPCs",
                tier=AdventureTier.TIER1,
                dm_email=DM1,
                npc_roster=[{"name": "Lord Soth"}],  # missing role
            )

    def test_valid_npc_roster_accepted(self, duckdb_session: Session):
        """Valid NPC roster is stored."""
        c = _campaign(duckdb_session)
        a = adv_svc.create_adventure(
            duckdb_session,
            campaign_id=c.id,
            title="With NPCs",
            tier=AdventureTier.TIER2,
            dm_email=DM1,
            npc_roster=[{"name": "Elminster", "role": "Mentor"}],
        )
        assert a.npc_roster is not None
        assert a.npc_roster[0]["name"] == "Elminster"


class TestGetAdventure:
    """Tests for adventure_service.get_adventure."""

    def test_owner_can_get(self, duckdb_session: Session):
        """DM can retrieve their own adventure."""
        c = _campaign(duckdb_session)
        a = _adventure(duckdb_session, c.id)
        fetched = adv_svc.get_adventure(duckdb_session, a.id, DM1)
        assert fetched.id == a.id

    def test_non_owner_cannot_get(self, duckdb_session: Session):
        """Non-owner gets PermissionError."""
        c = _campaign(duckdb_session, dm_email=DM1)
        a = _adventure(duckdb_session, c.id, dm_email=DM1)
        with pytest.raises(PermissionError):
            adv_svc.get_adventure(duckdb_session, a.id, DM2)

    def test_missing_raises_value_error(self, duckdb_session: Session):
        """Unknown adventure UUID raises ValueError."""
        with pytest.raises(ValueError, match="not found"):
            adv_svc.get_adventure(duckdb_session, uuid.uuid4(), DM1)


class TestListAdventures:
    """Tests for adventure_service.list_adventures."""

    def test_returns_adventures_for_campaign(self, duckdb_session: Session):
        """list_adventures returns all adventures in the campaign."""
        c = _campaign(duckdb_session)
        _adventure(duckdb_session, c.id, title="A1")
        _adventure(duckdb_session, c.id, title="A2")
        results = adv_svc.list_adventures(duckdb_session, c.id, DM1)
        titles = [a.title for a in results]
        assert "A1" in titles
        assert "A2" in titles

    def test_non_owner_cannot_list(self, duckdb_session: Session):
        """Non-owner cannot list a campaign's adventures."""
        c = _campaign(duckdb_session, dm_email=DM1)
        with pytest.raises(PermissionError):
            adv_svc.list_adventures(duckdb_session, c.id, DM2)


class TestUpdateAdventure:
    """Tests for adventure_service.update_adventure."""

    def test_owner_can_update_title(self, duckdb_session: Session):
        """DM can update adventure title."""
        c = _campaign(duckdb_session)
        a = _adventure(duckdb_session, c.id, title="Old Title")
        updated = adv_svc.update_adventure(
            duckdb_session, a.id, DM1, AdventureUpdate(title="New Title")
        )
        assert updated.title == "New Title"

    def test_non_owner_cannot_update(self, duckdb_session: Session):
        """Non-owner update raises PermissionError."""
        c = _campaign(duckdb_session, dm_email=DM1)
        a = _adventure(duckdb_session, c.id, dm_email=DM1)
        with pytest.raises(PermissionError):
            adv_svc.update_adventure(duckdb_session, a.id, DM2, AdventureUpdate(title="Hacked"))


class TestDeleteAdventure:
    """Tests for adventure_service.delete_adventure."""

    def test_owner_can_delete(self, duckdb_session: Session):
        """DM can delete their own adventure."""
        c = _campaign(duckdb_session)
        a = _adventure(duckdb_session, c.id)
        adv_svc.delete_adventure(duckdb_session, a.id, DM1)
        with pytest.raises(ValueError):
            adv_svc.get_adventure(duckdb_session, a.id, DM1)

    def test_non_owner_cannot_delete(self, duckdb_session: Session):
        """Non-owner delete raises PermissionError."""
        c = _campaign(duckdb_session, dm_email=DM1)
        a = _adventure(duckdb_session, c.id, dm_email=DM1)
        with pytest.raises(PermissionError):
            adv_svc.delete_adventure(duckdb_session, a.id, DM2)
