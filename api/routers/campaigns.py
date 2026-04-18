"""Campaigns router — CRUD for Campaign resources."""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlmodel import func, select

from api.deps import DB, CurrentUser
from domain.adventure import Adventure
from domain.campaign import Campaign, CampaignCreate, CampaignUpdate
from domain.character import PlayerCharacter
from domain.encounter import Encounter
from domain.session import Session as GameSession
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
            description=body.description,
            world_notes=body.world_notes,
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


@router.get("/{campaign_id}/stats")
def campaign_stats(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> dict:
    """Return aggregate counts for a single campaign.

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Dict with adventure, session, character, and encounter counts.
    """
    try:
        campaign_service.get_campaign(db, campaign_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    adventures = db.exec(select(func.count()).where(Adventure.campaign_id == campaign_id)).one()
    characters = db.exec(
        select(func.count()).where(PlayerCharacter.campaign_id == campaign_id)
    ).one()
    # Sessions and encounters are scoped to adventures, so join through adventure_ids
    adventure_ids = db.exec(select(Adventure.id).where(Adventure.campaign_id == campaign_id)).all()
    if adventure_ids:
        sessions = db.exec(
            select(func.count()).where(GameSession.adventure_id.in_(adventure_ids))
        ).one()
        encounters = db.exec(
            select(func.count()).where(Encounter.adventure_id.in_(adventure_ids))
        ).one()
    else:
        sessions = 0
        encounters = 0

    return {
        "adventures": adventures,
        "sessions": sessions,
        "characters": characters,
        "encounters": encounters,
    }
