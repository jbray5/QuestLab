"""Table View router — DM console + player-safe projection (Plan 42).

The projection endpoint (GET /table/{session_id}) is intentionally
unauthenticated: the session UUID is a capability secret, the same trust model
as the player view. Its payload carries no stats, HP, or DM-only data.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from api.deps import DB, CurrentUser
from domain.table_state import (
    TableProjection,
    TableStateRead,
    TableStateUpdate,
    TokenFigureRequest,
    TokenFigureResponse,
)
from services import table_service

router = APIRouter(tags=["table"])


class PingBody(BaseModel):
    """A DM 'look here' ping in image-pixel coordinates."""

    x: float
    y: float


@router.get("/sessions/{session_id}/table", response_model=TableStateRead)
def get_table(session_id: uuid.UUID, db: DB, user: CurrentUser) -> TableStateRead:
    """DM-side raw table state for the console (creates one if absent).

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The raw TableStateRead.
    """
    try:
        return table_service.get_table_state(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/sessions/{session_id}/table", response_model=TableStateRead)
def update_table(
    session_id: uuid.UUID, body: TableStateUpdate, db: DB, user: CurrentUser
) -> TableStateRead:
    """Update the projected table surface (map, fog, tokens, darkness, title).

    Args:
        session_id: UUID of the session.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed TableStateRead.
    """
    try:
        return table_service.update_table_state(db, session_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/sessions/{session_id}/table/figure", response_model=TokenFigureResponse)
def generate_token_figure(
    session_id: uuid.UUID, body: TokenFigureRequest, db: DB, user: CurrentUser
) -> TokenFigureResponse:
    """Generate a minifig cut-out for an unlinked token (Plan 45).

    For tokens with no character/monster behind them: generates a
    transparent standee straight from the token label and returns the
    blob URL — the board writes it onto the token itself.

    Args:
        session_id: UUID of the session.
        body: Token label + optional style hints.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The generated cut-out's URL.
    """
    try:
        url = table_service.generate_token_figure(
            db, session_id, user, body.name, style_hints=body.style_hints
        )
        return TokenFigureResponse(url=url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Figure generation failed: {exc}",
        )


@router.post("/sessions/{session_id}/table/ping", status_code=status.HTTP_204_NO_CONTENT)
def ping_table(session_id: uuid.UUID, body: PingBody, db: DB, user: CurrentUser) -> None:
    """Broadcast a transient "look here" ping to the Table View.

    Args:
        session_id: UUID of the session.
        body: Ping coordinates.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        table_service.ping(db, session_id, user, body.x, body.y)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/table/{session_id}", response_model=TableProjection)
def get_table_projection(session_id: uuid.UUID, db: DB) -> TableProjection:
    """Player-safe projection for the projector — capability URL, no auth.

    Args:
        session_id: UUID of the session (the capability secret).
        db: Database session.

    Returns:
        The TableProjection (empty-but-valid if no state exists yet).
    """
    return table_service.get_projection(db, session_id)
