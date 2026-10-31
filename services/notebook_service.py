"""Session Notebook service (Plan 57).

The four laws, as they land in code:
  1. The page belongs to the DM — only the DM's own edits write block
     content; nothing here generates or rewrites it.
  2. The margin is context — pins are stored beside blocks and validated
     to never merge into them.
  3. Everything is scratch — the only promotion is the ``is_runbook``
     flag. Nothing here writes canon, player surfaces, or other app data.
  4. A finished page is the session — read mode/print live client-side;
     this service just keeps the document safe.

Feature-flagged: every operation requires ``NOTEBOOK_ENABLED`` (ship
dark, light up on verification).
"""

import logging
import os
import re
import uuid
from datetime import datetime, timezone

from sqlmodel import Session as DBSession

from db.repos.campaign_repo import CampaignRepo
from db.repos.notebook_repo import NotebookPageRepo, NotebookRepo
from domain.campaign import Campaign
from domain.notebook import (
    Notebook,
    NotebookCreate,
    NotebookPage,
    NotebookUpdate,
    PageCreate,
    PageUpdate,
    SearchHit,
)
from services import campaign_service

logger = logging.getLogger(__name__)

# Block types whose content.text participates in search.
_TEXTUAL_TYPES = {"text", "verbatim", "prompt", "key"}
# Mention tokens: short form @[Name] (current) or @[Name](kind:id)
# (original long form) — search wants just the name either way.
_MENTION_RE = re.compile(r"@\[([^\]]+)\](?:\([^)]*\))?")
# Page links look like [[Title]] — search wants just the title.
_LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")


def _require_enabled() -> None:
    """Refuse unless the notebook feature is available on this deployment.

    Lit by default at the owner's request (2026-07-30) — set
    ``NOTEBOOK_ENABLED=false`` to go dark. Always dark under ``DEMO_MODE``:
    the demo pins every visitor to one shared identity, and a shared
    notebook is not a prep surface.

    Raises:
        PermissionError: If DEMO_MODE is on, or NOTEBOOK_ENABLED is falsy.
    """
    if os.environ.get("DEMO_MODE", "").strip().lower() in ("1", "true", "yes"):
        raise PermissionError("The Session Notebook is not available on the public demo.")
    if os.environ.get("NOTEBOOK_ENABLED", "true").strip().lower() not in ("1", "true", "yes"):
        raise PermissionError(
            "The Session Notebook is disabled on this deployment " "(NOTEBOOK_ENABLED=false)."
        )


def _get_owned_campaign(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> Campaign:
    """Fetch a campaign, asserting the requester owns it.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        The owned Campaign.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the requester does not own it.
    """
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    campaign_service._assert_owner(campaign, dm_email)
    return campaign


def _get_owned_notebook(db: DBSession, notebook_id: uuid.UUID, dm_email: str) -> Notebook:
    """Fetch a notebook, asserting campaign ownership.

    Args:
        db: Active database session.
        notebook_id: UUID of the notebook.
        dm_email: Email of the requesting DM.

    Returns:
        The Notebook.

    Raises:
        ValueError: If it does not exist.
        PermissionError: If the requester does not own the campaign.
    """
    row = NotebookRepo.get_by_id(db, notebook_id)
    if row is None:
        raise ValueError(f"Notebook {notebook_id} not found.")
    _get_owned_campaign(db, row.campaign_id, dm_email)
    return row


def _get_owned_page(db: DBSession, page_id: uuid.UUID, dm_email: str) -> NotebookPage:
    """Fetch a page, asserting campaign ownership.

    Args:
        db: Active database session.
        page_id: UUID of the page.
        dm_email: Email of the requesting DM.

    Returns:
        The NotebookPage.

    Raises:
        ValueError: If it does not exist.
        PermissionError: If the requester does not own the campaign.
    """
    row = NotebookPageRepo.get_by_id(db, page_id)
    if row is None:
        raise ValueError(f"Page {page_id} not found.")
    _get_owned_campaign(db, row.campaign_id, dm_email)
    return row


def derive_search_text(blocks: list[dict]) -> str:
    """Flatten a page's blocks into plain text for full-text search.

    Mention tokens and page links collapse to their display names; cards
    contribute title + beats; sketches, images, and dividers contribute
    nothing textual.

    Args:
        blocks: The page's ordered block list.

    Returns:
        One newline-joined plain-text string, capped to the column size.
    """
    parts: list[str] = []
    for block in blocks or []:
        btype = block.get("type")
        content = block.get("content") or {}
        if btype in _TEXTUAL_TYPES:
            text = str(content.get("text") or "")
            text = _MENTION_RE.sub(r"\1", text)
            text = _LINK_RE.sub(r"\1", text)
            if text.strip():
                parts.append(text.strip())
        elif btype == "card":
            title = str(content.get("title") or "").strip()
            beats = [str(b).strip() for b in (content.get("beats") or []) if str(b).strip()]
            if title:
                parts.append(title)
            parts.extend(beats)
    return "\n".join(parts)[:100_000]


# ── Notebooks ─────────────────────────────────────────────────────────────────


def list_notebooks(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> list[Notebook]:
    """List a campaign's notebooks.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        The notebooks, in DM order.
    """
    _require_enabled()
    _get_owned_campaign(db, campaign_id, dm_email)
    return NotebookRepo.list_for_campaign(db, campaign_id)


def create_notebook(
    db: DBSession, campaign_id: uuid.UUID, dm_email: str, payload: NotebookCreate
) -> Notebook:
    """Create a notebook.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        payload: Title + order.

    Returns:
        The created Notebook.
    """
    _require_enabled()
    _get_owned_campaign(db, campaign_id, dm_email)
    row = Notebook(
        campaign_id=campaign_id, title=payload.title.strip(), sort_order=payload.sort_order
    )
    return NotebookRepo.create(db, row)


def update_notebook(
    db: DBSession, notebook_id: uuid.UUID, dm_email: str, payload: NotebookUpdate
) -> Notebook:
    """Rename or reorder a notebook.

    Args:
        db: Active database session.
        notebook_id: UUID of the notebook.
        dm_email: Email of the requesting DM.
        payload: Partial update.

    Returns:
        The refreshed Notebook.
    """
    _require_enabled()
    row = _get_owned_notebook(db, notebook_id, dm_email)
    if payload.title is not None:
        row.title = payload.title.strip()
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    return NotebookRepo.save(db, row)


def delete_notebook(db: DBSession, notebook_id: uuid.UUID, dm_email: str) -> None:
    """Delete a notebook and its pages.

    Args:
        db: Active database session.
        notebook_id: UUID of the notebook.
        dm_email: Email of the requesting DM.
    """
    _require_enabled()
    row = _get_owned_notebook(db, notebook_id, dm_email)
    NotebookPageRepo.delete_for_notebook(db, notebook_id)
    NotebookRepo.delete(db, row)


# ── Pages ─────────────────────────────────────────────────────────────────────


def list_pages(db: DBSession, notebook_id: uuid.UUID, dm_email: str) -> list[NotebookPage]:
    """List a notebook's pages (callers project to summaries).

    Args:
        db: Active database session.
        notebook_id: UUID of the notebook.
        dm_email: Email of the requesting DM.

    Returns:
        Pages in DM order.
    """
    _require_enabled()
    _get_owned_notebook(db, notebook_id, dm_email)
    return NotebookPageRepo.list_for_notebook(db, notebook_id)


def list_runbooks(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> list[NotebookPage]:
    """List a campaign's promoted runbook pages (the only promotion).

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        Runbook-flagged pages, newest first.
    """
    _require_enabled()
    _get_owned_campaign(db, campaign_id, dm_email)
    return NotebookPageRepo.list_runbooks(db, campaign_id)


def create_page(
    db: DBSession, notebook_id: uuid.UUID, dm_email: str, payload: PageCreate
) -> NotebookPage:
    """Create a page with one empty text block to start writing in.

    Args:
        db: Active database session.
        notebook_id: UUID of the notebook.
        dm_email: Email of the requesting DM.
        payload: Title + order.

    Returns:
        The created NotebookPage.
    """
    _require_enabled()
    notebook = _get_owned_notebook(db, notebook_id, dm_email)
    row = NotebookPage(
        notebook_id=notebook_id,
        campaign_id=notebook.campaign_id,
        title=payload.title.strip(),
        sort_order=payload.sort_order,
        blocks=[{"id": uuid.uuid4().hex[:12], "type": "text", "content": {"text": ""}}],
        pins=[],
    )
    return NotebookPageRepo.create(db, row)


def get_page(db: DBSession, page_id: uuid.UUID, dm_email: str) -> NotebookPage:
    """Fetch a full page for the editor.

    Args:
        db: Active database session.
        page_id: UUID of the page.
        dm_email: Email of the requesting DM.

    Returns:
        The NotebookPage.
    """
    _require_enabled()
    return _get_owned_page(db, page_id, dm_email)


def update_page(
    db: DBSession, page_id: uuid.UUID, dm_email: str, payload: PageUpdate
) -> NotebookPage:
    """Save the DM's document — the editor's single debounced write path.

    Blocks and pins replace wholesale when present; ``search_text`` is
    re-derived from blocks on every blocks write.

    Args:
        db: Active database session.
        page_id: UUID of the page.
        dm_email: Email of the requesting DM.
        payload: Partial update.

    Returns:
        The refreshed NotebookPage.
    """
    _require_enabled()
    row = _get_owned_page(db, page_id, dm_email)
    if payload.title is not None:
        row.title = payload.title.strip()
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    if payload.blocks is not None:
        row.blocks = payload.blocks
        row.search_text = derive_search_text(payload.blocks)
    if payload.pins is not None:
        row.pins = payload.pins
    if payload.is_runbook is not None:
        row.is_runbook = payload.is_runbook
    row.updated_at = datetime.now(timezone.utc)
    return NotebookPageRepo.save(db, row)


def delete_page(db: DBSession, page_id: uuid.UUID, dm_email: str) -> None:
    """Delete a page.

    Args:
        db: Active database session.
        page_id: UUID of the page.
        dm_email: Email of the requesting DM.
    """
    _require_enabled()
    row = _get_owned_page(db, page_id, dm_email)
    NotebookPageRepo.delete(db, row)


# ── Search ────────────────────────────────────────────────────────────────────


def search(db: DBSession, campaign_id: uuid.UUID, dm_email: str, q: str) -> list[SearchHit]:
    """Full-text search across every notebook in a campaign.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        q: Search phrase.

    Returns:
        Hits with a text snippet around the first match.
    """
    _require_enabled()
    _get_owned_campaign(db, campaign_id, dm_email)
    q = q.strip()
    if not q:
        return []
    notebooks = {n.id: n.title for n in NotebookRepo.list_for_campaign(db, campaign_id)}
    hits: list[SearchHit] = []
    for page in NotebookPageRepo.search(db, campaign_id, q):
        hits.append(
            SearchHit(
                page_id=page.id,
                notebook_id=page.notebook_id,
                notebook_title=notebooks.get(page.notebook_id, ""),
                page_title=page.title,
                snippet=_snippet(page.search_text, q),
            )
        )
    return hits


def _snippet(text: str, q: str, radius: int = 60) -> str:
    """Return the text around the first case-insensitive match of ``q``.

    Args:
        text: The page's derived search text.
        q: The search phrase.
        radius: Characters of context either side.

    Returns:
        An ellipsized snippet, or the text head if the match was in the title.
    """
    idx = text.lower().find(q.lower())
    if idx < 0:
        return text[: radius * 2].strip()
    start = max(0, idx - radius)
    end = min(len(text), idx + len(q) + radius)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return f"{prefix}{text[start:end].strip()}{suffix}"
