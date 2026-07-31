"""Session Notebook router — DM-only, feature-flagged (Plan 57).

Everything requires identity; the service refuses every call unless
``NOTEBOOK_ENABLED`` is truthy (ship dark). New routes only — no
session-critical path is touched.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.notebook import (
    NotebookCreate,
    NotebookRead,
    NotebookUpdate,
    PageCreate,
    PageRead,
    PageSummary,
    PageUpdate,
    RiffRequest,
    RiffResponse,
    SearchHit,
)
from services import notebook_service

router = APIRouter(tags=["notebooks"])


def _http(exc: Exception) -> HTTPException:
    """404 for missing rows, 409 for business refusals."""
    msg = str(exc)
    code = status.HTTP_404_NOT_FOUND if "not found" in msg.lower() else status.HTTP_409_CONFLICT
    return HTTPException(status_code=code, detail=msg)


def _forbidden(exc: Exception) -> HTTPException:
    """403 for ownership, feature-flag, and AI kill-switch refusals."""
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── Notebooks ─────────────────────────────────────────────────────────────────


@router.get("/campaigns/{campaign_id}/notebooks", response_model=list[NotebookRead])
def list_notebooks(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[NotebookRead]:
    """List the campaign's notebooks.

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Notebooks in DM order.
    """
    try:
        return notebook_service.list_notebooks(db, campaign_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.post(
    "/campaigns/{campaign_id}/notebooks",
    response_model=NotebookRead,
    status_code=status.HTTP_201_CREATED,
)
def create_notebook(
    campaign_id: uuid.UUID, body: NotebookCreate, db: DB, user: CurrentUser
) -> NotebookRead:
    """Create a notebook.

    Args:
        campaign_id: UUID of the campaign.
        body: Title + order.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The created notebook.
    """
    try:
        return notebook_service.create_notebook(db, campaign_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.patch("/notebooks/{notebook_id}", response_model=NotebookRead)
def update_notebook(
    notebook_id: uuid.UUID, body: NotebookUpdate, db: DB, user: CurrentUser
) -> NotebookRead:
    """Rename or reorder a notebook.

    Args:
        notebook_id: UUID of the notebook.
        body: Partial update.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed notebook.
    """
    try:
        return notebook_service.update_notebook(db, notebook_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.delete("/notebooks/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(notebook_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a notebook and its pages.

    Args:
        notebook_id: UUID of the notebook.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        notebook_service.delete_notebook(db, notebook_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


# ── Pages ─────────────────────────────────────────────────────────────────────


@router.get("/notebooks/{notebook_id}/pages", response_model=list[PageSummary])
def list_pages(notebook_id: uuid.UUID, db: DB, user: CurrentUser) -> list[PageSummary]:
    """List a notebook's pages (light projection for the sidebar).

    Args:
        notebook_id: UUID of the notebook.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Page summaries in DM order.
    """
    try:
        return notebook_service.list_pages(db, notebook_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.post(
    "/notebooks/{notebook_id}/pages",
    response_model=PageRead,
    status_code=status.HTTP_201_CREATED,
)
def create_page(notebook_id: uuid.UUID, body: PageCreate, db: DB, user: CurrentUser) -> PageRead:
    """Create a page.

    Args:
        notebook_id: UUID of the notebook.
        body: Title + order.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The created page.
    """
    try:
        return notebook_service.create_page(db, notebook_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.get("/notebook-pages/{page_id}", response_model=PageRead)
def get_page(page_id: uuid.UUID, db: DB, user: CurrentUser) -> PageRead:
    """Fetch a full page for the editor.

    Args:
        page_id: UUID of the page.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The full page document.
    """
    try:
        return notebook_service.get_page(db, page_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.patch("/notebook-pages/{page_id}", response_model=PageRead)
def update_page(page_id: uuid.UUID, body: PageUpdate, db: DB, user: CurrentUser) -> PageRead:
    """Save the DM's document (title / blocks / pins / order / runbook flag).

    Args:
        page_id: UUID of the page.
        body: Partial update.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed page.
    """
    try:
        return notebook_service.update_page(db, page_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.delete("/notebook-pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_page(page_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a page.

    Args:
        page_id: UUID of the page.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        notebook_service.delete_page(db, page_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


# ── Search, runbooks, and the AI margin ───────────────────────────────────────


@router.get("/campaigns/{campaign_id}/notebook-search", response_model=list[SearchHit])
def search_pages(campaign_id: uuid.UUID, q: str, db: DB, user: CurrentUser) -> list[SearchHit]:
    """Full-text search across all the campaign's notebooks.

    Args:
        campaign_id: UUID of the campaign.
        q: Search phrase.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Search hits with snippets.
    """
    try:
        return notebook_service.search(db, campaign_id, user, q)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.get("/campaigns/{campaign_id}/notebook-runbooks", response_model=list[PageSummary])
def list_runbooks(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[PageSummary]:
    """List pages promoted to session runbooks (the only promotion).

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Runbook page summaries, newest first.
    """
    try:
        return notebook_service.list_runbooks(db, campaign_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.post("/notebook-pages/{page_id}/riff", response_model=RiffResponse)
def riff(page_id: uuid.UUID, body: RiffRequest, db: DB, user: CurrentUser) -> RiffResponse:
    """Ask the AI margin for 2–3 suggestions. Returns text only —
    nothing here (or anywhere) writes the page (Law 1).

    Args:
        page_id: UUID of the page.
        body: Selection to riff on, or an open question.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Suggestions with provenance for the client to pin in the margin.
    """
    try:
        return notebook_service.riff(db, page_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)
