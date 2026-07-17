"""Shop repositories — DB access only, no business logic (Plan 47)."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.shop import Shop, ShopCreate, ShopItem


class ShopRepo:
    """CRUD for campaign shops."""

    @staticmethod
    def get_by_id(session: Session, shop_id: uuid.UUID) -> Optional[Shop]:
        """Fetch a shop by primary key.

        Args:
            session: Active database session.
            shop_id: UUID of the shop.

        Returns:
            The Shop if found, else None.
        """
        stmt = select(Shop).where(Shop.id == shop_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def list_for_campaign(session: Session, campaign_id: uuid.UUID) -> list[Shop]:
        """List a campaign's shops, oldest first (stable town layout).

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.

        Returns:
            Shops ordered by created_at ascending.
        """
        stmt = select(Shop).where(Shop.campaign_id == campaign_id).order_by(Shop.created_at.asc())
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, campaign_id: uuid.UUID, data: ShopCreate) -> Shop:
        """Persist a new shop.

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.
            data: Validated creation payload.

        Returns:
            The newly-created Shop.
        """
        row = Shop.model_validate({**data.model_dump(), "campaign_id": campaign_id})
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def save(session: Session, shop: Shop) -> Shop:
        """Persist field changes already applied to a fetched row.

        Args:
            session: Active database session.
            shop: The modified Shop row.

        Returns:
            The refreshed Shop.
        """
        session.add(shop)
        session.commit()
        session.refresh(shop)
        return shop

    @staticmethod
    def delete(session: Session, shop: Shop) -> None:
        """Delete a shop row (stocked items are removed by the service first).

        Args:
            session: Active database session.
            shop: The Shop row to delete.
        """
        session.delete(shop)
        session.commit()


class ShopItemRepo:
    """CRUD for a shop's stocked items."""

    @staticmethod
    def get_by_id(session: Session, shop_item_id: uuid.UUID) -> Optional[ShopItem]:
        """Fetch a stocked-item row by primary key.

        Args:
            session: Active database session.
            shop_item_id: UUID of the shop_items row.

        Returns:
            The ShopItem if found, else None.
        """
        stmt = select(ShopItem).where(ShopItem.id == shop_item_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def list_for_shop(session: Session, shop_id: uuid.UUID) -> list[ShopItem]:
        """List a shop's stocked items in display order.

        Args:
            session: Active database session.
            shop_id: UUID of the shop.

        Returns:
            ShopItems ordered by sort_order ascending.
        """
        stmt = (
            select(ShopItem).where(ShopItem.shop_id == shop_id).order_by(ShopItem.sort_order.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def count_for_shop(session: Session, shop_id: uuid.UUID) -> int:
        """Count a shop's stocked items.

        Args:
            session: Active database session.
            shop_id: UUID of the shop.

        Returns:
            Number of shop_items rows.
        """
        stmt = select(ShopItem).where(ShopItem.shop_id == shop_id)
        return len(list(session.exec(stmt).all()))

    @staticmethod
    def create(session: Session, row: ShopItem) -> ShopItem:
        """Persist a new stocked-item row.

        Args:
            session: Active database session.
            row: The ShopItem to insert.

        Returns:
            The newly-created ShopItem.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def save(session: Session, row: ShopItem) -> ShopItem:
        """Persist field changes already applied to a fetched row.

        Args:
            session: Active database session.
            row: The modified ShopItem row.

        Returns:
            The refreshed ShopItem.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def delete(session: Session, row: ShopItem) -> None:
        """Delete a stocked-item row.

        Args:
            session: Active database session.
            row: The ShopItem row to delete.
        """
        session.delete(row)
        session.commit()

    @staticmethod
    def delete_for_shop(session: Session, shop_id: uuid.UUID) -> None:
        """Delete every stocked-item row for a shop (used before shop delete).

        Args:
            session: Active database session.
            shop_id: UUID of the shop being emptied.
        """
        for row in ShopItemRepo.list_for_shop(session, shop_id):
            session.delete(row)
        session.commit()
