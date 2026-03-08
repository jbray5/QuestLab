"""Tests for db/repos/campaign_repo.py — CRUD against in-memory DuckDB."""

import uuid

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from domain.campaign import CampaignCreate, CampaignUpdate


def _make_campaign(dm_email: str = "dm@example.com", name: str = "Test Campaign") -> CampaignCreate:
    """Return a minimal valid CampaignCreate."""
    return CampaignCreate(
        name=name,
        setting="Forgotten Realms",
        tone="Heroic",
        dm_email=dm_email,
    )


class TestCampaignRepoCreate:
    """Tests for CampaignRepo.create."""

    def test_create_returns_campaign_with_id(self, duckdb_session: Session):
        """Created campaign has a UUID primary key."""
        data = _make_campaign()
        campaign = CampaignRepo.create(duckdb_session, data)
        assert campaign.id is not None
        assert isinstance(campaign.id, uuid.UUID)

    def test_create_persists_fields(self, duckdb_session: Session):
        """All create fields are stored and retrievable."""
        data = _make_campaign(name="The Lost Mine")
        campaign = CampaignRepo.create(duckdb_session, data)
        assert campaign.name == "The Lost Mine"
        assert campaign.setting == "Forgotten Realms"
        assert campaign.dm_email == "dm@example.com"


class TestCampaignRepoGetById:
    """Tests for CampaignRepo.get_by_id."""

    def test_get_existing(self, duckdb_session: Session):
        """get_by_id returns the correct campaign."""
        campaign = CampaignRepo.create(duckdb_session, _make_campaign())
        fetched = CampaignRepo.get_by_id(duckdb_session, campaign.id)
        assert fetched is not None
        assert fetched.id == campaign.id

    def test_get_missing_returns_none(self, duckdb_session: Session):
        """get_by_id returns None for an unknown UUID."""
        result = CampaignRepo.get_by_id(duckdb_session, uuid.uuid4())
        assert result is None


class TestCampaignRepoListByDm:
    """Tests for CampaignRepo.list_by_dm."""

    def test_list_returns_only_dm_campaigns(self, duckdb_session: Session):
        """list_by_dm excludes campaigns owned by other DMs."""
        CampaignRepo.create(duckdb_session, _make_campaign(dm_email="dm1@example.com", name="A"))
        CampaignRepo.create(duckdb_session, _make_campaign(dm_email="dm2@example.com", name="B"))
        results = CampaignRepo.list_by_dm(duckdb_session, "dm1@example.com")
        assert len(results) == 1
        assert results[0].name == "A"

    def test_list_empty_for_unknown_dm(self, duckdb_session: Session):
        """list_by_dm returns empty list for a DM with no campaigns."""
        results = CampaignRepo.list_by_dm(duckdb_session, "nobody@example.com")
        assert results == []


class TestCampaignRepoUpdate:
    """Tests for CampaignRepo.update."""

    def test_update_patches_name(self, duckdb_session: Session):
        """update changes the name field and leaves others unchanged."""
        campaign = CampaignRepo.create(duckdb_session, _make_campaign())
        updated = CampaignRepo.update(
            duckdb_session, campaign, CampaignUpdate(name="Renamed Campaign")
        )
        assert updated.name == "Renamed Campaign"
        assert updated.setting == "Forgotten Realms"

    def test_update_empty_is_noop(self, duckdb_session: Session):
        """Empty update payload changes nothing."""
        campaign = CampaignRepo.create(duckdb_session, _make_campaign(name="Original"))
        updated = CampaignRepo.update(duckdb_session, campaign, CampaignUpdate())
        assert updated.name == "Original"


class TestCampaignRepoDelete:
    """Tests for CampaignRepo.delete."""

    def test_delete_removes_record(self, duckdb_session: Session):
        """Deleted campaign is no longer retrievable."""
        campaign = CampaignRepo.create(duckdb_session, _make_campaign())
        campaign_id = campaign.id
        result = CampaignRepo.delete(duckdb_session, campaign)
        assert result is True
        assert CampaignRepo.get_by_id(duckdb_session, campaign_id) is None
