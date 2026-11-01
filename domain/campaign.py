"""Campaign domain model — top-level container for a D&D campaign."""

import uuid
from datetime import UTC, datetime
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Field, SQLModel

from domain.enums import Ruleset


class CampaignBase(SQLModel):
    """Shared fields for Campaign create and read schemas."""

    name: str = Field(min_length=1, max_length=200)
    # Optional (review 10/30): only the name is needed to start. Empty string, not
    # NULL — the columns are NOT NULL, so this needs no migration.
    setting: str = Field(default="", max_length=200, description="World or setting name")
    tone: str = Field(default="", max_length=200, description="Campaign tone, e.g. 'dark horror'")
    description: Optional[str] = Field(default=None, description="Campaign premise and overview")
    world_notes: Optional[str] = Field(default=None, description="Free-form world-building notes")


class Campaign(CampaignBase, table=True):
    """Campaign SQLModel table — one per DM campaign."""

    __tablename__ = "campaigns"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    dm_email: str = Field(index=True, description="Email of the owning DM")
    # Plan 74 — anyone with the join link may create their own character.
    allow_player_signup: bool = Field(default=True)
    # Plan 83 — optional short code the join page asks for before listing the party.
    join_code: Optional[str] = Field(default=None, max_length=12)
    # Plan 131 — the edition this table plays by: "2024" (default) or "2014" (a Ruleset value,
    # stored as its plain value). Locked once the campaign has characters (campaign_service),
    # and copied onto each PC at creation.
    ruleset: str = Field(default=Ruleset.R2024.value, max_length=4)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CampaignCreate(CampaignBase):
    """Input schema for creating a new campaign.

    dm_email is optional here — the API router injects it from the auth
    header; the service always sets it explicitly before persisting.
    """

    dm_email: Optional[str] = None
    ruleset: Ruleset = Ruleset.R2024

    # Plan 131 — keep "2024"/"2014" (not the enum) after validation: it lands in a str column.
    model_config = {"use_enum_values": True}


class CampaignRead(CampaignBase):
    """Output schema for reading a campaign."""

    id: uuid.UUID
    dm_email: str
    allow_player_signup: bool = True
    join_code: Optional[str] = None
    ruleset: Ruleset = Ruleset.R2024
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CampaignUpdate(BaseModel):
    """Partial update schema for a campaign — all fields optional."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    setting: Optional[str] = Field(default=None, max_length=200)
    tone: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    allow_player_signup: Optional[bool] = None
    join_code: Optional[str] = Field(default=None, max_length=12)
    world_notes: Optional[str] = None
    ruleset: Optional[Ruleset] = None

    model_config = {"use_enum_values": True}
