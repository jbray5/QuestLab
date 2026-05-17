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
            pc_levels=body.pc_levels,
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


# ── Plan 00031 — Dynamic encounter builder ────────────────────────────────────


@router.post("/adventures/{adventure_id}/encounters/preview-difficulty")
def preview_difficulty_endpoint(
    adventure_id: uuid.UUID, body: dict, db: DB, user: CurrentUser
) -> dict:
    """Compute the difficulty of a hypothetical monster roster (no save).

    Body: ``{"roster": [{"monster_id": "...", "count": <int>}, ...]}``.

    Returns the party thresholds, raw + adjusted XP, multiplier, and
    difficulty bucket. Used by the encounter builder's live meter.

    Args:
        adventure_id: UUID of the adventure.
        body: JSON payload with the proposed roster.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Difficulty preview dict (see encounter_service.preview_difficulty).
    """
    try:
        return encounter_service.preview_difficulty(db, adventure_id, body.get("roster", []), user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/adventures/{adventure_id}/encounters/suggest-monsters")
def suggest_monsters_endpoint(
    adventure_id: uuid.UUID, body: dict, db: DB, user: CurrentUser
) -> dict:
    """Ask Claude for monsters that fit the adventure's theme.

    Body: ``{"target_difficulty": "Moderate"}`` (defaults to Moderate).

    Returns ``{encounter_concept, suggestions: [{monster_id, monster_name,
    count, rationale, challenge_rating, xp}]}``.

    Args:
        adventure_id: UUID of the adventure to theme around.
        body: JSON with optional ``target_difficulty``.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Themed-suggestion dict.
    """
    try:
        return encounter_service.suggest_themed_monsters(
            db,
            adventure_id,
            user,
            target_difficulty=str(body.get("target_difficulty") or "Moderate"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
