"""Campaigns router — CRUD for Campaign resources."""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.campaign import Campaign, CampaignCreate, CampaignUpdate
from services import campaign_service

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("", response_model=list[Campaign])
def list_campaigns(db: DB, user: CurrentUser) -> list[Campaign]:
    """List all campaigns owned by the authenticated DM.

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of Campaign objects.
    """
    return campaign_service.list_campaigns(db, user)


@router.post("", response_model=Campaign, status_code=status.HTTP_201_CREATED)
def create_campaign(body: CampaignCreate, db: DB, user: CurrentUser) -> Campaign:
    """Create a new campaign.

    Args:
        body: Campaign creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Newly created Campaign.
    """
    try:
        return campaign_service.create_campaign(
            db,
            name=body.name,
            setting=body.setting,
            tone=body.tone,
            dm_email=user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get("/{campaign_id}", response_model=Campaign)
def get_campaign(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> Campaign:
    """Fetch a single campaign by ID.

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Campaign object.
    """
    try:
        return campaign_service.get_campaign(db, campaign_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/{campaign_id}", response_model=Campaign)
def update_campaign(
    campaign_id: uuid.UUID, body: CampaignUpdate, db: DB, user: CurrentUser
) -> Campaign:
    """Partially update a campaign.

    Args:
        campaign_id: UUID of the campaign.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated Campaign object.
    """
    try:
        return campaign_service.update_campaign(db, campaign_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a campaign and all its children.

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        campaign_service.delete_campaign(db, campaign_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
