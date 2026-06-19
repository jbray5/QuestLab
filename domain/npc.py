"""NPC domain model — campaign-scoped story characters (Plan 00033).

An NPC is a story entity (name, personality, motivation, secret) that
optionally links to a Monster row for combat stats. Lives at the
campaign level so the same NPC can recur across adventures.
"""

import uuid
from datetime import UTC, datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.enums import NpcStatus


class Npc(SQLModel, table=True):
    """NPC SQLModel table — campaign-scoped story character."""

    __tablename__ = "npcs"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    # Identity
    name: str = Field(min_length=1, max_length=200)
    role: Optional[str] = Field(default=None, max_length=120)
    race: Optional[str] = Field(default=None, max_length=80)
    gender: Optional[str] = Field(default=None, max_length=40)
    age: Optional[str] = Field(default=None, max_length=60)
    # Story
    appearance: Optional[str] = Field(default=None)
    personality: Optional[str] = Field(default=None)
    motivation: Optional[str] = Field(default=None)
    secret: Optional[str] = Field(default=None)
    dialog_hooks: Optional[list[str]] = Field(default=None, sa_column=Column(JSON, nullable=True))
    tags: Optional[list[str]] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # State
    status: NpcStatus = Field(default=NpcStatus.ALIVE)
    location: Optional[str] = Field(default=None, max_length=200)
    # Optional combat link
    monster_stat_block_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="monster_stat_blocks.id"
    )
    portrait_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None)
    # Plan 38 — DM-controlled visibility on the player view. Defaults to
    # True so existing NPCs stay visible; the DM flips this to False to
    # hide an NPC (villain reveal, plot twist, future-session character)
    # until they're ready for players to see the portrait + name.
    is_revealed: bool = Field(default=True)
    # ── Plan 40 — Table-face fields. Short, scannable counterparts to the
    #    rich prep-face fields above (appearance / personality / motivation /
    #    secret / notes). The Prep face above stays untouched; these are
    #    what the DM glances at mid-scene at arm's length. All nullable so
    #    existing NPCs don't lose data on migration.
    quick_who: Optional[str] = Field(default=None, max_length=120)
    """One-line "who they are." e.g. "Wenneth — dryad innkeeper, dreamy & warm"."""
    want_now: Optional[str] = Field(default=None, max_length=200)
    """WANT — what they want right now / in this scene, one line."""
    knows: Optional[list[str]] = Field(default=None, sa_column=Column(JSON, nullable=True))
    """KNOWS — 2-3 bullets max. Only what matters at the table."""
    voice: Optional[str] = Field(default=None, max_length=200)
    """One verbal or physical tic written so the DM can perform it instantly."""
    secret_short: Optional[str] = Field(default=None, max_length=200)
    """SECRET — one-line table-face version of the rich ``secret`` field above."""
    relationship_pings: Optional[list[str]] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    """Optional short flags about relationships to PCs/other NPCs."""
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ── Boundary schemas ──────────────────────────────────────────────────────────


class NpcCreate(BaseModel):
    """Input schema for creating an NPC."""

    name: str = Field(min_length=1, max_length=200)
    role: Optional[str] = Field(default=None, max_length=120)
    race: Optional[str] = Field(default=None, max_length=80)
    gender: Optional[str] = Field(default=None, max_length=40)
    age: Optional[str] = Field(default=None, max_length=60)
    appearance: Optional[str] = None
    personality: Optional[str] = None
    motivation: Optional[str] = None
    secret: Optional[str] = None
    dialog_hooks: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    status: NpcStatus = NpcStatus.ALIVE
    location: Optional[str] = Field(default=None, max_length=200)
    monster_stat_block_id: Optional[uuid.UUID] = None
    portrait_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = None
    is_revealed: bool = True
    # Plan 40 — Table-face
    quick_who: Optional[str] = Field(default=None, max_length=120)
    want_now: Optional[str] = Field(default=None, max_length=200)
    knows: Optional[list[str]] = None
    voice: Optional[str] = Field(default=None, max_length=200)
    secret_short: Optional[str] = Field(default=None, max_length=200)
    relationship_pings: Optional[list[str]] = None


class NpcRead(BaseModel):
    """Output schema for reading an NPC."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    role: Optional[str] = None
    race: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[str] = None
    appearance: Optional[str] = None
    personality: Optional[str] = None
    motivation: Optional[str] = None
    secret: Optional[str] = None
    dialog_hooks: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    status: NpcStatus
    location: Optional[str] = None
    monster_stat_block_id: Optional[uuid.UUID] = None
    portrait_url: Optional[str] = None
    notes: Optional[str] = None
    is_revealed: bool = True
    # Plan 40 — Table-face
    quick_who: Optional[str] = None
    want_now: Optional[str] = None
    knows: Optional[list[str]] = None
    voice: Optional[str] = None
    secret_short: Optional[str] = None
    relationship_pings: Optional[list[str]] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NpcUpdate(BaseModel):
    """Partial-update schema for an NPC."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    role: Optional[str] = Field(default=None, max_length=120)
    race: Optional[str] = Field(default=None, max_length=80)
    gender: Optional[str] = Field(default=None, max_length=40)
    age: Optional[str] = Field(default=None, max_length=60)
    appearance: Optional[str] = None
    personality: Optional[str] = None
    motivation: Optional[str] = None
    secret: Optional[str] = None
    dialog_hooks: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    status: Optional[NpcStatus] = None
    location: Optional[str] = Field(default=None, max_length=200)
    monster_stat_block_id: Optional[uuid.UUID] = None
    portrait_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = None
    is_revealed: Optional[bool] = None
    # Plan 40 — Table-face
    quick_who: Optional[str] = Field(default=None, max_length=120)
    want_now: Optional[str] = Field(default=None, max_length=200)
    knows: Optional[list[str]] = None
    voice: Optional[str] = Field(default=None, max_length=200)
    secret_short: Optional[str] = Field(default=None, max_length=200)
    relationship_pings: Optional[list[str]] = None


class NpcGenerate(BaseModel):
    """Input schema for AI-generated NPCs (Plan 00033)."""

    role: str = Field(min_length=1, max_length=200)
    """Role hint — 'corrupt guard captain', 'innkeeper', etc."""

    save: bool = True
    """If True, persist the generated NPC immediately; if False, return as preview."""
