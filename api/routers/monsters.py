"""Monster catalog router: browse, homebrew create/edit/delete (SEC-003, Plan 132)."""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from api.deps import DB, CurrentUser
from domain.monster import MonsterStatBlockCreate, MonsterStatBlockRead, MonsterStatBlockUpdate
from services import encounter_service

router = APIRouter(tags=["monsters"])


@router.post("/monsters", response_model=MonsterStatBlockRead, status_code=status.HTTP_201_CREATED)
def create_monster(body: MonsterStatBlockCreate, db: DB, user: CurrentUser) -> MonsterStatBlockRead:
    """Create a custom monster stat block (flagged is_custom).

    Args:
        body: Validated stat block payload.
        db: Database session.
        user: Authenticated DM email (stamped as creator).

    Returns:
        The created stat block.
    """
    return encounter_service.create_custom_monster(db, body, user)


@router.get("/monsters", response_model=list[MonsterStatBlockRead])
def list_monsters(
    db: DB,
    user: CurrentUser,
    search: Optional[str] = Query(None, description="Search by name (case-insensitive)"),
    cr: Optional[str] = Query(None, description="Filter by exact challenge rating"),
    creature_type: Optional[str] = Query(None, description="Filter by creature type"),
) -> list[MonsterStatBlockRead]:
    """List all SRD monster stat blocks with optional search and filters.

    Args:
        db: Database session.
        user: Authenticated DM (sees the SRD plus their own homebrew, SEC-003).
        search: Optional name substring search (case-insensitive).
        cr: Optional exact CR filter (e.g. '1/4', '5', '20').
        creature_type: Optional creature type filter.

    Returns:
        Filtered list of monster stat blocks ordered by name.
    """
    monsters = encounter_service.list_monsters(db, viewer=user)
    if search:
        q = search.lower()
        monsters = [m for m in monsters if q in m.name.lower()]
    if cr:
        monsters = [m for m in monsters if m.challenge_rating == cr]
    if creature_type:
        ct = creature_type.lower()
        monsters = [m for m in monsters if m.creature_type.value.lower() == ct]
    return monsters


@router.get("/monsters/{monster_id}", response_model=MonsterStatBlockRead)
def get_monster(
    monster_id: uuid.UUID,
    db: DB,
    _user: CurrentUser,
) -> MonsterStatBlockRead:
    """Fetch a single monster stat block by ID.

    Args:
        monster_id: UUID of the monster.
        db: Database session.
        _user: Authenticated DM email.

    Returns:
        MonsterStatBlockRead with full stat block data.

    Raises:
        HTTPException 404: If monster not found.
    """
    try:
        return encounter_service.get_monster(db, monster_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.patch("/monsters/{monster_id}", response_model=MonsterStatBlockRead)
def update_monster(
    monster_id: uuid.UUID,
    body: MonsterStatBlockUpdate,
    db: DB,
    user: CurrentUser,
) -> MonsterStatBlockRead:
    """Partially update a monster stat block (e.g. set image_url) the DM may edit.

    Args:
        monster_id: UUID of the monster to update.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM (must own the homebrew row, or be an admin).

    Returns:
        Updated MonsterStatBlockRead.

    Raises:
        HTTPException 404: If monster not found.
        HTTPException 403: If it is an SRD row or another DM's (SEC-003).
    """
    try:
        return encounter_service.update_monster(db, monster_id, body, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/monsters/{monster_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_monster(monster_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a homebrew monster the DM made (Plan 132), unless something still uses it.

    Args:
        monster_id: UUID of the monster.
        db: Database session.
        user: Authenticated DM (must own the homebrew row, or be an admin).

    Raises:
        HTTPException 404: If the monster does not exist.
        HTTPException 403: If it is an SRD row or another DM's (SEC-003).
        HTTPException 409: If an encounter or NPC still uses it; the detail names them.
    """
    try:
        encounter_service.delete_monster(db, monster_id, user)
    except encounter_service.MonsterInUseError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
