"""Character counters router (Plan 135): Superiority Dice and other counters on the DM's sheet.

``/characters/{id}/resources``: list every counter (a homebrew subclass's, computed at the
character's level, then hand-made ones), add, change and remove hand-made ones, and spend or
restore uses of either kind. The campaign's DM only; ``resource_service`` checks it. The
player's spend and restore live on the play link (``api/routers/play.py``).
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, status

from api.deps import DB, CurrentUser
from domain.character import (
    CharacterResourceConflictError,
    CharacterResourceCreate,
    CharacterResourceNotFoundError,
    CharacterResourceRead,
    CharacterResourceUpdate,
)
from services import resource_service

router = APIRouter(tags=["resources"])


def _http(exc: Exception) -> HTTPException:
    """The HTTP error for a service refusal (404, 403, 409 or 422)."""
    if isinstance(exc, CharacterResourceNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, CharacterResourceConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


_REFUSALS = (CharacterResourceNotFoundError, PermissionError, ValueError)


@router.get("/characters/{character_id}/resources", response_model=list[CharacterResourceRead])
def list_resources(
    character_id: uuid.UUID, db: DB, user: CurrentUser
) -> list[CharacterResourceRead]:
    """Every counter of a character: subclass counters first, then hand-made ones.

    Args:
        character_id: The character.
        db: Database session.
        user: The signed-in DM.

    Returns:
        The counters, with sizes and dice at the character's level.
    """
    try:
        return resource_service.list_for_character(db, character_id, user)
    except _REFUSALS as exc:
        raise _http(exc)


@router.post(
    "/characters/{character_id}/resources",
    response_model=CharacterResourceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_resource(
    character_id: uuid.UUID, body: CharacterResourceCreate, db: DB, user: CurrentUser
) -> CharacterResourceRead:
    """Add a hand-made counter (409 when the name is taken or the sheet is full).

    Args:
        character_id: The character.
        body: Name, how many, die, recovery and notes.
        db: Database session.
        user: The signed-in DM.

    Returns:
        The new counter.
    """
    try:
        return resource_service.create_custom(db, character_id, body, user)
    except _REFUSALS as exc:
        raise _http(exc)


@router.patch(
    "/characters/{character_id}/resources/{resource_id}",
    response_model=CharacterResourceRead,
)
def update_resource(
    character_id: uuid.UUID,
    resource_id: uuid.UUID,
    body: CharacterResourceUpdate,
    db: DB,
    user: CurrentUser,
) -> CharacterResourceRead:
    """Change a hand-made counter (409 for a subclass counter: change it in the subclass).

    Args:
        character_id: The character.
        resource_id: The counter.
        body: The fields to change.
        db: Database session.
        user: The signed-in DM.

    Returns:
        The counter after the change.
    """
    try:
        return resource_service.update_custom(db, character_id, resource_id, body, user)
    except _REFUSALS as exc:
        raise _http(exc)


@router.delete(
    "/characters/{character_id}/resources/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_resource(
    character_id: uuid.UUID, resource_id: uuid.UUID, db: DB, user: CurrentUser
) -> None:
    """Remove a hand-made counter (409 for a subclass counter).

    Args:
        character_id: The character.
        resource_id: The counter.
        db: Database session.
        user: The signed-in DM.
    """
    try:
        resource_service.delete_custom(db, character_id, resource_id, user)
    except _REFUSALS as exc:
        raise _http(exc)


@router.post(
    "/characters/{character_id}/resources/{resource_id}/spend",
    response_model=CharacterResourceRead,
)
def spend_resource(
    character_id: uuid.UUID,
    resource_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
    amount: int = Query(1, ge=1, le=100),
) -> CharacterResourceRead:
    """Spend uses of a counter (never below none left).

    Args:
        character_id: The character.
        resource_id: The counter.
        db: Database session.
        user: The signed-in DM.
        amount: How many uses (default 1).

    Returns:
        The counter after the change.
    """
    try:
        return resource_service.spend(db, character_id, resource_id, user, amount=amount)
    except _REFUSALS as exc:
        raise _http(exc)


@router.post(
    "/characters/{character_id}/resources/{resource_id}/restore",
    response_model=CharacterResourceRead,
)
def restore_resource(
    character_id: uuid.UUID,
    resource_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
    amount: int = Query(1, ge=1, le=100),
) -> CharacterResourceRead:
    """Give uses of a counter back (never above full).

    Args:
        character_id: The character.
        resource_id: The counter.
        db: Database session.
        user: The signed-in DM.
        amount: How many uses (default 1).

    Returns:
        The counter after the change.
    """
    try:
        return resource_service.restore(db, character_id, resource_id, user, amount=amount)
    except _REFUSALS as exc:
        raise _http(exc)
