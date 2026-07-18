"""Player character repository — DB access only, no business logic."""

import uuid
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

from domain.character import (
    CharacterFeature,
    CharacterItem,
    CharacterSpell,
    PlayerCharacter,
    PlayerCharacterCreate,
    PlayerCharacterUpdate,
)


class CharacterRepo:
    """CRUD operations for PlayerCharacter records."""

    @staticmethod
    def get_by_id(session: Session, character_id: uuid.UUID) -> Optional[PlayerCharacter]:
        """Fetch a single player character by primary key.

        Args:
            session: Active database session.
            character_id: UUID of the character.

        Returns:
            PlayerCharacter if found, else None.
        """
        return session.get(PlayerCharacter, character_id)

    @staticmethod
    def list_by_campaign(session: Session, campaign_id: uuid.UUID) -> list[PlayerCharacter]:
        """List all player characters in a campaign.

        Args:
            session: Active database session.
            campaign_id: UUID of the campaign.

        Returns:
            Characters ordered by character_name ascending.
        """
        stmt = (
            select(PlayerCharacter)
            .where(PlayerCharacter.campaign_id == campaign_id)
            .order_by(PlayerCharacter.character_name.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: PlayerCharacterCreate) -> PlayerCharacter:
        """Persist a new player character.

        Args:
            session: Active database session.
            data: Validated character creation payload.

        Returns:
            The newly created PlayerCharacter.
        """
        character = PlayerCharacter.model_validate(data)
        session.add(character)
        session.commit()
        session.refresh(character)
        return character

    @staticmethod
    def update(
        session: Session, character: PlayerCharacter, data: PlayerCharacterUpdate
    ) -> PlayerCharacter:
        """Apply a partial update to an existing player character.

        Args:
            session: Active database session.
            character: Existing PlayerCharacter ORM object.
            data: Partial update payload.

        Returns:
            The updated PlayerCharacter.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(character, field, value)
        character.updated_at = datetime.now(UTC)
        session.add(character)
        session.commit()
        session.refresh(character)
        return character

    @staticmethod
    def delete(session: Session, character: PlayerCharacter) -> bool:
        """Delete a player character record and its junction rows.

        The child tables (inventory, spells, features) reference
        player_characters without ON DELETE CASCADE, so the repo emulates
        it — otherwise any PC that ever bought or learned anything is
        undeletable (FK violation).

        Args:
            session: Active database session.
            character: PlayerCharacter ORM object to delete.

        Returns:
            True if deleted.
        """
        for model in (CharacterItem, CharacterSpell, CharacterFeature):
            rows = session.exec(select(model).where(model.character_id == character.id)).all()
            for row in rows:
                session.delete(row)
        # Commit the junction deletes before the parent delete: DuckDB's FK
        # check doesn't see same-transaction child deletions (documented
        # limitation) and would still reject the parent row.
        session.commit()
        session.delete(character)
        session.commit()
        return True
