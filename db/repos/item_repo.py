"""Item and LootTable repositories — DB access only, no business logic."""

import uuid
from typing import Optional

from sqlalchemy import func
from sqlmodel import Session, select

from domain.adventure import Adventure
from domain.campaign import Campaign
from domain.character import CharacterItem, PlayerCharacter
from domain.item import Item, ItemCreate, ItemUpdate, LootTable, LootTableCreate, LootTableUpdate
from domain.shop import Shop, ShopItem


class ItemRepo:
    """CRUD operations for Item records."""

    @staticmethod
    def get_by_id(session: Session, item_id: uuid.UUID) -> Optional[Item]:
        """Fetch a single item by primary key.

        Args:
            session: Active database session.
            item_id: UUID of the item.

        Returns:
            Item if found, else None.
        """
        return session.get(Item, item_id)

    @staticmethod
    def list_all(session: Session, is_magic: Optional[bool] = None) -> list[Item]:
        """List items with optional magic-item filter.

        Args:
            session: Active database session.
            is_magic: If provided, filter to magic or non-magic items only.

        Returns:
            Items ordered by name ascending.
        """
        stmt = select(Item)
        if is_magic is not None:
            stmt = stmt.where(Item.is_magic == is_magic)
        stmt = stmt.order_by(Item.name.asc())
        return list(session.exec(stmt).all())

    @staticmethod
    def list_named(session: Session, name: str) -> list[Item]:
        """Items whose name matches, ignoring case and outer spaces (any owner).

        Args:
            session: Active database session.
            name: The name to match.

        Returns:
            Matching items.
        """
        stmt = select(Item).where(func.lower(Item.name) == name.strip().lower())
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: ItemCreate, owner_email: Optional[str] = None) -> Item:
        """Persist a new item.

        Args:
            session: Active database session.
            data: Validated item creation payload.
            owner_email: The authoring DM for homebrew; None for the shared catalog.

        Returns:
            The newly created Item.
        """
        item = Item.model_validate(data)
        item.created_by_email = owner_email
        session.add(item)
        session.commit()
        session.refresh(item)
        return item

    @staticmethod
    def update(session: Session, item: Item, data: ItemUpdate) -> Item:
        """Apply a partial update to an item.

        Args:
            session: Active database session.
            item: Existing Item ORM object.
            data: Partial update payload.

        Returns:
            The updated Item.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(item, field, value)
        session.add(item)
        session.commit()
        session.refresh(item)
        return item

    @staticmethod
    def delete(session: Session, item: Item) -> bool:
        """Delete an item record.

        Args:
            session: Active database session.
            item: Item ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(item)
        session.commit()
        return True

    # ── Where an item is used (Plan 132: delete refuses while anything holds it) ──

    @staticmethod
    def inventory_holders(session: Session, item_id: uuid.UUID) -> list[tuple[str, str]]:
        """Characters carrying this item, with their campaign's DM.

        Args:
            session: Active database session.
            item_id: UUID of the item.

        Returns:
            ``(character name, campaign DM email)`` pairs, by name.
        """
        stmt = (
            select(PlayerCharacter.character_name, Campaign.dm_email)
            .join(CharacterItem, CharacterItem.character_id == PlayerCharacter.id)
            .join(Campaign, Campaign.id == PlayerCharacter.campaign_id)
            .where(CharacterItem.item_id == item_id)
            .order_by(PlayerCharacter.character_name.asc())
        )
        return [(name, dm) for name, dm in session.exec(stmt).all()]

    @staticmethod
    def shops_stocking(session: Session, item_id: uuid.UUID) -> list[tuple[str, str]]:
        """Shops that stock this item, with their campaign's DM.

        Args:
            session: Active database session.
            item_id: UUID of the item.

        Returns:
            ``(shop name, campaign DM email)`` pairs, by name.
        """
        stmt = (
            select(Shop.name, Campaign.dm_email)
            .join(ShopItem, ShopItem.shop_id == Shop.id)
            .join(Campaign, Campaign.id == Shop.campaign_id)
            .where(ShopItem.item_id == item_id)
            .order_by(Shop.name.asc())
        )
        return [(name, dm) for name, dm in session.exec(stmt).all()]


class LootTableRepo:
    """CRUD operations for LootTable records."""

    @staticmethod
    def get_by_id(session: Session, loot_table_id: uuid.UUID) -> Optional[LootTable]:
        """Fetch a single loot table by primary key.

        Args:
            session: Active database session.
            loot_table_id: UUID of the loot table.

        Returns:
            LootTable if found, else None.
        """
        return session.get(LootTable, loot_table_id)

    @staticmethod
    def list_by_adventure(session: Session, adventure_id: uuid.UUID) -> list[LootTable]:
        """List all loot tables for an adventure.

        Args:
            session: Active database session.
            adventure_id: UUID of the parent adventure.

        Returns:
            LootTables ordered by name ascending.
        """
        stmt = (
            select(LootTable)
            .where(LootTable.adventure_id == adventure_id)
            .order_by(LootTable.name.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def tables_listing_item(session: Session, item_id: uuid.UUID) -> list[tuple[str, str]]:
        """Loot tables with an entry naming this item (``"item_id"``), with their campaign's DM.

        Entries are free-form JSON, so the match is made on the loaded rows.

        Args:
            session: Active database session.
            item_id: UUID of the item.

        Returns:
            ``(loot table name, campaign DM email)`` pairs, by name.
        """
        stmt = (
            select(LootTable, Campaign.dm_email)
            .join(Adventure, Adventure.id == LootTable.adventure_id)
            .join(Campaign, Campaign.id == Adventure.campaign_id)
            .order_by(LootTable.name.asc())
        )
        target = str(item_id)
        out: list[tuple[str, str]] = []
        for table, dm in session.exec(stmt).all():
            entries = table.entries or []
            if any(isinstance(e, dict) and str(e.get("item_id")) == target for e in entries):
                out.append((table.name, dm))
        return out

    @staticmethod
    def create(session: Session, data: LootTableCreate) -> LootTable:
        """Persist a new loot table.

        Args:
            session: Active database session.
            data: Validated loot table creation payload.

        Returns:
            The newly created LootTable.
        """
        loot_table = LootTable.model_validate(data)
        session.add(loot_table)
        session.commit()
        session.refresh(loot_table)
        return loot_table

    @staticmethod
    def update(session: Session, loot_table: LootTable, data: LootTableUpdate) -> LootTable:
        """Apply a partial update to a loot table.

        Args:
            session: Active database session.
            loot_table: Existing LootTable ORM object.
            data: Partial update payload.

        Returns:
            The updated LootTable.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(loot_table, field, value)
        session.add(loot_table)
        session.commit()
        session.refresh(loot_table)
        return loot_table

    @staticmethod
    def delete(session: Session, loot_table: LootTable) -> bool:
        """Delete a loot table record.

        Args:
            session: Active database session.
            loot_table: LootTable ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(loot_table)
        session.commit()
        return True
