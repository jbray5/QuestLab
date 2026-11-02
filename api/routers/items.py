"""Magic item browser router."""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from api.deps import DB, CurrentUser
from db.repos.character_repo import CharacterRepo
from domain.item import ItemConflictError, ItemCreate, ItemRead, ItemUpdate, WeaponAttackPreview
from services import attack_service, item_service

router = APIRouter(tags=["items"])


@router.get("/items", response_model=list[ItemRead])
def list_items(
    db: DB,
    user: CurrentUser,
    q: Optional[str] = Query(None, description="Name search (case-insensitive)"),
    rarity: Optional[str] = Query(None, description="Filter by rarity (e.g. Rare, VeryRare)"),
    item_type: Optional[str] = Query(None, description="Filter by item type (e.g. Weapon, Potion)"),
    kind: item_service.ItemKind = Query(
        "magic", description="magic (default), mundane (weapons, armor, gear) or all"
    ),
) -> list[ItemRead]:
    """Browse catalog items (magic ones unless ``kind`` says otherwise) with filters.

    Args:
        db: Database session.
        user: Authenticated DM (sees shared items plus their own homebrew).
        q: Optional name substring search.
        rarity: Optional exact rarity filter.
        item_type: Optional item type filter.
        kind: magic (default), mundane or all (Plan 132: a DM's non-magic
            homebrew weapon lists under mundane).

    Returns:
        Filtered list of items ordered by name.
    """
    return item_service.list_items(
        db, q=q, rarity=rarity, item_type=item_type, viewer=user, kind=kind
    )


@router.get("/weapons", response_model=list[ItemRead])
def list_weapons(
    db: DB,
    user: CurrentUser,
    q: Optional[str] = Query(None, description="Name search (case-insensitive)"),
    category: Optional[str] = Query(
        None, description="Weapon category (Simple Melee, Martial Ranged, ...)"
    ),
    mastery: Optional[str] = Query(None, description="2024 mastery property (Vex, Nick, ...)"),
    property_name: Optional[str] = Query(
        None,
        alias="property",
        description="Weapon must have this property (Finesse, Heavy, Thrown, ...)",
    ),
    is_magic: Optional[bool] = Query(None, description="Filter to magic-only or mundane-only"),
) -> list[ItemRead]:
    """Browse all weapons (mundane + magic) with optional filters.

    Args:
        db: Database session.
        user: Authenticated DM (sees shared weapons plus their own homebrew).
        q: Optional name substring search.
        category: Optional weapon category.
        mastery: Optional 2024 mastery property.
        property_name: Optional required property (query param ``property``).
        is_magic: Optional magic filter.

    Returns:
        Filtered list of weapon items ordered by name.
    """
    return item_service.list_weapons(
        db,
        q=q,
        category=category,
        mastery=mastery,
        property_name=property_name,
        is_magic=is_magic,
        viewer=user,
    )


@router.post("/items/{item_id}/attack-preview", response_model=WeaponAttackPreview)
def attack_preview(
    item_id: uuid.UUID,
    db: DB,
    _user: CurrentUser,
    character_id: uuid.UUID = Query(..., description="UUID of the wielding character"),
    proficient: bool = Query(True, description="Treat the character as proficient"),
    two_handed: bool = Query(False, description="Use versatile damage die"),
) -> WeaponAttackPreview:
    """Compute the attack-roll output for a PC wielding the given weapon.

    Args:
        item_id: UUID of the weapon item.
        db: Database session.
        _user: Authenticated DM.
        character_id: UUID of the player character.
        proficient: Whether the character is proficient with this weapon.
        two_handed: For Versatile weapons, use the larger die.

    Returns:
        WeaponAttackPreview with hit bonus, damage roll, mastery, etc.

    Raises:
        HTTPException 404: If the item or character is not found.
        HTTPException 422: If the item is not a weapon.
    """
    try:
        item = item_service.get_item(db, item_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    character = CharacterRepo.get_by_id(db, character_id)
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    try:
        return attack_service.compute_attack(
            item,
            character,
            proficient=proficient,
            two_handed=two_handed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post("/items", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def create_item(body: ItemCreate, db: DB, user: CurrentUser) -> ItemRead:
    """Persist a homebrew or campaign-specific item as the DM's own.

    Any authenticated DM may author; the item is stamped with their email
    (SEC-003). Used by campaign-side scripts to seed plot items (the False
    Moonglass shard etc.) that the loot picker needs.

    Args:
        body: Validated ItemCreate payload.
        db: Database session.
        user: Authenticated DM (recorded as the author).

    Returns:
        Newly persisted item.

    Raises:
        HTTPException 409: If the DM can already see an item with that name (Plan 132).
    """
    try:
        item = item_service.create_item(db, body, dm_email=user)
    except ItemConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return ItemRead.model_validate(item)


@router.get("/items/{item_id}", response_model=ItemRead)
def get_item(
    item_id: uuid.UUID,
    db: DB,
    _user: CurrentUser,
) -> ItemRead:
    """Fetch a single magic item by ID.

    Args:
        item_id: UUID of the item.
        db: Database session.
        _user: Authenticated DM.

    Returns:
        ItemRead with full item data.

    Raises:
        HTTPException 404: If item not found.
    """
    try:
        item = item_service.get_item(db, item_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return ItemRead.model_validate(item)


@router.patch("/items/{item_id}", response_model=ItemRead)
def update_item(
    item_id: uuid.UUID,
    body: ItemUpdate,
    db: DB,
    user: CurrentUser,
) -> ItemRead:
    """Partially update an item (e.g. set image_url) the DM may edit.

    Args:
        item_id: UUID of the item to update.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM (must own the homebrew row, or be an admin).

    Returns:
        Updated ItemRead.

    Raises:
        HTTPException 404: If item not found.
        HTTPException 403: If the item is shared or another DM's (SEC-003).
        HTTPException 409: If a homebrew item is renamed to a name the DM can
            already see (Plan 132).
    """
    try:
        updated = item_service.update_item(db, item_id, body, user)
    except ItemConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return ItemRead.model_validate(updated)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a homebrew item (Plan 132); refused while anything still holds it.

    Args:
        item_id: UUID of the item to delete.
        db: Database session.
        user: Authenticated DM (must own the homebrew row, or be an admin).

    Raises:
        HTTPException 404: If item not found.
        HTTPException 403: If the item is shared or another DM's (SEC-003).
        HTTPException 409: If a character's inventory, a shop or a loot table
            still holds it; the detail says where, in plain words.
    """
    try:
        item_service.delete_item(db, item_id, user)
    except ItemConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
