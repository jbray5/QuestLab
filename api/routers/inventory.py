"""PC inventory router (Plan 00019).

Routes are scoped under /characters/{character_id}/inventory. Authz is
enforced in ``inventory_service`` (DM must own the campaign).
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.character import (
    AttunementLimitError,
    CharacterItemCreate,
    CharacterItemRead,
    CharacterItemUpdate,
)
from services import inventory_service

router = APIRouter(tags=["inventory"])


@router.get(
    "/characters/{character_id}/inventory",
    response_model=list[CharacterItemRead],
)
def list_inventory(character_id: uuid.UUID, db: DB, user: CurrentUser) -> list[CharacterItemRead]:
    """List a PC's inventory rows, newest first.

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Inventory rows.
    """
    try:
        rows = inventory_service.list_for_character(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return [CharacterItemRead.model_validate(r) for r in rows]


@router.post(
    "/characters/{character_id}/inventory",
    response_model=CharacterItemRead,
    status_code=status.HTTP_201_CREATED,
)
def add_inventory_item(
    character_id: uuid.UUID,
    body: CharacterItemCreate,
    db: DB,
    user: CurrentUser,
) -> CharacterItemRead:
    """Add an item to a PC's inventory (idempotent on item_id).

    If the PC already has this item, quantity is incremented instead of
    creating a duplicate row.

    Args:
        character_id: UUID of the PC.
        body: Validated CharacterItemCreate.
        db: Database session.
        user: Authenticated DM.

    Returns:
        The created or merged inventory row.

    Raises:
        HTTPException 404: If PC or item not found.
        HTTPException 403: If the DM does not own the campaign.
        HTTPException 422: If attempting to attune past the 3-item cap.
    """
    try:
        row = inventory_service.add_item(db, character_id, body, user)
    except ValueError as exc:
        if isinstance(exc, AttunementLimitError):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return CharacterItemRead.model_validate(row)


@router.patch(
    "/characters/{character_id}/inventory/{character_item_id}",
    response_model=CharacterItemRead,
)
def update_inventory_item(
    character_id: uuid.UUID,
    character_item_id: uuid.UUID,
    body: CharacterItemUpdate,
    db: DB,
    user: CurrentUser,
) -> CharacterItemRead:
    """Patch quantity, equipped, attuned, or notes on an inventory row.

    Quantity 0 deletes the row (returns a synthetic row with quantity=0
    so the client can confirm deletion).

    Args:
        character_id: UUID of the PC (used for the URL grouping only).
        character_item_id: UUID of the row.
        body: Partial update.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated row.

    Raises:
        HTTPException 404: If the row is not found.
        HTTPException 422: If attuning past the cap.
    """
    try:
        # Apply each field separately to centralize attunement cap enforcement.
        row = None
        if body.quantity is not None:
            row = inventory_service.set_quantity(db, character_item_id, body.quantity, user)
        if body.equipped is not None and row is not None:
            row = inventory_service.set_equipped(db, character_item_id, body.equipped, user)
        elif body.equipped is not None:
            row = inventory_service.set_equipped(db, character_item_id, body.equipped, user)
        if body.attuned is not None and row is not None:
            row = inventory_service.set_attuned(db, character_item_id, body.attuned, user)
        elif body.attuned is not None:
            row = inventory_service.set_attuned(db, character_item_id, body.attuned, user)
        if body.notes is not None:
            from db.repos.character_item_repo import CharacterItemRepo

            current = row if row is not None else CharacterItemRepo.get_by_id(db, character_item_id)
            if current is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Inventory row not found"
                )
            row = CharacterItemRepo.update(db, current, CharacterItemUpdate(notes=body.notes))
        if row is None:
            # No fields supplied — just fetch and return current state for predictability.
            from db.repos.character_item_repo import CharacterItemRepo

            row = CharacterItemRepo.get_by_id(db, character_item_id)
            if row is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Inventory row not found"
                )
    except AttunementLimitError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return CharacterItemRead.model_validate(row)


@router.delete(
    "/characters/{character_id}/inventory/{character_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_inventory_item(
    character_id: uuid.UUID,
    character_item_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
) -> None:
    """Delete an inventory row.

    Args:
        character_id: UUID of the PC (URL grouping only).
        character_item_id: UUID of the row.
        db: Database session.
        user: Authenticated DM.
    """
    try:
        inventory_service.remove(db, character_item_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
