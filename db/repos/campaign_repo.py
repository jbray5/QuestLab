"""Campaign repository — DB access only, no business logic."""

import uuid
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

from domain.campaign import Campaign, CampaignCreate, CampaignUpdate


class CampaignRepo:
    """CRUD operations for Campaign records."""

    @staticmethod
    def get_by_id(session: Session, campaign_id: uuid.UUID) -> Optional[Campaign]:
        """Fetch a single campaign by primary key.

        Args:
            session: Active database session.
            campaign_id: UUID of the campaign.

        Returns:
            Campaign if found, else None.
        """
        return session.get(Campaign, campaign_id)

    @staticmethod
    def list_by_dm(session: Session, dm_email: str) -> list[Campaign]:
        """List all campaigns owned by a DM.

        Args:
            session: Active database session.
            dm_email: Normalised email of the DM.

        Returns:
            List of campaigns, ordered by created_at descending.
        """
        stmt = (
            select(Campaign)
            .where(Campaign.dm_email == dm_email.strip().lower())
            .order_by(Campaign.created_at.desc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def list_all(session: Session) -> list[Campaign]:
        """List all campaigns (admin use only).

        Args:
            session: Active database session.

        Returns:
            List of all campaigns.
        """
        return list(session.exec(select(Campaign)).all())

    @staticmethod
    def create(session: Session, data: CampaignCreate) -> Campaign:
        """Persist a new campaign.

        Args:
            session: Active database session.
            data: Validated campaign creation payload.

        Returns:
            The newly created Campaign.
        """
        campaign = Campaign.model_validate(data)
        session.add(campaign)
        session.commit()
        session.refresh(campaign)
        return campaign

    @staticmethod
    def update(session: Session, campaign: Campaign, data: CampaignUpdate) -> Campaign:
        """Apply a partial update to an existing campaign.

        Args:
            session: Active database session.
            campaign: Existing Campaign ORM object.
            data: Partial update payload (only set fields applied).

        Returns:
            The updated Campaign.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(campaign, field, value)
        campaign.updated_at = datetime.now(UTC)
        session.add(campaign)
        session.commit()
        session.refresh(campaign)
        return campaign

    @staticmethod
    def delete(session: Session, campaign: Campaign) -> bool:
        """Delete a campaign record.

        Args:
            session: Active database session.
            campaign: Campaign ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(campaign)
        session.commit()
        return True
