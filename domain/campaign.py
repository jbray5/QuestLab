"""Campaign domain model — top-level container for a D&D campaign."""

import uuid
from datetime import UTC, datetime
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Field, SQLModel


class CampaignBase(SQLModel):
    """Shared fields for Campaign create and read schemas."""

    name: str = Field(min_length=1, max_length=200)
    setting: str = Field(min_length=1, max_length=200, description="World or setting name")
    tone: str = Field(min_length=1, max_length=200, description="Campaign tone, e.g. 'dark horror'")
    world_notes: Optional[str] = Field(default=None, description="Free-form world-building notes")


class Campaign(CampaignBase, table=True):
    """Campaign SQLModel table — one per DM campaign."""

    __tablename__ = "campaigns"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    dm_email: str = Field(index=True, description="Email of the owning DM")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CampaignCreate(CampaignBase):
    """Input schema for creating a new campaign.

    dm_email is optional here — the API router injects it from the auth
    header; the service always sets it explicitly before persisting.
    """

    dm_email: Optional[str] = None


class CampaignRead(CampaignBase):
    """Output schema for reading a campaign."""

    id: uuid.UUID
    dm_email: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CampaignUpdate(BaseModel):
    """Partial update schema for a campaign — all fields optional."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    setting: Optional[str] = Field(default=None, min_length=1, max_length=200)
    tone: Optional[str] = Field(default=None, min_length=1, max_length=200)
    world_notes: Optional[str] = None
