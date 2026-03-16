"""Campaign service — business logic and authorization for Campaign operations.

Rules enforced here:
- Only the owning DM can read, update, or delete their campaigns.
- A DM may own at most 20 campaigns (soft limit).
"""

import uuid
from typing import Optional

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from domain.campaign import Campaign, CampaignCreate, CampaignRead, CampaignUpdate

MAX_CAMPAIGNS_PER_DM = 20


def _assert_owner(campaign: Campaign, dm_email: str) -> None:
    """Raise PermissionError if dm_email is not the campaign owner.

    Args:
        campaign: The campaign to check ownership of.
        dm_email: Email of the requesting DM.

    Raises:
        PermissionError: If the DM does not own the campaign.
    """
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to access this campaign.")


def list_campaigns(session: Session, dm_email: str) -> list[CampaignRead]:
    """Return all campaigns owned by the DM.

    Args:
        session: Active database session.
        dm_email: Email of the requesting DM.

    Returns:
        List of CampaignRead schemas ordered by created_at descending.
    """
    campaigns = CampaignRepo.list_by_dm(session, dm_email)
    return [CampaignRead.model_validate(c) for c in campaigns]


def get_campaign(session: Session, campaign_id: uuid.UUID, dm_email: str) -> CampaignRead:
    """Fetch a campaign by ID, enforcing ownership.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        CampaignRead schema.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    _assert_owner(campaign, dm_email)
    return CampaignRead.model_validate(campaign)


def create_campaign(
    session: Session,
    name: str,
    setting: str,
    tone: str,
    dm_email: str,
    world_notes: Optional[str] = None,
) -> CampaignRead:
    """Create a new campaign for the requesting DM.

    Args:
        session: Active database session.
        name: Campaign name.
        setting: World or setting name.
        tone: Narrative tone description.
        dm_email: Email of the owning DM.
        world_notes: Optional free-form world-building notes.

    Returns:
        The newly created CampaignRead.

    Raises:
        ValueError: If the DM already has MAX_CAMPAIGNS_PER_DM campaigns.
    """
    existing = CampaignRepo.list_by_dm(session, dm_email)
    if len(existing) >= MAX_CAMPAIGNS_PER_DM:
        raise ValueError(
            f"Campaign limit reached ({MAX_CAMPAIGNS_PER_DM}). "
            "Archive an existing campaign before creating a new one."
        )
    data = CampaignCreate(
        name=name,
        setting=setting,
        tone=tone,
        dm_email=dm_email.strip().lower(),
        world_notes=world_notes,
    )
    campaign = CampaignRepo.create(session, data)
    return CampaignRead.model_validate(campaign)


def update_campaign(
    session: Session,
    campaign_id: uuid.UUID,
    dm_email: str,
    update: CampaignUpdate,
) -> CampaignRead:
    """Apply a partial update to a campaign, enforcing ownership.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        update: Fields to change.

    Returns:
        The updated CampaignRead.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    _assert_owner(campaign, dm_email)
    updated = CampaignRepo.update(session, campaign, update)
    return CampaignRead.model_validate(updated)


def delete_campaign(session: Session, campaign_id: uuid.UUID, dm_email: str) -> None:
    """Delete a campaign, enforcing ownership.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    _assert_owner(campaign, dm_email)
    CampaignRepo.delete(session, campaign)
