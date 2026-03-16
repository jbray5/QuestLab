"""Tests for domain/campaign.py — Campaign model validation."""

import uuid

import pytest

from domain.campaign import Campaign, CampaignCreate, CampaignRead, CampaignUpdate


class TestCampaignCreate:
    """Tests for CampaignCreate input validation."""

    def test_valid_campaign(self):
        """Valid input creates a CampaignCreate without error."""
        c = CampaignCreate(
            name="The Sunken Citadel",
            setting="Forgotten Realms",
            tone="Dark and gritty",
            dm_email="dm@example.com",
        )
        assert c.name == "The Sunken Citadel"

    def test_email_optional(self):
        """dm_email is optional on CampaignCreate (injected by auth at API layer)."""
        c = CampaignCreate(name="Test", setting="Test", tone="Test")
        assert c.dm_email is None

    def test_name_required(self):
        """Empty name raises validation error."""
        with pytest.raises(Exception):
            CampaignCreate(name="", setting="Test", tone="Test", dm_email="dm@example.com")

    def test_world_notes_optional(self):
        """world_notes is optional and defaults to None."""
        c = CampaignCreate(name="Test", setting="Test", tone="Test", dm_email="dm@example.com")
        assert c.world_notes is None


class TestCampaignRead:
    """Tests for CampaignRead output schema."""

    def test_from_orm(self):
        """CampaignRead can be constructed from a Campaign ORM object."""
        from datetime import UTC, datetime

        campaign = Campaign(
            id=uuid.uuid4(),
            name="Test",
            setting="Test",
            tone="Test",
            dm_email="dm@example.com",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        read = CampaignRead.model_validate(campaign)
        assert read.name == "Test"
        assert read.dm_email == "dm@example.com"


class TestCampaignUpdate:
    """Tests for CampaignUpdate partial schema."""

    def test_all_fields_optional(self):
        """CampaignUpdate allows empty (no-op) updates."""
        u = CampaignUpdate()
        assert u.name is None
        assert u.setting is None
        assert u.tone is None
        assert u.world_notes is None

    def test_partial_update(self):
        """Only the provided fields are set."""
        u = CampaignUpdate(name="New Name")
        assert u.name == "New Name"
        assert u.setting is None
