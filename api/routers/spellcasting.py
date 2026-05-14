"""PC spell knowledge + slot tracking router (Plan 00020).

Routes scoped under ``/characters/{character_id}/spells`` and
``/characters/{character_id}/spell-slots``. Authz enforced in
``spellcasting_service`` (DM must own the PC's campaign).
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.character import (
    CharacterSpellCreate,
    CharacterSpellRead,
    CharacterSpellUpdate,
    NoSpellSlotError,
    SpellSlotStateRead,
)
from services import spellcasting_service

router = APIRouter(tags=["spellcasting"])


# ── Spell knowledge ─────────────────────────────────────────────────────────


@router.get(
    "/characters/{character_id}/spells",
    response_model=list[CharacterSpellRead],
)
def list_character_spells(
    character_id: uuid.UUID, db: DB, user: CurrentUser
) -> list[CharacterSpellRead]:
    """List a PC's known/prepared spell-list rows.

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Rows ordered by added_at desc.
    """
    try:
        rows = spellcasting_service.list_known_for_character(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return [CharacterSpellRead.model_validate(r) for r in rows]


@router.post(
    "/characters/{character_id}/spells",
    response_model=CharacterSpellRead,
    status_code=status.HTTP_201_CREATED,
)
def learn_character_spell(
    character_id: uuid.UUID,
    body: CharacterSpellCreate,
    db: DB,
    user: CurrentUser,
) -> CharacterSpellRead:
    """Add a spell to a PC's spell list (idempotent on spell_id).

    If the PC already knows the spell, the existing row's flags are unioned
    with the payload's (known OR known, prepared OR prepared).

    Args:
        character_id: UUID of the PC.
        body: Validated creation payload.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Created or merged row.
    """
    try:
        row = spellcasting_service.learn_spell(db, character_id, body, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return CharacterSpellRead.model_validate(row)


@router.patch(
    "/characters/{character_id}/spells/{character_spell_id}",
    response_model=CharacterSpellRead,
)
def update_character_spell(
    character_id: uuid.UUID,
    character_spell_id: uuid.UUID,
    body: CharacterSpellUpdate,
    db: DB,
    user: CurrentUser,
) -> CharacterSpellRead:
    """Patch the prepared (or known) flag on a PC's spell-list row.

    Args:
        character_id: UUID of the PC (URL grouping only).
        character_spell_id: UUID of the row.
        body: Partial update.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated row.
    """
    try:
        if body.prepared is not None:
            row = spellcasting_service.set_prepared(db, character_spell_id, body.prepared, user)
        else:
            # Only "prepared" is currently togglable via the service; fall back
            # to a fetch for completeness.
            from db.repos.character_spell_repo import CharacterSpellRepo

            row = CharacterSpellRepo.get_by_id(db, character_spell_id)
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Row not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return CharacterSpellRead.model_validate(row)


@router.delete(
    "/characters/{character_id}/spells/{character_spell_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def forget_character_spell(
    character_id: uuid.UUID,
    character_spell_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
) -> None:
    """Remove a spell from a PC's spell list.

    Args:
        character_id: UUID of the PC (URL grouping only).
        character_spell_id: UUID of the row.
        db: Database session.
        user: Authenticated DM.
    """
    try:
        spellcasting_service.forget_spell(db, character_spell_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── Spell slots ─────────────────────────────────────────────────────────────


@router.get("/characters/{character_id}/spell-slots", response_model=SpellSlotStateRead)
def get_spell_slots(character_id: uuid.UUID, db: DB, user: CurrentUser) -> SpellSlotStateRead:
    """Return current spell-slot state (max/used/remaining per level).

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Slot state across all levels the PC can cast at.
    """
    try:
        return spellcasting_service.slot_state(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/characters/{character_id}/spell-slots/{level}/expend",
    response_model=SpellSlotStateRead,
)
def expend_spell_slot(
    character_id: uuid.UUID, level: int, db: DB, user: CurrentUser
) -> SpellSlotStateRead:
    """Spend one slot of the given level.

    Args:
        character_id: UUID of the PC.
        level: Slot level (1..9).
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated slot state.

    Raises:
        HTTPException 422: If the level is invalid or no slot is available.
    """
    try:
        return spellcasting_service.expend_slot(db, character_id, level, user)
    except NoSpellSlotError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/characters/{character_id}/spell-slots/{level}/restore",
    response_model=SpellSlotStateRead,
)
def restore_spell_slot(
    character_id: uuid.UUID, level: int, db: DB, user: CurrentUser
) -> SpellSlotStateRead:
    """Restore one slot of the given level (undo button).

    Args:
        character_id: UUID of the PC.
        level: Slot level (1..9).
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated slot state.
    """
    try:
        return spellcasting_service.restore_slot(db, character_id, level, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/characters/{character_id}/spell-slots/long-rest",
    response_model=SpellSlotStateRead,
)
def long_rest(character_id: uuid.UUID, db: DB, user: CurrentUser) -> SpellSlotStateRead:
    """Long-rest recovery: zeroes out all used slots.

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated slot state (remaining = max for every level).
    """
    try:
        return spellcasting_service.long_rest_recover(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
