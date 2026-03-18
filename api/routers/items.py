"""Magic item browser and AI lore router."""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from api.deps import DB, CurrentUser
from db.repos.item_repo import ItemRepo
from domain.item import ItemRead, ItemUpdate
from services import ai_service, item_service

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
