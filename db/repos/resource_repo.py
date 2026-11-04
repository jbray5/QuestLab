"""Character counter repository (Plan 135): ``character_resources`` rows. DB access only."""

import uuid
from typing import Any, Optional

from sqlmodel import Session, select

from domain.character import CharacterResource


class ResourceRepo:
    """CRUD for character_resources (a character's counters and spent uses)."""

    @staticmethod
    def get_by_id(session: Session, resource_id: uuid.UUID) -> Optional[CharacterResource]:
        """Fetch one counter row by primary key.

        Args:
            session: Active database session.
            resource_id: UUID of the row.

        Returns:
            The row, or None.
        """
        return session.get(CharacterResource, resource_id)

    @staticmethod
    def list_for_character(session: Session, character_id: uuid.UUID) -> list[CharacterResource]:
        """Every counter row of a character, oldest first.

        Args:
            session: Active database session.
            character_id: UUID of the character.

        Returns:
            The rows, in the order they were made.
        """
        stmt = (
            select(CharacterResource)
            .where(CharacterResource.character_id == character_id)
            .order_by(CharacterResource.created_at, CharacterResource.name)
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, row: CharacterResource) -> CharacterResource:
        """Insert a counter row.

        Args:
            session: Active database session.
            row: The new row (its id may be preset).

        Returns:
            The stored row.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def update(
        session: Session, row: CharacterResource, fields: dict[str, Any]
    ) -> CharacterResource:
        """Set fields on a counter row and save it.

        Args:
            session: Active database session.
            row: The row to change.
            fields: Column name → new value.

        Returns:
            The saved row.
        """
        for key, value in fields.items():
            setattr(row, key, value)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def save_many(session: Session, rows: list[CharacterResource]) -> None:
        """Save several changed rows in one commit (a rest refilling counters).

        Args:
            session: Active database session.
            rows: Rows already changed in memory.
        """
        for row in rows:
            session.add(row)
        session.commit()

    @staticmethod
    def delete(session: Session, row: CharacterResource) -> None:
        """Delete a counter row.

        Args:
            session: Active database session.
            row: The row to delete.
        """
        session.delete(row)
        session.commit()

    @staticmethod
    def delete_many(session: Session, rows: list[CharacterResource]) -> None:
        """Delete several rows in one commit (stale subclass counters).

        Args:
            session: Active database session.
            rows: The rows to delete.
        """
        for row in rows:
            session.delete(row)
        session.commit()
