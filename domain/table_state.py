"""TableState domain models — live projected battle-map state (Plan 42).

One TableState per session drives the full-screen Table View the remote group
sees on their projector. The DM mutates it from the Session HUD; changes fan
out over the ``table:{session_id}`` SSE topic. The player-facing projection
(``TableProjection``) is deliberately thin: it carries only revealed fog, token
positions, darkness, and which token is glowing — never HP, initiative, DM
notes, or the names of unrevealed regions.
"""

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from pydantic import BaseModel
from pydantic import Field as PydField
from pydantic import field_validator
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class TableState(SQLModel, table=True):
    """Live table-surface state for a session (1:1 with the session)."""

    __tablename__ = "table_states"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="sessions.id", unique=True, index=True)
    active_map_id: Optional[uuid.UUID] = Field(default=None)
    # Master fog toggle. False = whole map visible; True = dark overlay with
    # holes cut at the revealed regions + brush circles.
    fog_on: bool = Field(default=False)
    # JSON list[str] of revealed BattleMap region ids.
    revealed_region_ids: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # JSON list of improv reveal circles: [{x, y, r}] in image-pixel coords.
    brush_reveals: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # JSON list of token dicts (see Token). Image-pixel coords.
    tokens: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Global dimming for atmosphere (the "lanterns die" clock). 0 = bright, 1 = near-black.
    darkness: float = Field(default=0.0, ge=0.0, le=1.0)
    # Ephemeral scene title card text ("" = none).
    title: str = Field(default="", max_length=120)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Token(BaseModel):
    """A creature/marker token on the map, positioned in image-pixel coords."""

    id: str = PydField(min_length=1, max_length=40)
    kind: str = PydField(default="custom")  # "pc" | "monster" | "custom"
    # Links a token to a combatant for turn glow — a character_id or a
    # session_combatant id. Never carries stats, only identity.
    ref_id: Optional[str] = None
    label: str = PydField(default="", max_length=60)
    image_url: Optional[str] = None
    x: float = 0.0
    y: float = 0.0
    size: float = PydField(default=1.0, ge=0.25, le=10.0)  # in grid squares
    color: Optional[str] = PydField(default=None, max_length=20)


class TableStateUpdate(BaseModel):
    """Partial update applied by the DM console. exclude_unset semantics.

    ``active_map_id`` may be sent explicitly as null to clear the map.
    """

    active_map_id: Optional[uuid.UUID] = None
    fog_on: Optional[bool] = None
    revealed_region_ids: Optional[list[str]] = None
    brush_reveals: Optional[list[dict[str, float]]] = None
    tokens: Optional[list[Token]] = None
    darkness: Optional[float] = PydField(default=None, ge=0.0, le=1.0)
    title: Optional[str] = PydField(default=None, max_length=120)


class TableMap(BaseModel):
    """Resolved active-map summary embedded in the projection."""

    id: uuid.UUID
    image_url: str
    width: int
    height: int
    grid_size: Optional[int] = None
    backdrop_url: Optional[str] = None


class TableProjection(BaseModel):
    """Player-safe table surface — everything the projector needs, nothing else."""

    session_id: uuid.UUID
    map: Optional[TableMap] = None
    fog_on: bool = False
    # Revealed region polygons (points only — unrevealed regions and all region
    # NAMES are omitted so the map can't be scried ahead).
    revealed_regions: list[list[list[float]]] = PydField(default_factory=list)
    brush_reveals: list[dict[str, float]] = PydField(default_factory=list)
    tokens: list[Token] = PydField(default_factory=list)
    darkness: float = 0.0
    title: str = ""
    # Turn glow: ref_id of the active combatant's token, plus defeated tokens
    # to dim. Resolved from the running combat state; no HP ever crosses.
    active_token_ref: Optional[str] = None
    defeated_refs: list[str] = PydField(default_factory=list)


class TableStateRead(BaseModel):
    """DM-side raw read of the table state (for the console)."""

    session_id: uuid.UUID
    active_map_id: Optional[uuid.UUID] = None
    fog_on: bool = False
    revealed_region_ids: list[str] = PydField(default_factory=list)
    brush_reveals: list[dict[str, float]] = PydField(default_factory=list)
    tokens: list[dict[str, Any]] = PydField(default_factory=list)
    darkness: float = 0.0
    title: str = ""

    model_config = {"from_attributes": True}

    @field_validator("revealed_region_ids", "brush_reveals", "tokens", mode="before")
    @classmethod
    def _none_to_list(cls, v: object) -> object:
        """Coerce nullable JSON columns to empty lists (DB default is NULL)."""
        return [] if v is None else v
