"""NPC repository — DB access only, no business logic (Plan 00033)."""

import uuid
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

from domain.npc import Npc, NpcCreate, NpcUpdate


class NpcRepo:
    """CRUD operations for Npc records."""

    @staticmethod
    def get_by_id(session: Session, npc_id: uuid.UUID) -> Optional[Npc]:
        """Fetch a single NPC by primary key.

        Args:
            session: Active database session.
            npc_id: UUID of the NPC.

        Returns:
            Npc if found, else None.
        """
        return session.get(Npc, npc_id)

    @staticmethod
    def list_by_campaign(session: Session, campaign_id: uuid.UUID) -> list[Npc]:
        """List all NPCs in a campaign, ordered by name.

        Args:
            session: Active database session.
            campaign_id: UUID of the parent campaign.

        Returns:
            NPCs ordered by name ascending.
        """
        stmt = select(Npc).where(Npc.campaign_id == campaign_id).order_by(Npc.name.asc())
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, campaign_id: uuid.UUID, data: NpcCreate) -> Npc:
        """Persist a new NPC under the given campaign.

        Args:
            session: Active database session.
            campaign_id: UUID of the parent campaign.
            data: Validated creation payload.

        Returns:
            The newly created Npc row.
        """
        npc = Npc.model_validate({**data.model_dump(), "campaign_id": campaign_id})
        session.add(npc)
        session.commit()
        session.refresh(npc)
        return npc

    @staticmethod
    def update(session: Session, npc: Npc, data: NpcUpdate) -> Npc:
        """Apply a partial update to an existing NPC.

        Args:
            session: Active database session.
            npc: Existing Npc ORM object.
            data: Partial update payload.

        Returns:
            The updated Npc.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(npc, field, value)
        npc.updated_at = datetime.now(UTC)
        session.add(npc)
        session.commit()
        session.refresh(npc)
        return npc

    @staticmethod
    def delete(session: Session, npc: Npc) -> bool:
        """Delete an NPC record.

        Args:
            session: Active database session.
            npc: Npc ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(npc)
        session.commit()
        return True
