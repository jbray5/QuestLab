"""Encounter repository — DB access only, no business logic."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.encounter import Encounter, EncounterCreate, EncounterUpdate


class EncounterRepo:
    """CRUD operations for Encounter records."""

    @staticmethod
    def get_by_id(session: Session, encounter_id: uuid.UUID) -> Optional[Encounter]:
        """Fetch a single encounter by primary key.

        Args:
            session: Active database session.
            encounter_id: UUID of the encounter.

        Returns:
            Encounter if found, else None.
        """
        return session.get(Encounter, encounter_id)

    @staticmethod
    def list_by_adventure(session: Session, adventure_id: uuid.UUID) -> list[Encounter]:
        """List all encounters in an adventure.

        Args:
            session: Active database session.
            adventure_id: UUID of the parent adventure.

        Returns:
            Encounters ordered by name ascending.
        """
        stmt = (
            select(Encounter)
            .where(Encounter.adventure_id == adventure_id)
            .order_by(Encounter.name.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: EncounterCreate) -> Encounter:
        """Persist a new encounter.

        Args:
            session: Active database session.
            data: Validated encounter creation payload.

        Returns:
            The newly created Encounter.
        """
        encounter = Encounter.model_validate(data)
        session.add(encounter)
        session.commit()
        session.refresh(encounter)
        return encounter

    @staticmethod
    def update(session: Session, encounter: Encounter, data: EncounterUpdate) -> Encounter:
        """Apply a partial update to an existing encounter.

        Args:
            session: Active database session.
            encounter: Existing Encounter ORM object.
            data: Partial update payload.

        Returns:
            The updated Encounter.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(encounter, field, value)
        session.add(encounter)
        session.commit()
        session.refresh(encounter)
        return encounter

    @staticmethod
    def delete(session: Session, encounter: Encounter) -> bool:
        """Delete an encounter record.

        Args:
            session: Active database session.
            encounter: Encounter ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(encounter)
        session.commit()
        return True
