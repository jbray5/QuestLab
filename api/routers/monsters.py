"""Public monster browser router — read-only browse + image update."""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from api.deps import DB, CurrentUser
from domain.monster import MonsterStatBlockRead, MonsterStatBlockUpdate
from services import encounter_service

router = APIRouter(tags=["monsters"])


@router.get("/monsters", response_model=list[MonsterStatBlockRead])
def list_monsters(
    db: DB,
    _user: CurrentUser,
    search: Optional[str] = Query(None, description="Search by name (case-insensitive)"),
    cr: Optional[str] = Query(None, description="Filter by exact challenge rating"),
    creature_type: Optional[str] = Query(None, description="Filter by creature type"),
) -> list[MonsterStatBlockRead]:
    """List all SRD monster stat blocks with optional search and filters.

    Args:
        db: Database session.
        _user: Authenticated DM email (required but not used for filtering).
        search: Optional name substring search (case-insensitive).
        cr: Optional exact CR filter (e.g. '1/4', '5', '20').
        creature_type: Optional creature type filter.

    Returns:
        Filtered list of monster stat blocks ordered by name.
    """
    monsters = encounter_service.list_monsters(db)
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
    _user: CurrentUser,
) -> MonsterStatBlockRead:
    """Partially update a monster stat block (e.g. set image_url).

    Args:
        monster_id: UUID of the monster to update.
        body: Partial update payload.
        db: Database session.
        _user: Authenticated DM email.

    Returns:
        Updated MonsterStatBlockRead.

    Raises:
        HTTPException 404: If monster not found.
    """
    try:
        return encounter_service.update_monster(db, monster_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
