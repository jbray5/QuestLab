"""Session and SessionRunbook domain models — game session lifecycle and AI runbook."""

import uuid
from datetime import UTC, date, datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.enums import SessionStatus


class Session(SQLModel, table=True):
    """Session SQLModel table — belongs to an Adventure."""

    __tablename__ = "sessions"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    adventure_id: uuid.UUID = Field(foreign_key="adventures.id", index=True)
    session_number: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)
    date_planned: Optional[date] = None
    status: SessionStatus = Field(default=SessionStatus.DRAFT)
    actual_notes: Optional[str] = None
    # JSON column
    attending_pc_ids: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))


class SessionCreate(BaseModel):
    """Input schema for creating a session."""

    adventure_id: uuid.UUID
    session_number: int = Field(ge=1)
    title: str
    date_planned: Optional[date] = None
    attending_pc_ids: list[uuid.UUID] = Field(default_factory=list)
    status: SessionStatus = SessionStatus.DRAFT
    actual_notes: Optional[str] = None

    @field_validator("attending_pc_ids")
    @classmethod
    def deduplicate_pcs(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        """Deduplicate attending PC list while preserving order."""
        return list(dict.fromkeys(v))


class SessionRead(BaseModel):
    """Output schema for reading a session."""

    id: uuid.UUID
    adventure_id: uuid.UUID
    session_number: int
    title: str
    date_planned: Optional[date] = None
    attending_pc_ids: list[uuid.UUID] = Field(default_factory=list)
    status: SessionStatus
    actual_notes: Optional[str] = None

    model_config = {"from_attributes": True}


class SessionUpdate(BaseModel):
    """Partial update schema for a session."""

    title: Optional[str] = None
    date_planned: Optional[date] = None
    attending_pc_ids: Optional[list[uuid.UUID]] = None
    status: Optional[SessionStatus] = None
    actual_notes: Optional[str] = None


class SessionRunbook(SQLModel, table=True):
    """SessionRunbook SQLModel table — AI-generated runbook for a Session (1:1)."""

    __tablename__ = "session_runbooks"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="sessions.id", unique=True, index=True)
    model_used: str = Field(min_length=1, max_length=100)
    opening_scene: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    closing_hooks: Optional[str] = None
    # JSON columns
    scenes: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    npc_dialog: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    encounter_flows: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    xp_awards: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    loot_awards: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))


class SessionRunbookCreate(BaseModel):
    """Input schema for creating a session runbook."""

    session_id: uuid.UUID
    model_used: str
    opening_scene: str
    scenes: list[dict[str, Any]] = Field(default_factory=list)
    npc_dialog: list[dict[str, Any]] = Field(default_factory=list)
    encounter_flows: list[dict[str, Any]] = Field(default_factory=list)
    closing_hooks: Optional[str] = None
    xp_awards: Optional[dict[str, Any]] = None
    loot_awards: Optional[list[dict[str, Any]]] = None


class SessionRunbookRead(BaseModel):
    """Output schema for reading a session runbook."""

    id: uuid.UUID
    session_id: uuid.UUID
    model_used: str
    opening_scene: str
    scenes: list[dict[str, Any]] = Field(default_factory=list)
    npc_dialog: list[dict[str, Any]] = Field(default_factory=list)
    encounter_flows: list[dict[str, Any]] = Field(default_factory=list)
    closing_hooks: Optional[str] = None
    xp_awards: Optional[dict[str, Any]] = None
    loot_awards: Optional[list[dict[str, Any]]] = None
    generated_at: datetime

    model_config = {"from_attributes": True}
