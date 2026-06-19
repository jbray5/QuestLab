"""CombatBeat domain model — DM-authored beats that auto-fire on combat state.

Plan 40 Change 3 — state-triggered beats.

A CombatBeat is a short prompt the DM attaches to either a specific
combatant (HP threshold trigger) or to the session as a whole (round
threshold trigger). When the combat state matches the trigger, the beat
"fires" — the HUD surfaces it as a banner so the DM doesn't forget it
mid-fight. The DM dismisses it once delivered.

Lifecycle:
    pending  -> fired_at is None, dismissed_at is None
    fired    -> fired_at is not None, dismissed_at is None  (banner shown)
    dismissed-> fired_at is not None, dismissed_at is not None  (gone)

Beats are session-scoped — they don't persist across sessions.
"""

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Field, SQLModel


class CombatBeatTrigger(str, Enum):
    """Kind of state condition that fires a beat."""

    HP_LTE = "hp_lte"
    """Combatant HP <= value. Requires ``combatant_id``."""
    ROUND_GTE = "round_gte"
    """Session round >= value. Session-scoped; no ``combatant_id``."""


class CombatBeat(SQLModel, table=True):
    """A DM-authored beat that auto-surfaces at a combat state condition."""

    __tablename__ = "combat_beats"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="sessions.id", index=True)
    # Required for hp_lte triggers; null for round_gte (session-scoped).
    combatant_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="session_combatants.id"
    )
    trigger_kind: CombatBeatTrigger = Field()
    trigger_value: int = Field(ge=0)
    text: str = Field(min_length=1)
    sort_index: int = Field(default=0, ge=0)
    fired_at: Optional[datetime] = Field(default=None)
    dismissed_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ── Boundary schemas ──────────────────────────────────────────────────────────


class CombatBeatCreate(BaseModel):
    """Input schema for creating a combat beat."""

    combatant_id: Optional[uuid.UUID] = None
    trigger_kind: CombatBeatTrigger
    trigger_value: int = Field(ge=0)
    text: str = Field(min_length=1)
    sort_index: int = 0


class CombatBeatRead(BaseModel):
    """Output schema for reading a combat beat."""

    id: uuid.UUID
    session_id: uuid.UUID
    combatant_id: Optional[uuid.UUID] = None
    trigger_kind: CombatBeatTrigger
    trigger_value: int
    text: str
    sort_index: int
    fired_at: Optional[datetime] = None
    dismissed_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CombatBeatUpdate(BaseModel):
    """Partial-update schema for a combat beat."""

    combatant_id: Optional[uuid.UUID] = None
    trigger_kind: Optional[CombatBeatTrigger] = None
    trigger_value: Optional[int] = Field(default=None, ge=0)
    text: Optional[str] = Field(default=None, min_length=1)
    sort_index: Optional[int] = Field(default=None, ge=0)
