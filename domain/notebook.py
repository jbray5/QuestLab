"""Session Notebook domain models — the DM's living prep surface (Plan 57).

Constitutional shape (encoded here, enforced in the service and UI):
  * Blocks and margin pins are JSON on the page row — the page is one
    document the DM owns end to end. Nothing else writes it.
  * Pins live BESIDE blocks (anchored by ``block_id``), never inside
    ``blocks`` — the margin cannot leak into the page.
  * ``is_runbook`` is the only promotion. No other system reads
    notebook content.

Block: ``{id, type, content}`` with type one of
text · verbatim · prompt · key · card · sketch · image · divider.
Pin: ``{id, block_id, kind, ...}`` with kind one of
entity · image · note · ai (ai pins carry model/at/prompt provenance).
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel
from pydantic import Field as PField
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class Notebook(SQLModel, table=True):
    """One notebook in a campaign ("Session 5", "Arc ideas", "NPC scratch")."""

    __tablename__ = "notebooks"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    title: str = Field(min_length=1, max_length=200)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NotebookPage(SQLModel, table=True):
    """One ordered, titled page of blocks with margin pins."""

    __tablename__ = "notebook_pages"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    notebook_id: uuid.UUID = Field(foreign_key="notebooks.id", index=True)
    # Denormalized so campaign-wide search never joins through notebooks.
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    title: str = Field(min_length=1, max_length=200)
    sort_order: int = Field(default=0)
    # Ordered block list — the page itself. DM-authored only (Law 1).
    blocks: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Margin pins, anchored to blocks. Never merged into blocks (Law 2).
    pins: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Plain text derived from blocks on save; feeds full-text search.
    search_text: str = Field(default="", max_length=100_000)
    # The ONLY promotion (Law 3): surfaces this page with session materials.
    is_runbook: bool = Field(default=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Boundary models ───────────────────────────────────────────────────────────


class NotebookCreate(BaseModel):
    """Input for creating a notebook."""

    title: str = PField(min_length=1, max_length=200)
    sort_order: int = 0


class NotebookUpdate(BaseModel):
    """Partial update for a notebook."""

    title: Optional[str] = PField(default=None, min_length=1, max_length=200)
    sort_order: Optional[int] = None


class NotebookRead(BaseModel):
    """Output for a notebook."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    title: str
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PageCreate(BaseModel):
    """Input for creating a page."""

    title: str = PField(min_length=1, max_length=200)
    sort_order: int = 0


class PageUpdate(BaseModel):
    """Partial update for a page. Blocks and pins replace wholesale —
    the editor owns the document and PATCHes it debounced."""

    title: Optional[str] = PField(default=None, min_length=1, max_length=200)
    sort_order: Optional[int] = None
    blocks: Optional[list[dict[str, Any]]] = None
    pins: Optional[list[dict[str, Any]]] = None
    is_runbook: Optional[bool] = None


class PageRead(BaseModel):
    """Full page output for the editor."""

    id: uuid.UUID
    notebook_id: uuid.UUID
    title: str
    sort_order: int
    blocks: list[dict[str, Any]] = PField(default_factory=list)
    pins: list[dict[str, Any]] = PField(default_factory=list)
    is_runbook: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class PageSummary(BaseModel):
    """Light page listing for the sidebar."""

    id: uuid.UUID
    notebook_id: uuid.UUID
    title: str
    sort_order: int
    is_runbook: bool

    model_config = {"from_attributes": True}


class SearchHit(BaseModel):
    """One full-text search result."""

    page_id: uuid.UUID
    notebook_id: uuid.UUID
    notebook_title: str
    page_title: str
    snippet: str


class RiffRequest(BaseModel):
    """Input to the AI margin: a selection to riff on, or an open question."""

    selection: Optional[str] = PField(default=None, max_length=2000)
    question: Optional[str] = PField(default=None, max_length=500)
    block_id: Optional[str] = PField(default=None, max_length=64)


class RiffResponse(BaseModel):
    """AI margin output — suggestions only, never page content (Law 1).

    The client stores these as ``ai`` pins with this provenance; no code
    path exists that inserts them into blocks.
    """

    suggestions: list[str]
    model: str
    at: datetime
    prompt: str
