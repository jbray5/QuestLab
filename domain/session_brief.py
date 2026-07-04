"""SessionBrief domain models — the glanceable DM brief (Plan 43).

The session-2-winning format: a cold open, glanceable BEATS with machine-readable
triggers (hp_lte / round_gte / on_defeated), NPC play-faces (how to PLAY them live,
reusing the Plan 40 dual-face vocabulary), per-PC spotlight cues, a danger dial, and
optional "roads" for an open ending. Deliberately the inverse of a read-aloud runbook —
cues the DM glances at and looks up from, not scripts to read.
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


class Beat(BaseModel):
    """One glanceable beat — a cue the DM grabs and looks up from, not a script."""

    title: str = PydField(description="Short beat name, e.g. 'The lucid flicker'")
    cue: str = PydField(description="One or two lines the DM GLANCES at — never reads aloud")
    kind: str = PydField(default="rp", description="rp | combat | reveal | clock")
    trigger_kind: Optional[str] = PydField(
        default=None, description="manual | hp_lte | round_gte | on_defeated | first_pc_down"
    )
    trigger_value: Optional[int] = PydField(
        default=None, description="threshold for hp_lte (HP) or round_gte (round number)"
    )
    target: Optional[str] = PydField(
        default=None, description="combatant/NPC the trigger watches (hp_lte / on_defeated)"
    )
    spotlight_pc: Optional[str] = PydField(default=None, description="PC this beat is aimed at")
    dm_note: Optional[str] = PydField(default=None, description="private DM-only guidance")


class NpcFace(BaseModel):
    """How to PLAY an NPC live — the dual-face vocabulary (Plan 40)."""

    name: str
    quick_who: str = PydField(default="", description="one-line who-they-are")
    want_now: str = PydField(default="", description="what they want in THIS scene")
    knows: list[str] = PydField(default_factory=list, description="facts they can reveal")
    voice: str = PydField(default="", description="how they sound / a verbal tic")
    secret_short: str = PydField(default="", description="DM-only secret, one line")


class Spotlight(BaseModel):
    """A cue to say out loud to a specific player."""

    pc_name: str
    flag: str = PydField(description="the spotlight moment for this PC")


class Road(BaseModel):
    """One option in an open 'what now' ending."""

    label: str = PydField(description="short road name, e.g. 'South — the Silverway'")
    flavor: str = PydField(description="how it's teased at the table")
    pull: str = PydField(default="", description="which PC thread it hooks")


class SessionBrief(SQLModel, table=True):
    """The persisted DM brief for a session (1:1)."""

    __tablename__ = "session_briefs"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="sessions.id", unique=True, index=True)
    model_used: str = Field(min_length=1, max_length=100)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    cold_open: str = Field(default="")
    premise: str = Field(default="")
    danger_dial: str = Field(default="")
    fallback: Optional[str] = None
    # JSON lists — see the nested models above.
    beats: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    npc_faces: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    spotlight: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    roads: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))


class SessionBriefCreate(BaseModel):
    """Input schema for persisting a generated brief."""

    session_id: uuid.UUID
    model_used: str
    cold_open: str = ""
    premise: str = ""
    danger_dial: str = ""
    fallback: Optional[str] = None
    beats: list[Beat] = PydField(default_factory=list)
    npc_faces: list[NpcFace] = PydField(default_factory=list)
    spotlight: list[Spotlight] = PydField(default_factory=list)
    roads: list[Road] = PydField(default_factory=list)


class SessionBriefUpdate(BaseModel):
    """Partial-update schema for inline brief edits."""

    cold_open: Optional[str] = None
    premise: Optional[str] = None
    danger_dial: Optional[str] = None
    fallback: Optional[str] = None
    beats: Optional[list[Beat]] = None
    npc_faces: Optional[list[NpcFace]] = None
    spotlight: Optional[list[Spotlight]] = None
    roads: Optional[list[Road]] = None


class SessionBriefRead(BaseModel):
    """Output schema for reading a brief."""

    id: uuid.UUID
    session_id: uuid.UUID
    model_used: str
    generated_at: datetime
    cold_open: str = ""
    premise: str = ""
    danger_dial: str = ""
    fallback: Optional[str] = None
    beats: list[dict[str, Any]] = PydField(default_factory=list)
    npc_faces: list[dict[str, Any]] = PydField(default_factory=list)
    spotlight: list[dict[str, Any]] = PydField(default_factory=list)
    roads: list[dict[str, Any]] = PydField(default_factory=list)

    model_config = {"from_attributes": True}

    @field_validator("beats", "npc_faces", "spotlight", "roads", mode="before")
    @classmethod
    def _none_to_list(cls, v: object) -> object:
        """Coerce nullable JSON columns to empty lists (DB default is NULL)."""
        return [] if v is None else v
