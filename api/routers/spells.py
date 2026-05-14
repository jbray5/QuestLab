"""Spells router — SRD 5.5e spell catalog (Plan 00017).

Reads are open to any authenticated DM. Writes (create/update/delete) are
intended for homebrew authoring — any authenticated DM may write to the
shared catalog. If multi-DM separation is needed later, add an
``author_email`` column and scope by it.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from api.deps import DB, CurrentUser
from domain.spell import SpellCreate, SpellRead, SpellUpdate
from services import spell_service

router = APIRouter(tags=["spells"])


@router.get("/spells", response_model=list[SpellRead])
def list_spells(
    db: DB,
    _user: CurrentUser,
    q: Optional[str] = Query(None, description="Case-insensitive name substring"),
    level: Optional[int] = Query(None, ge=0, le=9, description="Exact spell level"),
    school: Optional[str] = Query(None, description="School (e.g. Evocation)"),
    class_name: Optional[str] = Query(
        None,
        alias="class",
        description="Class scope (e.g. Wizard)",
    ),
    is_ritual: Optional[bool] = Query(None, description="Ritual filter"),
    is_concentration: Optional[bool] = Query(None, description="Concentration filter"),
) -> list[SpellRead]:
    """Browse the spell catalog with optional filters.

    Args:
        db: Database session.
        _user: Authenticated DM (any authenticated user may read).
        q: Optional name substring search.
        level: Optional level (0 = cantrip).
        school: Optional school name.
        class_name: Optional class scope. Query param is ``class`` (aliased).
        is_ritual: Optional ritual flag.
        is_concentration: Optional concentration flag.

    Returns:
        Filtered spell list.
    """
    return spell_service.list_spells(
        db,
        q=q,
        level=level,
        school=school,
        class_name=class_name,
        is_ritual=is_ritual,
        is_concentration=is_concentration,
    )


@router.get("/spells/{spell_id}", response_model=SpellRead)
def get_spell(spell_id: uuid.UUID, db: DB, _user: CurrentUser) -> SpellRead:
    """Fetch a single spell by ID.

    Args:
        spell_id: UUID of the spell.
        db: Database session.
        _user: Authenticated DM.

    Returns:
        SpellRead with full data.

    Raises:
        HTTPException 404: If the spell does not exist.
    """
    try:
        spell = spell_service.get_spell(db, spell_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return SpellRead.model_validate(spell)


@router.post("/spells", response_model=SpellRead, status_code=status.HTTP_201_CREATED)
def create_spell(body: SpellCreate, db: DB, _user: CurrentUser) -> SpellRead:
    """Create a homebrew spell. Any authenticated DM may author.

    Args:
        body: Validated spell creation payload.
        db: Database session.
        _user: Authenticated DM.

    Returns:
        Newly created SpellRead.
    """
    spell = spell_service.create_spell(db, body)
    return SpellRead.model_validate(spell)


@router.patch("/spells/{spell_id}", response_model=SpellRead)
def update_spell(spell_id: uuid.UUID, body: SpellUpdate, db: DB, _user: CurrentUser) -> SpellRead:
    """Partially update a spell.

    Args:
        spell_id: UUID of the spell to update.
        body: Partial update payload.
        db: Database session.
        _user: Authenticated DM.

    Returns:
        Updated SpellRead.

    Raises:
        HTTPException 404: If the spell does not exist.
    """
    try:
        spell = spell_service.update_spell(db, spell_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return SpellRead.model_validate(spell)


@router.delete("/spells/{spell_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_spell(spell_id: uuid.UUID, db: DB, _user: CurrentUser) -> None:
    """Delete a spell.

    Args:
        spell_id: UUID of the spell.
        db: Database session.
        _user: Authenticated DM.

    Raises:
        HTTPException 404: If the spell does not exist.
    """
    try:
        spell_service.delete_spell(db, spell_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
