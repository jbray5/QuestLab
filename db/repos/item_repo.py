"""Item and LootTable repositories — DB access only, no business logic."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.item import Item, ItemCreate, ItemUpdate, LootTable, LootTableCreate, LootTableUpdate


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
    def create(session: Session, data: ItemCreate) -> Item:
        """Persist a new item.

        Args:
            session: Active database session.
            data: Validated item creation payload.

        Returns:
            The newly created Item.
        """
        item = Item.model_validate(data)
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
