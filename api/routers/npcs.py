"""NPCs router — campaign-scoped story NPC CRUD + AI generation (Plan 00033)."""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.npc import NpcCreate, NpcGenerate, NpcRead, NpcUpdate
from services import npc_service

router = APIRouter(tags=["npcs"])


@router.get("/campaigns/{campaign_id}/npcs", response_model=list[NpcRead])
def list_npcs(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[NpcRead]:
    """List every NPC in a campaign, ordered by name.

    Args:
        campaign_id: UUID of the parent campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of NpcRead projections.
    """
    try:
        return npc_service.list_for_campaign(db, campaign_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/campaigns/{campaign_id}/npcs",
    response_model=NpcRead,
    status_code=status.HTTP_201_CREATED,
)
def create_npc(campaign_id: uuid.UUID, body: NpcCreate, db: DB, user: CurrentUser) -> NpcRead:
    """Create a new NPC in a campaign.

    Args:
        campaign_id: UUID of the parent campaign.
        body: NPC creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The newly created NpcRead.
    """
    try:
        return npc_service.create_npc(db, campaign_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/campaigns/{campaign_id}/npcs/generate",
    response_model=NpcRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_npc(campaign_id: uuid.UUID, body: NpcGenerate, db: DB, user: CurrentUser) -> NpcRead:
    """Generate an NPC via Claude and persist it (or return as preview).

    Body: ``{"role": "innkeeper", "save": true}``.

    Args:
        campaign_id: UUID of the parent campaign.
        body: Validated generate payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The generated NpcRead (persisted if ``save=True``).
    """
    try:
        return npc_service.generate_npc_from_ai(
            db, campaign_id, user, role=body.role, save=body.save
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/npcs/{npc_id}", response_model=NpcRead)
def get_npc(npc_id: uuid.UUID, db: DB, user: CurrentUser) -> NpcRead:
    """Fetch a single NPC by ID.

    Args:
        npc_id: UUID of the NPC.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        NpcRead projection.
    """
    try:
        return npc_service.get_npc(db, npc_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/npcs/{npc_id}", response_model=NpcRead)
def update_npc(npc_id: uuid.UUID, body: NpcUpdate, db: DB, user: CurrentUser) -> NpcRead:
    """Partially update an NPC.

    Args:
        npc_id: UUID of the NPC.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The updated NpcRead.
    """
    try:
        return npc_service.update_npc(db, npc_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/npcs/{npc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_npc(npc_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete an NPC.

    Args:
        npc_id: UUID of the NPC.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        npc_service.delete_npc(db, npc_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
