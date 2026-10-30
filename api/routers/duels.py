"""Duels fought on separate devices (Plan 104).

Same trust model as the rest of ``/api/play/{pc_id}/*``: the character's UUID
is the implicit secret, shared out of band to the player who owns that
character. What a link does *not* buy you is somebody else's turn — that check
lives in ``services/duel_service.py``, and these routes only translate its
refusals into status codes.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB
from domain.duel import DuelActBody, DuelRead, DuelSeatBody, DuelStartBody, DuelSummary
from services import duel_service

router = APIRouter(tags=["duels"])


def _http(exc: Exception) -> HTTPException:
    """Turn a service refusal into the right status code.

    Args:
        exc: The exception the service raised.

    Returns:
        The HTTPException to raise in its place.
    """
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    code = (
        status.HTTP_404_NOT_FOUND
        if "not found" in str(exc).lower() or "never here" in str(exc).lower()
        else status.HTTP_422_UNPROCESSABLE_ENTITY
    )
    return HTTPException(status_code=code, detail=str(exc))


@router.post("/play/{pc_id}/duels", response_model=DuelRead)
def start_duel(pc_id: uuid.UUID, body: DuelStartBody, db: DB) -> DuelRead:
    """Call other characters out to a duel, everyone on their own phone.

    Args:
        pc_id: The character calling it (the capability).
        body: Everyone in the ring, this character included.
        db: Database session.

    Returns:
        The opened duel, initiative already rolled.
    """
    try:
        return duel_service.start(db, pc_id, body.pc_ids, body.monster_id)
    except (ValueError, PermissionError) as exc:
        raise _http(exc)


@router.get("/play/{pc_id}/duels", response_model=list[DuelSummary])
def list_duels(pc_id: uuid.UUID, db: DB) -> list[DuelSummary]:
    """The live duels this character has been called into.

    Args:
        pc_id: UUID of the player character (the capability).
        db: Database session.

    Returns:
        Live duels with a seat for this character, newest first.
    """
    try:
        return duel_service.called_for(db, pc_id)
    except ValueError as exc:
        raise _http(exc)


@router.get("/play/{pc_id}/duels/{duel_id}", response_model=DuelRead)
def read_duel(pc_id: uuid.UUID, duel_id: uuid.UUID, db: DB) -> DuelRead:
    """The fight as it stands, for one of the phones watching it.

    Args:
        pc_id: The character asking (the capability).
        duel_id: UUID of the duel.
        db: Database session.

    Returns:
        The duel, with whose turn it is spelled out.
    """
    try:
        return duel_service.read(db, duel_id, pc_id)
    except (ValueError, PermissionError) as exc:
        raise _http(exc)


@router.post("/play/{pc_id}/duels/{duel_id}/act", response_model=DuelRead)
def act_in_duel(pc_id: uuid.UUID, duel_id: uuid.UUID, body: DuelActBody, db: DB) -> DuelRead:
    """Take one action, if it is this character's turn.

    Args:
        pc_id: The character acting (the capability).
        duel_id: UUID of the duel.
        body: The action taken. The fight itself stays on the server.
        db: Database session.

    Returns:
        The duel after the action.
    """
    try:
        return duel_service.act(db, duel_id, pc_id, body.action)
    except (ValueError, PermissionError) as exc:
        raise _http(exc)


@router.post("/play/{pc_id}/duels/{duel_id}/referee", response_model=DuelRead)
def hand_to_referee(pc_id: uuid.UUID, duel_id: uuid.UUID, body: DuelSeatBody, db: DB) -> DuelRead:
    """Let the referee play a seat whose person stepped away (Plan 116).

    Args:
        pc_id: The character asking (the capability).
        duel_id: UUID of the duel.
        body: The seat to hand over — your own, or whoever is up.
        db: Database session.

    Returns:
        The duel after the hand-over.
    """
    try:
        return duel_service.hand_over(db, duel_id, pc_id, body.seat_pc_id)
    except (ValueError, PermissionError) as exc:
        raise _http(exc)


@router.post("/play/{pc_id}/duels/{duel_id}/return", response_model=DuelRead)
def take_seat_back(pc_id: uuid.UUID, duel_id: uuid.UUID, db: DB) -> DuelRead:
    """Play your own seat again after the referee covered it (Plan 116).

    Args:
        pc_id: The character coming back (the capability).
        duel_id: UUID of the duel.
        db: Database session.

    Returns:
        The duel; this character's next turn waits for them.
    """
    try:
        return duel_service.take_back(db, duel_id, pc_id)
    except (ValueError, PermissionError) as exc:
        raise _http(exc)


@router.post("/play/{pc_id}/duels/{duel_id}/end", response_model=DuelRead)
def end_duel(pc_id: uuid.UUID, duel_id: uuid.UUID, db: DB) -> DuelRead:
    """Call the duel off. Anyone in it can, at any time.

    Args:
        pc_id: The character ending it (the capability).
        duel_id: UUID of the duel.
        db: Database session.

    Returns:
        The closed duel.
    """
    try:
        return duel_service.end(db, duel_id, pc_id)
    except (ValueError, PermissionError) as exc:
        raise _http(exc)
