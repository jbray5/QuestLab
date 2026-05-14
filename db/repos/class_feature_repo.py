"""ClassFeature + CharacterFeature repositories (Plan 00021)."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.character import (
    CharacterFeature,
    CharacterFeatureCreate,
    CharacterFeatureUpdate,
    ClassFeature,
    ClassFeatureCreate,
)
from domain.enums import CharacterClass


class ClassFeatureRepo:
    """CRUD for the class_features catalog."""

    @staticmethod
    def get_by_id(session: Session, feature_id: uuid.UUID) -> Optional[ClassFeature]:
        """Fetch a single feature by primary key."""
        return session.get(ClassFeature, feature_id)

    @staticmethod
    def list_all(
        session: Session,
        character_class: Optional[CharacterClass] = None,
        max_level: int = 20,
    ) -> list[ClassFeature]:
        """List catalog features with optional class + level cap filter.

        Args:
            session: Active database session.
            character_class: Optional class filter.
            max_level: Inclusive upper bound on level_acquired (defaults 20).

        Returns:
            ClassFeature rows ordered by class, level, name.
        """
        stmt = select(ClassFeature)
        if character_class is not None:
            stmt = stmt.where(ClassFeature.character_class == character_class)
        stmt = stmt.where(ClassFeature.level_acquired <= max_level).order_by(
            ClassFeature.character_class.asc(),
            ClassFeature.level_acquired.asc(),
            ClassFeature.name.asc(),
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def find_by_name_class(
        session: Session, name: str, character_class: CharacterClass
    ) -> Optional[ClassFeature]:
        """Find a feature by (name, class) — used by the seeder for idempotency."""
        stmt = (
            select(ClassFeature)
            .where(ClassFeature.name == name)
            .where(ClassFeature.character_class == character_class)
            .limit(1)
        )
        return session.exec(stmt).first()

    @staticmethod
    def create(session: Session, data: ClassFeatureCreate) -> ClassFeature:
        """Insert a new catalog feature.

        Args:
            session: Active database session.
            data: Validated payload.

        Returns:
            The newly persisted ClassFeature.
        """
        row = ClassFeature.model_validate(data)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def count(session: Session) -> int:
        """Return the total feature count (used by the seeder for idempotency)."""
        return len(list(session.exec(select(ClassFeature)).all()))


class CharacterFeatureRepo:
    """CRUD for character_features (per-PC feature instances)."""

    @staticmethod
    def get_by_id(session: Session, character_feature_id: uuid.UUID) -> Optional[CharacterFeature]:
        """Fetch a single PC-feature row."""
        return session.get(CharacterFeature, character_feature_id)

    @staticmethod
    def list_for_character(session: Session, character_id: uuid.UUID) -> list[CharacterFeature]:
        """Return all PC-feature rows for a PC.

        Args:
            session: Active database session.
            character_id: UUID of the PC.

        Returns:
            CharacterFeature rows.
        """
        stmt = select(CharacterFeature).where(CharacterFeature.character_id == character_id)
        return list(session.exec(stmt).all())

    @staticmethod
    def find_by_pc_and_feature(
        session: Session, character_id: uuid.UUID, feature_id: uuid.UUID
    ) -> Optional[CharacterFeature]:
        """Find an existing PC-feature row for this (PC, feature) pair."""
        stmt = (
            select(CharacterFeature)
            .where(CharacterFeature.character_id == character_id)
            .where(CharacterFeature.feature_id == feature_id)
            .limit(1)
        )
        return session.exec(stmt).first()

    @staticmethod
    def create(
        session: Session, character_id: uuid.UUID, data: CharacterFeatureCreate
    ) -> CharacterFeature:
        """Insert a new PC-feature row."""
        row = CharacterFeature.model_validate({**data.model_dump(), "character_id": character_id})
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def update(
        session: Session, row: CharacterFeature, data: CharacterFeatureUpdate
    ) -> CharacterFeature:
        """Apply a partial update to a PC-feature row."""
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(row, field, value)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def delete(session: Session, row: CharacterFeature) -> bool:
        """Delete a PC-feature row."""
        session.delete(row)
        session.commit()
        return True
