"""Tests for services/campaign_service.py — business logic and authorization."""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as svc
from domain.campaign import CampaignUpdate

DM1 = "dm1@example.com"
DM2 = "dm2@example.com"


def _create(session: Session, dm_email: str = DM1, name: str = "Test Campaign"):
    """Helper: create a campaign via service."""
    return svc.create_campaign(
        session,
        name=name,
        setting="Faerûn",
        tone="Heroic",
        dm_email=dm_email,
    )


class TestCreateCampaign:
    """Tests for campaign_service.create_campaign."""

    def test_create_returns_campaign_read(self, duckdb_session: Session):
        """create_campaign returns a populated CampaignRead."""
        c = _create(duckdb_session)
        assert c.name == "Test Campaign"
        assert c.dm_email == DM1
        assert c.id is not None

    def test_create_normalises_email(self, duckdb_session: Session):
        """DM email is lowercased and stored normalised."""
        c = svc.create_campaign(
            duckdb_session,
            name="X",
            setting="X",
            tone="X",
            dm_email="  DM@EXAMPLE.COM  ",
        )
        assert c.dm_email == "dm@example.com"

    def test_create_over_limit_raises(self, duckdb_session: Session):
        """Creating more than MAX_CAMPAIGNS_PER_DM raises ValueError."""
        unique_dm = f"limit_{uuid.uuid4().hex[:8]}@example.com"
        for i in range(svc.MAX_CAMPAIGNS_PER_DM):
            svc.create_campaign(
                duckdb_session,
                name=f"Camp {i}",
                setting="X",
                tone="X",
                dm_email=unique_dm,
            )
        with pytest.raises(ValueError, match="limit reached"):
            svc.create_campaign(
                duckdb_session,
                name="One Too Many",
                setting="X",
                tone="X",
                dm_email=unique_dm,
            )


class TestGetCampaign:
    """Tests for campaign_service.get_campaign."""

    def test_owner_can_get(self, duckdb_session: Session):
        """DM can retrieve their own campaign."""
        c = _create(duckdb_session)
        fetched = svc.get_campaign(duckdb_session, c.id, DM1)
        assert fetched.id == c.id

    def test_non_owner_raises(self, duckdb_session: Session):
        """Non-owner gets PermissionError."""
        c = _create(duckdb_session)
        with pytest.raises(PermissionError):
            svc.get_campaign(duckdb_session, c.id, DM2)

    def test_missing_raises_value_error(self, duckdb_session: Session):
        """Unknown UUID raises ValueError."""
        with pytest.raises(ValueError, match="not found"):
            svc.get_campaign(duckdb_session, uuid.uuid4(), DM1)


class TestListCampaigns:
    """Tests for campaign_service.list_campaigns."""

    def test_returns_only_dm_campaigns(self, duckdb_session: Session):
        """list_campaigns filters to the requesting DM."""
        unique1 = f"list1_{uuid.uuid4().hex[:8]}@example.com"
        unique2 = f"list2_{uuid.uuid4().hex[:8]}@example.com"
        _create(duckdb_session, dm_email=unique1, name="Mine")
        _create(duckdb_session, dm_email=unique2, name="Theirs")
        results = svc.list_campaigns(duckdb_session, unique1)
        assert all(r.dm_email == unique1 for r in results)
        assert any(r.name == "Mine" for r in results)


class TestUpdateCampaign:
    """Tests for campaign_service.update_campaign."""

    def test_owner_can_update(self, duckdb_session: Session):
        """DM can update their own campaign."""
        c = _create(duckdb_session, name="Old Name")
        updated = svc.update_campaign(duckdb_session, c.id, DM1, CampaignUpdate(name="New Name"))
        assert updated.name == "New Name"

    def test_non_owner_cannot_update(self, duckdb_session: Session):
        """Non-owner update raises PermissionError."""
        c = _create(duckdb_session)
        with pytest.raises(PermissionError):
            svc.update_campaign(duckdb_session, c.id, DM2, CampaignUpdate(name="Hacked"))


class TestDeleteCampaign:
    """Tests for campaign_service.delete_campaign."""

    def test_owner_can_delete(self, duckdb_session: Session):
        """DM can delete their own campaign."""
        c = _create(duckdb_session)
        svc.delete_campaign(duckdb_session, c.id, DM1)
        with pytest.raises(ValueError):
            svc.get_campaign(duckdb_session, c.id, DM1)

    def test_non_owner_cannot_delete(self, duckdb_session: Session):
        """Non-owner delete raises PermissionError."""
        c = _create(duckdb_session)
        with pytest.raises(PermissionError):
            svc.delete_campaign(duckdb_session, c.id, DM2)
