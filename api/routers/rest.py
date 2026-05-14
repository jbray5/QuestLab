"""Rest router (Plan 00021).

Two surfaces:
- Per-PC: ``POST /characters/{id}/rest/{short|long}`` — applies the rest to
  one PC. Returns the per-PC ``RestSummary``.
- Per-session: ``POST /sessions/{id}/rest/{short|long}`` — applies the rest
  to every attending PC. Returns a list of summaries. This is the
  DM-requested one-click party rest.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.character import RestSummary
from services import rest_service

router = APIRouter(tags=["rest"])


# ── Per-PC rest ─────────────────────────────────────────────────────────────


@router.post("/characters/{character_id}/rest/short", response_model=RestSummary)
def short_rest_one(character_id: uuid.UUID, db: DB, user: CurrentUser) -> RestSummary:
    """Apply a short rest to one PC.

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM.

    Returns:
        RestSummary listing what was restored.
    """
    try:
        return rest_service.short_rest_pc(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/characters/{character_id}/rest/long", response_model=RestSummary)
def long_rest_one(character_id: uuid.UUID, db: DB, user: CurrentUser) -> RestSummary:
    """Apply a long rest to one PC.

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM.

    Returns:
        RestSummary listing what was restored.
    """
    try:
        return rest_service.long_rest_pc(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── Party-wide rest (the DM's one-click button) ─────────────────────────────


@router.post("/sessions/{session_id}/rest/short", response_model=list[RestSummary])
def short_rest_session(session_id: uuid.UUID, db: DB, user: CurrentUser) -> list[RestSummary]:
    """Apply a short rest to every attending PC in a session.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Per-PC RestSummary list.
    """
    try:
        return rest_service.short_rest_party(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/sessions/{session_id}/rest/long", response_model=list[RestSummary])
def long_rest_session(session_id: uuid.UUID, db: DB, user: CurrentUser) -> list[RestSummary]:
    """Apply a long rest to every attending PC in a session.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Per-PC RestSummary list.
    """
    try:
        return rest_service.long_rest_party(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
