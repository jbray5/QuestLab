"""Combat beats router — state-triggered beats authored per session.

Plan 40 Change 3. A beat is attached to a session (and optionally a
combatant) and auto-fires when its HP / round threshold is observed.
The HUD's combat tracker watches state and POSTs to ``/fire`` when it
sees a trigger condition; the DM dismisses the surfaced banner via
``/dismiss``.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.combat_beat import (
    CombatBeatCreate,
    CombatBeatRead,
    CombatBeatUpdate,
)
from services import combat_beat_service

router = APIRouter(tags=["combat-beats"])


@router.get(
    "/sessions/{session_id}/combat-beats",
    response_model=list[CombatBeatRead],
)
def list_beats(session_id: uuid.UUID, db: DB, user: CurrentUser) -> list[CombatBeatRead]:
    """List every beat for a session (pending, fired, dismissed).

    Args:
        session_id: UUID of the parent session.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Beats in display order.
    """
    try:
        rows = combat_beat_service.list_for_session(db, session_id, user)
        return [CombatBeatRead.model_validate(r) for r in rows]
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/sessions/{session_id}/combat-beats",
    response_model=CombatBeatRead,
    status_code=status.HTTP_201_CREATED,
)
def create_beat(
    session_id: uuid.UUID, body: CombatBeatCreate, db: DB, user: CurrentUser
) -> CombatBeatRead:
    """Author a new combat beat attached to this session.

    Args:
        session_id: UUID of the parent session.
        body: Authoring payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The persisted beat.
    """
    try:
        beat = combat_beat_service.create(db, session_id, body, user)
        return CombatBeatRead.model_validate(beat)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/combat-beats/{beat_id}", response_model=CombatBeatRead)
def update_beat(
    beat_id: uuid.UUID, body: CombatBeatUpdate, db: DB, user: CurrentUser
) -> CombatBeatRead:
    """Partial-update a beat's authoring fields.

    Args:
        beat_id: UUID of the beat.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed beat.
    """
    try:
        beat = combat_beat_service.update(db, beat_id, body, user)
        return CombatBeatRead.model_validate(beat)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/combat-beats/{beat_id}/fire", response_model=CombatBeatRead)
def fire_beat(beat_id: uuid.UUID, db: DB, user: CurrentUser) -> CombatBeatRead:
    """Mark a beat as fired. Idempotent.

    Args:
        beat_id: UUID of the beat.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed beat.
    """
    try:
        beat = combat_beat_service.fire(db, beat_id, user)
        return CombatBeatRead.model_validate(beat)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/combat-beats/{beat_id}/dismiss", response_model=CombatBeatRead)
def dismiss_beat(beat_id: uuid.UUID, db: DB, user: CurrentUser) -> CombatBeatRead:
    """Mark a beat as dismissed (DM acknowledged the banner).

    Args:
        beat_id: UUID of the beat.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed beat.
    """
    try:
        beat = combat_beat_service.dismiss(db, beat_id, user)
        return CombatBeatRead.model_validate(beat)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/combat-beats/{beat_id}/reset", response_model=CombatBeatRead)
def reset_beat(beat_id: uuid.UUID, db: DB, user: CurrentUser) -> CombatBeatRead:
    """Re-arm a beat so it can fire again.

    Args:
        beat_id: UUID of the beat.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed beat.
    """
    try:
        beat = combat_beat_service.reset(db, beat_id, user)
        return CombatBeatRead.model_validate(beat)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete(
    "/combat-beats/{beat_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_beat(beat_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a beat row.

    Args:
        beat_id: UUID of the beat.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        combat_beat_service.delete(db, beat_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
