"""Adventures router — CRUD for Adventure resources, scoped to a campaign."""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.adventure import Adventure, AdventureCreate, AdventureUpdate
from services import adventure_service

router = APIRouter(tags=["adventures"])


@router.get("/campaigns/{campaign_id}/adventures", response_model=list[Adventure])
def list_adventures(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[Adventure]:
    """List all adventures in a campaign.

    Args:
        campaign_id: UUID of the parent campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of Adventure objects.
    """
    try:
        return adventure_service.list_adventures(db, campaign_id, user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/campaigns/{campaign_id}/adventures",
    response_model=Adventure,
    status_code=status.HTTP_201_CREATED,
)
def create_adventure(
    campaign_id: uuid.UUID, body: AdventureCreate, db: DB, user: CurrentUser
) -> Adventure:
    """Create a new adventure within a campaign.

    Args:
        campaign_id: UUID of the parent campaign.
        body: Adventure creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Newly created Adventure.
    """
    try:
        return adventure_service.create_adventure(
            db,
            campaign_id=campaign_id,
            title=body.title,
            tier=body.tier,
            dm_email=user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/adventures/{adventure_id}", response_model=Adventure)
def get_adventure(adventure_id: uuid.UUID, db: DB, user: CurrentUser) -> Adventure:
    """Fetch a single adventure by ID.

    Args:
        adventure_id: UUID of the adventure.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Adventure object.
    """
    try:
        return adventure_service.get_adventure(db, adventure_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/adventures/{adventure_id}", response_model=Adventure)
def update_adventure(
    adventure_id: uuid.UUID, body: AdventureUpdate, db: DB, user: CurrentUser
) -> Adventure:
    """Partially update an adventure.

    Args:
        adventure_id: UUID of the adventure.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated Adventure object.
    """
    try:
        return adventure_service.update_adventure(db, adventure_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/adventures/{adventure_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_adventure(adventure_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete an adventure.

    Args:
        adventure_id: UUID of the adventure.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        adventure_service.delete_adventure(db, adventure_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
