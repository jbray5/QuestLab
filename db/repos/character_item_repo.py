"""CharacterItem repository — DB access for PC inventory rows.

Plan 00019. No business logic — service layer enforces attunement cap, authz, etc.
"""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.character import CharacterItem, CharacterItemCreate, CharacterItemUpdate


class CharacterItemRepo:
    """CRUD for character_items rows."""

    @staticmethod
    def get_by_id(session: Session, character_item_id: uuid.UUID) -> Optional[CharacterItem]:
        """Fetch a single inventory row by primary key.

        Args:
            session: Active database session.
            character_item_id: UUID of the row.

        Returns:
            CharacterItem or None.
        """
        return session.get(CharacterItem, character_item_id)

    @staticmethod
    def list_for_character(session: Session, character_id: uuid.UUID) -> list[CharacterItem]:
        """Return all inventory rows for a PC ordered by acquired_at desc.

        Args:
            session: Active database session.
            character_id: UUID of the PC.

        Returns:
            CharacterItem rows, newest first.
        """
        stmt = (
            select(CharacterItem)
            .where(CharacterItem.character_id == character_id)
            .order_by(CharacterItem.acquired_at.desc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def find_by_pc_and_item(
        session: Session, character_id: uuid.UUID, item_id: uuid.UUID
    ) -> Optional[CharacterItem]:
        """Find an existing inventory row for this PC + item pair.

        Used to merge handouts: if the PC already has this item, bump quantity.

        Args:
            session: Active database session.
            character_id: UUID of the PC.
            item_id: UUID of the item.

        Returns:
            CharacterItem or None.
        """
        stmt = (
            select(CharacterItem)
            .where(CharacterItem.character_id == character_id)
            .where(CharacterItem.item_id == item_id)
            .limit(1)
        )
        return session.exec(stmt).first()

    @staticmethod
    def count_attuned_for_pc(session: Session, character_id: uuid.UUID) -> int:
        """Return how many items the PC is currently attuned to.

        Args:
            session: Active database session.
            character_id: UUID of the PC.

        Returns:
            Count of CharacterItem rows with attuned=True.
        """
        stmt = (
            select(CharacterItem)
            .where(CharacterItem.character_id == character_id)
            .where(CharacterItem.attuned.is_(True))
        )
        return len(list(session.exec(stmt).all()))

    @staticmethod
    def create(
        session: Session, character_id: uuid.UUID, data: CharacterItemCreate
    ) -> CharacterItem:
        """Persist a new inventory row.

        Args:
            session: Active database session.
            character_id: UUID of the owning PC (set on the row).
            data: Validated creation payload.

        Returns:
            The newly created CharacterItem.
        """
        row = CharacterItem.model_validate({**data.model_dump(), "character_id": character_id})
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def update(session: Session, row: CharacterItem, data: CharacterItemUpdate) -> CharacterItem:
        """Apply a partial update.

        Args:
            session: Active database session.
            row: Existing row.
            data: Partial update.

        Returns:
            The updated CharacterItem.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(row, field, value)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def delete(session: Session, row: CharacterItem) -> bool:
        """Delete an inventory row.

        Args:
            session: Active database session.
            row: Row to delete.

        Returns:
            True if deleted.
        """
        session.delete(row)
        session.commit()
        return True
