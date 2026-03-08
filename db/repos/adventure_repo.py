"""Adventure repository — DB access only, no business logic."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.adventure import Adventure, AdventureCreate, AdventureUpdate


class AdventureRepo:
    """CRUD operations for Adventure records."""

    @staticmethod
    def get_by_id(session: Session, adventure_id: uuid.UUID) -> Optional[Adventure]:
        """Fetch a single adventure by primary key.

        Args:
            session: Active database session.
            adventure_id: UUID of the adventure.

        Returns:
            Adventure if found, else None.
        """
        return session.get(Adventure, adventure_id)

    @staticmethod
    def list_by_campaign(session: Session, campaign_id: uuid.UUID) -> list[Adventure]:
        """List all adventures within a campaign.

        Args:
            session: Active database session.
            campaign_id: UUID of the parent campaign.

        Returns:
            Adventures ordered by created_at ascending.
        """
        stmt = (
            select(Adventure)
            .where(Adventure.campaign_id == campaign_id)
            .order_by(Adventure.created_at.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: AdventureCreate) -> Adventure:
        """Persist a new adventure.

        Args:
            session: Active database session.
            data: Validated adventure creation payload.

        Returns:
            The newly created Adventure.
        """
        adventure = Adventure.model_validate(data)
        session.add(adventure)
        session.commit()
        session.refresh(adventure)
        return adventure

    @staticmethod
    def update(session: Session, adventure: Adventure, data: AdventureUpdate) -> Adventure:
        """Apply a partial update to an existing adventure.

        Args:
            session: Active database session.
            adventure: Existing Adventure ORM object.
            data: Partial update payload.

        Returns:
            The updated Adventure.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(adventure, field, value)
        session.add(adventure)
        session.commit()
        session.refresh(adventure)
        return adventure

    @staticmethod
    def delete(session: Session, adventure: Adventure) -> bool:
        """Delete an adventure record.

        Args:
            session: Active database session.
            adventure: Adventure ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(adventure)
        session.commit()
        return True
