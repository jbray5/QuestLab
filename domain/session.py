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
    # Combat round state (companions to session_combatants rows)
    combat_round: int = Field(default=1, ge=1)
    combat_active_combatant_id: Optional[uuid.UUID] = Field(default=None)


class SessionCreate(BaseModel):
    """Input schema for creating a session.

    adventure_id is optional here — the API router injects it from the URL path;
    the service always sets it explicitly before persisting.
    """

    adventure_id: Optional[uuid.UUID] = None
    session_number: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)
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

    session_number: Optional[int] = Field(default=None, ge=1)
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
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
    loot_awards: Optional[list[Any]] = None


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
    loot_awards: Optional[list[Any]] = None
    generated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# SessionCombatant — persistent live-combat state
# ---------------------------------------------------------------------------


class SessionCombatant(SQLModel, table=True):
    """One row per combatant in a live session's initiative tracker.

    Persisted so the React tracker survives a browser refresh. One Session
    has many SessionCombatants; round / active-combatant state lives on the
    parent Session row (combat_round, combat_active_combatant_id).
    """

    __tablename__ = "session_combatants"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="sessions.id", index=True)
    sort_index: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=100)
    dex_score: int = Field(ge=1, le=30)
    initiative_roll: int = Field(ge=-10, le=50)
    hp_current: int = Field(ge=0)
    hp_max: int = Field(ge=1)
    # "pc" | "monster" | "npc" — kept as a string to avoid a tight enum coupling
    type: str = Field(min_length=1, max_length=20)
    defeated: bool = Field(default=False)
    # Linkbacks for stat-block lookups and PC-side updates. Optional because
    # ad-hoc combatants (NPCs improvised mid-session) won't have either.
    monster_id: Optional[uuid.UUID] = Field(default=None)
    character_id: Optional[uuid.UUID] = Field(default=None)
    # JSON list of active 5e condition strings, e.g. ["blinded", "prone"]
    conditions: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))


class SessionCombatantCreate(BaseModel):
    """Input schema for creating a combatant row."""

    sort_index: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=100)
    dex_score: int = Field(ge=1, le=30)
    initiative_roll: int = Field(ge=-10, le=50)
    hp_current: int = Field(ge=0)
    hp_max: int = Field(ge=1)
    type: str = Field(min_length=1, max_length=20)
    defeated: bool = False
    monster_id: Optional[uuid.UUID] = None
    character_id: Optional[uuid.UUID] = None
    conditions: list[str] = Field(default_factory=list)


class SessionCombatantRead(BaseModel):
    """Output schema for a combatant row."""

    id: uuid.UUID
    session_id: uuid.UUID
    sort_index: int
    name: str
    dex_score: int
    initiative_roll: int
    hp_current: int
    hp_max: int
    type: str
    defeated: bool
    monster_id: Optional[uuid.UUID] = None
    character_id: Optional[uuid.UUID] = None
    conditions: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class SessionCombatantUpdate(BaseModel):
    """Partial update for a single combatant row."""

    sort_index: Optional[int] = Field(default=None, ge=0)
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    hp_current: Optional[int] = Field(default=None, ge=0)
    hp_max: Optional[int] = Field(default=None, ge=1)
    defeated: Optional[bool] = None
    initiative_roll: Optional[int] = Field(default=None, ge=-10, le=50)
    conditions: Optional[list[str]] = None


class SessionCombatStateRead(BaseModel):
    """Aggregate read of the full combat state for a session."""

    session_id: uuid.UUID
    round: int = Field(ge=1)
    active_combatant_id: Optional[uuid.UUID] = None
    combatants: list[SessionCombatantRead] = Field(default_factory=list)


class SessionCombatStateWrite(BaseModel):
    """Full-snapshot write payload for combat state.

    Used by ``PUT /sessions/{id}/combat`` to replace the entire combatant
    roster + round state in one call (e.g. after rolling initiative).
    """

    round: int = Field(default=1, ge=1)
    active_combatant_id: Optional[uuid.UUID] = None
    combatants: list[SessionCombatantCreate] = Field(default_factory=list)
