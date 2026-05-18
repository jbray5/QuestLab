"""Sessions router — session lifecycle, initiative, runbook, and notes."""

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from api.deps import DB, CurrentUser
from domain.session import Session as GameSession
from domain.session import (
    SessionCombatantRead,
    SessionCombatantUpdate,
    SessionCombatStateRead,
    SessionCombatStateWrite,
    SessionCreate,
    SessionRunbook,
    SessionUpdate,
)
from services import ai_service, session_service

router = APIRouter(tags=["sessions"])


@router.get("/adventures/{adventure_id}/sessions", response_model=list[GameSession])
def list_sessions(adventure_id: uuid.UUID, db: DB, user: CurrentUser) -> list[GameSession]:
    """List all sessions in an adventure.

    Args:
        adventure_id: UUID of the parent adventure.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of GameSession objects.
    """
    try:
        return session_service.list_sessions(db, adventure_id, user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/adventures/{adventure_id}/sessions",
    response_model=GameSession,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    adventure_id: uuid.UUID, body: SessionCreate, db: DB, user: CurrentUser
) -> GameSession:
    """Create a new session within an adventure.

    Args:
        adventure_id: UUID of the parent adventure.
        body: Session creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Newly created GameSession.
    """
    try:
        return session_service.create_session(
            db,
            adventure_id=adventure_id,
            session_number=body.session_number,
            title=body.title,
            dm_email=user,
            date_planned=body.date_planned,
            attending_pc_ids=body.attending_pc_ids,
            actual_notes=body.actual_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/sessions/{session_id}", response_model=GameSession)
def get_session(session_id: uuid.UUID, db: DB, user: CurrentUser) -> GameSession:
    """Fetch a single session by ID.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        GameSession object.
    """
    try:
        return session_service.get_session(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/sessions/{session_id}", response_model=GameSession)
def update_session(
    session_id: uuid.UUID, body: SessionUpdate, db: DB, user: CurrentUser
) -> GameSession:
    """Partially update a session.

    Args:
        session_id: UUID of the session.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated GameSession object.
    """
    try:
        return session_service.update_session(db, session_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a session and its runbook.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        session_service.delete_session(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/sessions/{session_id}/advance", response_model=GameSession)
def advance_status(session_id: uuid.UUID, db: DB, user: CurrentUser) -> GameSession:
    """Advance a session's status one step in the lifecycle.

    Draft → Ready → InProgress → Complete.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated GameSession with new status.
    """
    try:
        return session_service.advance_status(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/sessions/{session_id}/initiative", response_model=list[dict])
def roll_initiative(
    session_id: uuid.UUID, combatants: list[dict[str, Any]], db: DB, user: CurrentUser
) -> list[dict[str, Any]]:
    """Roll initiative for a list of combatants.

    Pure function — does not persist state. Each combatant dict must include:
    name, dex_score, hp, max_hp, type.

    Args:
        session_id: UUID of the session (used for ownership check only).
        combatants: List of combatant dicts.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Combatants sorted by initiative descending, with roll/initiative/active/defeated added.
    """
    try:
        session_service.get_session(db, session_id, user)  # ownership check
        return session_service.roll_initiative(combatants)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/sessions/{session_id}/notes", response_model=GameSession)
def update_notes(
    session_id: uuid.UUID, body: dict[str, str], db: DB, user: CurrentUser
) -> GameSession:
    """Update DM notes for a session.

    Args:
        session_id: UUID of the session.
        body: JSON body with a ``notes`` key.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated GameSession object.
    """
    try:
        return session_service.update_notes(db, session_id, user, body.get("notes", ""))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/sessions/{session_id}/runbook", response_model=SessionRunbook | None)
def get_runbook(session_id: uuid.UUID, db: DB, user: CurrentUser) -> SessionRunbook | None:
    """Return the saved runbook for a session, or null if none exists.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        SessionRunbook or None.
    """
    try:
        return session_service.get_runbook(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/sessions/{session_id}/runbook", response_model=SessionRunbook)
def generate_runbook(
    session_id: uuid.UUID, db: DB, user: CurrentUser, body: dict[str, str] | None = None
) -> SessionRunbook:
    """Generate (or regenerate) an AI runbook for a session.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM email.
        body: Optional JSON body with a ``notes`` key for DM guidance.

    Returns:
        Newly generated SessionRunbook.
    """
    try:
        extra_notes = (body or {}).get("notes", "")
        session_service.get_session(db, session_id, user)  # ownership check
        runbook_create = ai_service.generate_session_runbook(db, session_id, user, extra_notes)
        return session_service.save_runbook(db, session_id, user, runbook_create)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except (RuntimeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Runbook generation failed: {exc}",
        )


# ---------------------------------------------------------------------------
# Combat persistence (Plan 00015)
# ---------------------------------------------------------------------------


@router.get("/sessions/{session_id}/combat", response_model=SessionCombatStateRead)
def get_combat_state(session_id: uuid.UUID, db: DB, user: CurrentUser) -> SessionCombatStateRead:
    """Return the persisted combat state for a session.

    Includes the combatant roster (in initiative order), current round, and
    the id of the combatant whose turn it is.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Aggregate combat state.
    """
    try:
        return session_service.load_combat_state(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.put("/sessions/{session_id}/combat", response_model=SessionCombatStateRead)
def save_combat_state(
    session_id: uuid.UUID,
    body: SessionCombatStateWrite,
    db: DB,
    user: CurrentUser,
) -> SessionCombatStateRead:
    """Replace the entire combat state for a session in one call.

    Used when fresh initiative is rolled. Existing combatants are deleted
    and replaced with the provided roster.

    Args:
        session_id: UUID of the session.
        body: Full combat snapshot.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The newly persisted combat state.
    """
    try:
        return session_service.save_combat_state(db, session_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch(
    "/sessions/{session_id}/combat/{combatant_id}",
    response_model=SessionCombatantRead,
)
def patch_combatant(
    session_id: uuid.UUID,
    combatant_id: uuid.UUID,
    body: SessionCombatantUpdate,
    db: DB,
    user: CurrentUser,
) -> SessionCombatantRead:
    """Patch a single combatant (HP, defeated flag, conditions, ...).

    Args:
        session_id: UUID of the parent session.
        combatant_id: UUID of the combatant row.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated combatant row.
    """
    try:
        return session_service.update_combatant(db, session_id, combatant_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/sessions/{session_id}/combat", status_code=status.HTTP_204_NO_CONTENT)
def clear_combat_state(session_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Clear the combatant roster and reset round/turn state for a session.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        session_service.clear_combat_state(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/sessions/{session_id}/combat/advance", response_model=SessionCombatStateRead)
def advance_combat_turn(session_id: uuid.UUID, db: DB, user: CurrentUser) -> SessionCombatStateRead:
    """Advance the turn pointer to the next non-defeated combatant.

    Increments the round when the pointer wraps to the first combatant.

    Args:
        session_id: UUID of the session.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated combat state.
    """
    try:
        return session_service.advance_combat_turn(db, session_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ---------------------------------------------------------------------------
# Item handouts (Plan 00016)
# ---------------------------------------------------------------------------


class _HandoutRequest(BaseModel):
    """Body for ``POST /sessions/{id}/handouts``."""

    pc_id: uuid.UUID
    item_id: uuid.UUID


@router.post("/sessions/{session_id}/handouts", response_model=GameSession)
def record_handout(
    session_id: uuid.UUID,
    body: _HandoutRequest,
    db: DB,
    user: CurrentUser,
) -> GameSession:
    """Record handing an item to a PC during a live session.

    Appends a timestamped line to the session's notes.

    Args:
        session_id: UUID of the session.
        body: PC + item ids.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated GameSession with the appended notes line.
    """
    try:
        return session_service.record_item_handout(db, session_id, body.pc_id, body.item_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
