"""Spells router — SRD spell catalogs, 2024 and 2014 (Plans 00017, 131), and DM homebrew.

Reads are open to any authenticated DM; lists show the shared catalog plus the caller's own
homebrew. SEC-003: create stamps the caller as the author; update and delete need the author
or an admin. Plan 132: a clashing homebrew name, or deleting a spell characters still know,
is a 409 with a plain message.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from api.deps import DB, CurrentUser
from domain.enums import Ruleset
from domain.spell import SpellConflictError, SpellCreate, SpellRead, SpellUpdate
from services import spell_service

router = APIRouter(tags=["spells"])


@router.get("/spells", response_model=list[SpellRead])
def list_spells(
    db: DB,
    user: CurrentUser,
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
    ruleset: Optional[Ruleset] = Query(
        None,
        description="Edition: 2024 or 2014 (homebrew shows in both); omit for every spell",
    ),
) -> list[SpellRead]:
    """Browse the spell catalog with optional filters.

    Args:
        db: Database session.
        user: Authenticated DM (sees shared spells plus their own homebrew).
        q: Optional name substring search.
        level: Optional level (0 = cantrip).
        school: Optional school name.
        class_name: Optional class scope. Query param is ``class`` (aliased).
        is_ritual: Optional ritual flag.
        is_concentration: Optional concentration flag.
        ruleset: Plan 131 — keep one edition's spells plus homebrew. FastAPI answers 422
            for anything but "2024"/"2014".

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
        viewer=user,
        ruleset=ruleset,
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
def create_spell(body: SpellCreate, db: DB, user: CurrentUser) -> SpellRead:
    """Create a homebrew spell, stamped as the DM's own (SEC-003), with no ruleset (Plan 131).

    Args:
        body: Validated spell creation payload.
        db: Database session.
        user: Authenticated DM (recorded as the author).

    Returns:
        Newly created SpellRead.

    Raises:
        HTTPException 409: If the DM can already see a spell with that name (Plan 132).
    """
    try:
        spell = spell_service.create_spell(db, body, dm_email=user)
    except SpellConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return SpellRead.model_validate(spell)


@router.patch("/spells/{spell_id}", response_model=SpellRead)
def update_spell(spell_id: uuid.UUID, body: SpellUpdate, db: DB, user: CurrentUser) -> SpellRead:
    """Partially update a spell the DM may edit.

    Args:
        spell_id: UUID of the spell to update.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM (must own the homebrew row, or be an admin).

    Returns:
        Updated SpellRead.

    Raises:
        HTTPException 404: If the spell does not exist.
        HTTPException 403: If the spell is shared or another DM's (SEC-003).
        HTTPException 409: If the new name clashes with one the DM can see (Plan 132).
    """
    try:
        spell = spell_service.update_spell(db, spell_id, body, user)
    except SpellConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return SpellRead.model_validate(spell)


@router.delete("/spells/{spell_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_spell(spell_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a spell the DM may edit.

    Args:
        spell_id: UUID of the spell.
        db: Database session.
        user: Authenticated DM (must own the homebrew row, or be an admin).

    Raises:
        HTTPException 404: If the spell does not exist.
        HTTPException 403: If the spell is shared or another DM's (SEC-003).
        HTTPException 409: If a character knows the spell; the message names who (Plan 132).
    """
    try:
        spell_service.delete_spell(db, spell_id, user)
    except SpellConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
