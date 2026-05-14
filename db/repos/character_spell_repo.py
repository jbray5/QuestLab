"""CharacterSpell repository — PC spell-list DB access (Plan 00020)."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.character import CharacterSpell, CharacterSpellCreate, CharacterSpellUpdate


class CharacterSpellRepo:
    """CRUD for character_spells rows."""

    @staticmethod
    def get_by_id(session: Session, character_spell_id: uuid.UUID) -> Optional[CharacterSpell]:
        """Fetch a single spell-list row by primary key.

        Args:
            session: Active database session.
            character_spell_id: UUID of the row.

        Returns:
            CharacterSpell or None.
        """
        return session.get(CharacterSpell, character_spell_id)

    @staticmethod
    def list_for_character(session: Session, character_id: uuid.UUID) -> list[CharacterSpell]:
        """Return all spell-list rows for a PC.

        Args:
            session: Active database session.
            character_id: UUID of the PC.

        Returns:
            Rows ordered by added_at desc.
        """
        stmt = (
            select(CharacterSpell)
            .where(CharacterSpell.character_id == character_id)
            .order_by(CharacterSpell.added_at.desc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def find_by_pc_and_spell(
        session: Session, character_id: uuid.UUID, spell_id: uuid.UUID
    ) -> Optional[CharacterSpell]:
        """Find an existing spell-list row for this PC + spell.

        Args:
            session: Active database session.
            character_id: UUID of the PC.
            spell_id: UUID of the spell.

        Returns:
            CharacterSpell or None.
        """
        stmt = (
            select(CharacterSpell)
            .where(CharacterSpell.character_id == character_id)
            .where(CharacterSpell.spell_id == spell_id)
            .limit(1)
        )
        return session.exec(stmt).first()

    @staticmethod
    def create(
        session: Session, character_id: uuid.UUID, data: CharacterSpellCreate
    ) -> CharacterSpell:
        """Persist a new spell-list row.

        Args:
            session: Active database session.
            character_id: UUID of the owning PC.
            data: Validated creation payload.

        Returns:
            The newly created CharacterSpell.
        """
        row = CharacterSpell.model_validate({**data.model_dump(), "character_id": character_id})
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def update(session: Session, row: CharacterSpell, data: CharacterSpellUpdate) -> CharacterSpell:
        """Apply a partial update.

        Args:
            session: Active database session.
            row: Existing row.
            data: Partial update.

        Returns:
            The updated CharacterSpell.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(row, field, value)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def delete(session: Session, row: CharacterSpell) -> bool:
        """Delete a spell-list row.

        Args:
            session: Active database session.
            row: Row to delete.

        Returns:
            True if deleted.
        """
        session.delete(row)
        session.commit()
        return True
