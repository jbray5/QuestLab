"""Encounters router — encounter CRUD and XP budget, scoped to an adventure."""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.encounter import Encounter, EncounterCreate, EncounterUpdate
from services import encounter_service

router = APIRouter(tags=["encounters"])


@router.get("/adventures/{adventure_id}/encounters", response_model=list[Encounter])
def list_encounters(adventure_id: uuid.UUID, db: DB, user: CurrentUser) -> list[Encounter]:
    """List all encounters in an adventure.

    Args:
        adventure_id: UUID of the parent adventure.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of Encounter objects.
    """
    try:
        return encounter_service.list_encounters(db, adventure_id, user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/adventures/{adventure_id}/encounters",
    response_model=Encounter,
    status_code=status.HTTP_201_CREATED,
)
def create_encounter(
    adventure_id: uuid.UUID, body: EncounterCreate, db: DB, user: CurrentUser
) -> Encounter:
    """Create a new encounter within an adventure.

    Args:
        adventure_id: UUID of the parent adventure.
        body: Encounter creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Newly created Encounter.
    """
    try:
        return encounter_service.create_encounter(
            db,
            adventure_id=adventure_id,
            name=body.name,
            dm_email=user,
            description=body.description,
            monster_roster=body.monster_roster or [],
            terrain_notes=body.terrain_notes,
            read_aloud_text=body.read_aloud_text,
            dm_notes=body.dm_notes,
            reward_xp=body.reward_xp,
            loot_table_id=body.loot_table_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/encounters/{encounter_id}", response_model=Encounter)
def get_encounter(encounter_id: uuid.UUID, db: DB, user: CurrentUser) -> Encounter:
    """Fetch a single encounter by ID.

    Args:
        encounter_id: UUID of the encounter.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Encounter object.
    """
    try:
        return encounter_service.get_encounter(db, encounter_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/encounters/{encounter_id}", response_model=Encounter)
def update_encounter(
    encounter_id: uuid.UUID, body: EncounterUpdate, db: DB, user: CurrentUser
) -> Encounter:
    """Partially update an encounter.

    Args:
        encounter_id: UUID of the encounter.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated Encounter object.
    """
    try:
        return encounter_service.update_encounter(db, encounter_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/encounters/{encounter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_encounter(encounter_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete an encounter.

    Args:
        encounter_id: UUID of the encounter.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        encounter_service.delete_encounter(db, encounter_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
