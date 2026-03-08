"""Adventure domain model — a story arc within a Campaign."""

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.enums import AdventureTier


class Adventure(SQLModel, table=True):
    """Adventure SQLModel table — belongs to one Campaign."""

    __tablename__ = "adventures"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    title: str = Field(min_length=1, max_length=200)
    synopsis: Optional[str] = Field(default=None)
    tier: AdventureTier
    act_count: int = Field(default=3, ge=1, le=5)
    location_notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # JSON column
    npc_roster: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))


class AdventureCreate(BaseModel):
    """Input schema for creating a new adventure."""

    campaign_id: uuid.UUID
    title: str
    synopsis: Optional[str] = None
    tier: AdventureTier
    act_count: int = Field(default=3, ge=1, le=5)
    npc_roster: Optional[list[dict[str, Any]]] = None
    location_notes: Optional[str] = None

    @field_validator("act_count")
    @classmethod
    def validate_act_count(cls, v: int) -> int:
        """Ensure act count is within the 1–5 range."""
        if not 1 <= v <= 5:
            raise ValueError("act_count must be between 1 and 5")
        return v


class AdventureRead(BaseModel):
    """Output schema for reading an adventure."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    title: str
    synopsis: Optional[str] = None
    tier: AdventureTier
    act_count: int
    npc_roster: Optional[list[dict[str, Any]]] = None
    location_notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdventureUpdate(BaseModel):
    """Partial update schema for an adventure."""

    title: Optional[str] = None
    synopsis: Optional[str] = None
    tier: Optional[AdventureTier] = None
    act_count: Optional[int] = Field(default=None, ge=1, le=5)
    npc_roster: Optional[list[dict[str, Any]]] = None
    location_notes: Optional[str] = None
