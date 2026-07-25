"""Puzzle domain models — the Puzzle Workbench (Plan 55).

Two kinds, both data-configured:
  * ``glyph``  — a substitution board (the Session 4 sea-refrain).
  * ``cipher`` — a warded Vigenère page (the Halve scroll).

Security shape: ``config`` holds the answers (mapping / key / plaintext)
and is DM-only. The player-facing ``PuzzleProjection`` is built by the
service and never carries them — players open dev tools, so the secret
must not be in the bundle or the payload.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class Puzzle(SQLModel, table=True):
    """A table puzzle: DM-authored config + live shared state."""

    __tablename__ = "puzzles"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    # "glyph" | "cipher"
    kind: str = Field(max_length=20)
    title: str = Field(min_length=1, max_length=200)
    # DM-only: answer key, cipher key, plaintext.
    config: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Shared live state: assignments, attempts, phase, locked letters.
    state: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    solved: bool = Field(default=False)
    # When true, the player link can also assign letters (DM toggle).
    allow_player_input: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PuzzleCreate(BaseModel):
    """Input schema for creating a puzzle."""

    kind: str
    title: str
    config: dict[str, Any]
    allow_player_input: bool = False


class PuzzleUpdate(BaseModel):
    """Partial update (title, config, player-input toggle)."""

    title: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    allow_player_input: Optional[bool] = None


class PuzzleRead(BaseModel):
    """DM-side puzzle — includes config (the answers)."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    kind: str
    title: str
    config: dict[str, Any] = {}
    state: dict[str, Any] = {}
    solved: bool = False
    allow_player_input: bool = False

    model_config = {"from_attributes": True}


class PuzzleProjection(BaseModel):
    """Player-facing puzzle — capability URL, NO answers.

    Glyph: tokens + the currently-assigned letters (pre-known letters are
    merged in as assignments at seed time). Cipher: phase + ciphertext,
    and only the letters already confirmed at the table.
    """

    id: uuid.UUID
    kind: str
    title: str
    solved: bool = False
    allow_player_input: bool = False
    # glyph
    tokens: list[str] = []
    assignments: dict[str, str] = {}
    hide_spaces: bool = True
    hum: int = 0  # count of wrong spoken readings — drives the page-hum FX
    # cipher
    phase: str = "warded"
    ciphertext: str = ""
    locked: dict[str, str] = {}  # index (as str) -> confirmed plaintext letter
    intro: str = ""


class GlyphAssign(BaseModel):
    """Assign (or clear, when letter is empty) a letter to a glyph."""

    glyph: str
    letter: str = ""


class ReadingAttempt(BaseModel):
    """A full candidate reading spoken aloud at the table."""

    reading: str


class KeyAttempt(BaseModel):
    """A key spoken over the warded page."""

    key: str


class DecodeAttempt(BaseModel):
    """One hand-decoded cipher letter at a character index."""

    index: int
    letter: str


class RevealRequest(BaseModel):
    """DM reveal: 'word' | 'line' | 'all' (word/line advance from cursor)."""

    scope: str = "line"
