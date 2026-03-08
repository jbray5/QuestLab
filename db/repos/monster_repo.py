"""Monster stat block repository — DB access only, no business logic."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.monster import MonsterStatBlock, MonsterStatBlockCreate, MonsterStatBlockUpdate


class MonsterRepo:
    """CRUD operations for MonsterStatBlock records."""

    @staticmethod
    def get_by_id(session: Session, monster_id: uuid.UUID) -> Optional[MonsterStatBlock]:
        """Fetch a single monster stat block by primary key.

        Args:
            session: Active database session.
            monster_id: UUID of the monster.

        Returns:
            MonsterStatBlock if found, else None.
        """
        return session.get(MonsterStatBlock, monster_id)

    @staticmethod
    def list_all(
        session: Session,
        source: Optional[str] = None,
        is_custom: Optional[bool] = None,
    ) -> list[MonsterStatBlock]:
        """List monster stat blocks with optional filters.

        Args:
            session: Active database session.
            source: Filter by source ('SRD' or 'custom').
            is_custom: Filter to custom monsters only if True.

        Returns:
            Monsters ordered by name ascending.
        """
        stmt = select(MonsterStatBlock)
        if source is not None:
            stmt = stmt.where(MonsterStatBlock.source == source)
        if is_custom is not None:
            stmt = stmt.where(MonsterStatBlock.is_custom == is_custom)
        stmt = stmt.order_by(MonsterStatBlock.name.asc())
        return list(session.exec(stmt).all())

    @staticmethod
    def get_by_name(session: Session, name: str) -> Optional[MonsterStatBlock]:
        """Look up a monster by exact name (case-sensitive).

        Args:
            session: Active database session.
            name: Monster name to search.

        Returns:
            MonsterStatBlock if found, else None.
        """
        stmt = select(MonsterStatBlock).where(MonsterStatBlock.name == name).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def create(session: Session, data: MonsterStatBlockCreate) -> MonsterStatBlock:
        """Persist a new monster stat block.

        Args:
            session: Active database session.
            data: Validated monster creation payload.

        Returns:
            The newly created MonsterStatBlock.
        """
        monster = MonsterStatBlock.model_validate(data)
        session.add(monster)
        session.commit()
        session.refresh(monster)
        return monster

    @staticmethod
    def update(
        session: Session, monster: MonsterStatBlock, data: MonsterStatBlockUpdate
    ) -> MonsterStatBlock:
        """Apply a partial update to a monster stat block.

        Args:
            session: Active database session.
            monster: Existing MonsterStatBlock ORM object.
            data: Partial update payload.

        Returns:
            The updated MonsterStatBlock.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(monster, field, value)
        session.add(monster)
        session.commit()
        session.refresh(monster)
        return monster

    @staticmethod
    def delete(session: Session, monster: MonsterStatBlock) -> bool:
        """Delete a monster stat block record.

        Args:
            session: Active database session.
            monster: MonsterStatBlock ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(monster)
        session.commit()
        return True

    @staticmethod
    def count(session: Session) -> int:
        """Count total monster stat blocks (used to detect empty table for seeding).

        Args:
            session: Active database session.

        Returns:
            Total row count.
        """
        return len(session.exec(select(MonsterStatBlock)).all())

    @staticmethod
    def delete_all(session: Session) -> int:
        """Delete all monster stat blocks (used before a force-reseed).

        Args:
            session: Active database session.

        Returns:
            Number of rows deleted.
        """
        monsters = session.exec(select(MonsterStatBlock)).all()
        count = len(monsters)
        for m in monsters:
            session.delete(m)
        session.commit()
        return count
