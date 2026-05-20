"""Magic item browser and AI lore router."""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from api.deps import DB, CurrentUser
from db.repos.character_repo import CharacterRepo
from db.repos.item_repo import ItemRepo
from domain.item import ItemCreate, ItemRead, ItemUpdate, WeaponAttackPreview
from services import ai_service, attack_service, item_service

router = APIRouter(tags=["items"])


class LoreRequest(BaseModel):
    """Request body for AI lore generation."""

    adventure_id: Optional[uuid.UUID] = None


class LoreResponse(BaseModel):
    """Response body for AI lore generation."""

    lore: str


@router.get("/items", response_model=list[ItemRead])
def list_items(
    db: DB,
    _user: CurrentUser,
    q: Optional[str] = Query(None, description="Name search (case-insensitive)"),
    rarity: Optional[str] = Query(None, description="Filter by rarity (e.g. Rare, VeryRare)"),
    item_type: Optional[str] = Query(None, description="Filter by item type (e.g. Weapon, Potion)"),
) -> list[ItemRead]:
    """Browse magic items with optional search and filters.

    Args:
        db: Database session.
        _user: Authenticated DM.
        q: Optional name substring search.
        rarity: Optional exact rarity filter.
        item_type: Optional item type filter.

    Returns:
        Filtered list of magic items ordered by name.
    """
    return item_service.list_items(db, q=q, rarity=rarity, item_type=item_type)


@router.get("/weapons", response_model=list[ItemRead])
def list_weapons(
    db: DB,
    _user: CurrentUser,
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
        _user: Authenticated DM.
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
def create_item(body: ItemCreate, db: DB, _user: CurrentUser) -> ItemRead:
    """Persist a homebrew or campaign-specific item to the shared catalog.

    Any authenticated DM may author. Mirrors the POST /spells pattern for
    homebrew spells. Used today by campaign-side scripts to seed plot
    items (the False Moonglass shard etc.) that the loot picker needs.

    Args:
        body: Validated ItemCreate payload.
        db: Database session.
        _user: Authenticated DM.

    Returns:
        Newly persisted item.
    """
    item = item_service.create_item(db, body)
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
    _user: CurrentUser,
) -> ItemRead:
    """Partially update an item (e.g. set image_url).

    Args:
        item_id: UUID of the item to update.
        body: Partial update payload.
        db: Database session.
        _user: Authenticated DM.

    Returns:
        Updated ItemRead.

    Raises:
        HTTPException 404: If item not found.
    """
    try:
        item = item_service.get_item(db, item_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    updated = ItemRepo.update(db, item, body)
    return ItemRead.model_validate(updated)


@router.post("/items/{item_id}/lore", response_model=LoreResponse)
def generate_lore(
    item_id: uuid.UUID,
    body: LoreRequest,
    db: DB,
    user: CurrentUser,
) -> LoreResponse:
    """Generate AI flavor lore for a magic item.

    Optionally ties the lore to the current adventure/campaign setting.
    Lore is generated on demand and not persisted.

    Args:
        item_id: UUID of the item.
        body: Optional adventure_id to anchor the lore to.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        LoreResponse containing 2-3 paragraphs of flavor lore.

    Raises:
        HTTPException 404: If item not found.
        HTTPException 403: If DM does not own the adventure.
        HTTPException 502: If Claude API call fails.
    """
    try:
        lore = ai_service.generate_item_lore(
            db,
            item_id=item_id,
            dm_email=user,
            adventure_id=body.adventure_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI generation failed: {exc}",
        )
    return LoreResponse(lore=lore)
