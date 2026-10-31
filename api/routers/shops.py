"""Shops router — DM marketplace management + player storefronts (Plan 47).

The storefront and market endpoints are intentionally unauthenticated:
the shop/campaign UUID is a capability secret, the same trust model as
the Table View. Their payloads carry no DM-only data.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.shop import (
    MarketRead,
    ShopCreate,
    ShopItemAdd,
    ShopItemUpdate,
    ShopRead,
    ShopUpdate,
    StorefrontItem,
    StorefrontRead,
)
from services import shop_service

router = APIRouter(tags=["shops"])


@router.get("/campaigns/{campaign_id}/shops", response_model=list[ShopRead])
def list_shops(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[ShopRead]:
    """List a campaign's shops for the DM manager.

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        ShopReads in town order.
    """
    try:
        return shop_service.list_shops(db, campaign_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/campaigns/{campaign_id}/shops",
    response_model=ShopRead,
    status_code=status.HTTP_201_CREATED,
)
def create_shop(campaign_id: uuid.UUID, body: ShopCreate, db: DB, user: CurrentUser) -> ShopRead:
    """Create a shop in a campaign.

    Args:
        campaign_id: UUID of the campaign.
        body: Shop creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The created shop.
    """
    try:
        return shop_service.create_shop(db, campaign_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/shops/{shop_id}", response_model=ShopRead)
def update_shop(shop_id: uuid.UUID, body: ShopUpdate, db: DB, user: CurrentUser) -> ShopRead:
    """Update a shop's flavor fields.

    Args:
        shop_id: UUID of the shop.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed shop.
    """
    try:
        return shop_service.update_shop(db, shop_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/shops/{shop_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shop(shop_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a shop and its stock rows.

    Args:
        shop_id: UUID of the shop.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        shop_service.delete_shop(db, shop_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/shops/{shop_id}/items", response_model=StorefrontItem, status_code=status.HTTP_201_CREATED
)
def add_item(shop_id: uuid.UUID, body: ShopItemAdd, db: DB, user: CurrentUser) -> StorefrontItem:
    """Stock one item (catalog reference or new custom item).

    Args:
        shop_id: UUID of the shop.
        body: Item reference/definition + shop price.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The stocked item card.
    """
    try:
        return shop_service.add_item(db, shop_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/shops/{shop_id}/items/{shop_item_id}", response_model=StorefrontItem)
def update_item(
    shop_id: uuid.UUID,
    shop_item_id: uuid.UUID,
    body: ShopItemUpdate,
    db: DB,
    user: CurrentUser,
) -> StorefrontItem:
    """Update a stocked item's price / stock / pitch.

    Args:
        shop_id: UUID of the shop.
        shop_item_id: UUID of the shop_items row.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed item card.
    """
    try:
        return shop_service.update_item(db, shop_id, shop_item_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/shops/{shop_id}/items/{shop_item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_item(shop_id: uuid.UUID, shop_item_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Remove an item from a shop.

    Args:
        shop_id: UUID of the shop.
        shop_item_id: UUID of the shop_items row.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        shop_service.remove_item(db, shop_id, shop_item_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/storefront/{shop_id}", response_model=StorefrontRead)
def get_storefront(shop_id: uuid.UUID, db: DB) -> StorefrontRead:
    """Player-facing storefront — capability URL, no auth.

    Args:
        shop_id: UUID of the shop (the capability secret).
        db: Database session.

    Returns:
        The storefront with item cards.
    """
    try:
        return shop_service.get_storefront(db, shop_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/market/{campaign_id}", response_model=MarketRead)
def get_market(campaign_id: uuid.UUID, db: DB) -> MarketRead:
    """Player-facing town market — capability URL, no auth.

    Args:
        campaign_id: UUID of the campaign (the capability secret).
        db: Database session.

    Returns:
        The market with shop cards.
    """
    try:
        return shop_service.get_market(db, campaign_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
