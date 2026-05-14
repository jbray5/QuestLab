"""Spellcasting service — PC spell knowledge + slot tracking (Plan 00020).

Wraps the existing ``character_service.compute_spell_slots`` for the "max"
side and a JSON column on ``player_characters`` for the "used" side.

Warlock special case: their compute_spell_slots return shape is
``{"pact": N, "level": L}`` — N slots of level L, all the same level.
For slot-state output we surface a single entry at level L with max=N.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.character_spell_repo import CharacterSpellRepo
from db.repos.spell_repo import SpellRepo
from domain.character import (
    CharacterSpell,
    CharacterSpellCreate,
    CharacterSpellUpdate,
    NoSpellSlotError,
    PlayerCharacter,
    SpellSlotLevelState,
    SpellSlotStateRead,
)
from domain.enums import CharacterClass
from services import character_service


def _assert_pc_owner(db: Session, character_id: uuid.UUID, dm_email: str) -> PlayerCharacter:
    """Verify DM ownership of the PC's campaign, return the PC.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        The PlayerCharacter ORM object.

    Raises:
        ValueError: If the PC or campaign is missing.
        PermissionError: If the DM does not own the campaign.
    """
    pc = CharacterRepo.get_by_id(db, character_id)
    if pc is None:
        raise ValueError(f"Player character {character_id} not found.")
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign for PC {character_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to manage this PC's spells.")
    return pc


def _assert_row_owner(db: Session, character_spell_id: uuid.UUID, dm_email: str) -> CharacterSpell:
    """Fetch a character_spells row and verify ownership.

    Args:
        db: Active database session.
        character_spell_id: UUID of the row.
        dm_email: Email of the requesting DM.

    Returns:
        The CharacterSpell row.
    """
    row = CharacterSpellRepo.get_by_id(db, character_spell_id)
    if row is None:
        raise ValueError(f"Character-spell row {character_spell_id} not found.")
    _assert_pc_owner(db, row.character_id, dm_email)
    return row


# ── Spell knowledge ─────────────────────────────────────────────────────────


def list_known_for_character(
    db: Session, character_id: uuid.UUID, dm_email: str
) -> list[CharacterSpell]:
    """Return all spell-list rows for a PC.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        Rows ordered by added_at desc.
    """
    _assert_pc_owner(db, character_id, dm_email)
    return CharacterSpellRepo.list_for_character(db, character_id)


def learn_spell(
    db: Session,
    character_id: uuid.UUID,
    payload: CharacterSpellCreate,
    dm_email: str,
) -> CharacterSpell:
    """Add a spell to a PC's spell list. Idempotent on (PC, spell).

    If the PC already knows this spell, the existing row's flags are
    updated to the union (known OR new, prepared OR new). Useful when
    a Wizard re-learns a spell as "prepared" later.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        payload: Validated creation payload.
        dm_email: Email of the requesting DM.

    Returns:
        The created or updated row.

    Raises:
        ValueError: If the PC or spell is not found.
        PermissionError: If the DM does not own the campaign.
    """
    _assert_pc_owner(db, character_id, dm_email)
    spell = SpellRepo.get_by_id(db, payload.spell_id)
    if spell is None:
        raise ValueError(f"Spell {payload.spell_id} not found.")
    existing = CharacterSpellRepo.find_by_pc_and_spell(db, character_id, payload.spell_id)
    if existing is not None:
        return CharacterSpellRepo.update(
            db,
            existing,
            CharacterSpellUpdate(
                known=existing.known or payload.known,
                prepared=existing.prepared or payload.prepared,
            ),
        )
    return CharacterSpellRepo.create(db, character_id, payload)


def set_prepared(
    db: Session, character_spell_id: uuid.UUID, prepared: bool, dm_email: str
) -> CharacterSpell:
    """Toggle the prepared flag.

    Args:
        db: Active database session.
        character_spell_id: UUID of the row.
        prepared: New prepared state.
        dm_email: Email of the requesting DM.

    Returns:
        Updated row.
    """
    row = _assert_row_owner(db, character_spell_id, dm_email)
    return CharacterSpellRepo.update(db, row, CharacterSpellUpdate(prepared=prepared))


def forget_spell(db: Session, character_spell_id: uuid.UUID, dm_email: str) -> bool:
    """Remove a spell from a PC's spell list.

    Args:
        db: Active database session.
        character_spell_id: UUID of the row.
        dm_email: Email of the requesting DM.

    Returns:
        True if deleted.
    """
    row = _assert_row_owner(db, character_spell_id, dm_email)
    return CharacterSpellRepo.delete(db, row)


# ── Slot tracking ──────────────────────────────────────────────────────────


def _max_slots_for_pc(pc: PlayerCharacter) -> dict[str, int]:
    """Return the max-slots dict for a PC, normalizing Warlock to per-level form.

    Args:
        pc: The PlayerCharacter.

    Returns:
        Dict keyed by slot-level-as-string ("1".."9") → max slot count. Empty
        dict for non-casters. Cantrips (level 0) excluded.
    """
    raw = character_service.compute_spell_slots(pc.character_class, pc.level)
    if pc.character_class == CharacterClass.WARLOCK:
        # {"pact": N, "level": L} → {str(L): N}
        if "level" in raw and "pact" in raw:
            return {str(int(raw["level"])): int(raw["pact"])}
        return {}
    return {str(k): int(v) for k, v in raw.items()}


def slot_state(db: Session, character_id: uuid.UUID, dm_email: str) -> SpellSlotStateRead:
    """Return the PC's current slot state per level (max / used / remaining).

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        SpellSlotStateRead with one entry per slot level the PC can cast at.
    """
    pc = _assert_pc_owner(db, character_id, dm_email)
    max_slots = _max_slots_for_pc(pc)
    used = pc.spell_slots_used or {}
    levels: dict[str, SpellSlotLevelState] = {}
    for level_str, max_count in max_slots.items():
        u = int(used.get(level_str, 0))
        # Clamp 'used' if the PC leveled DOWN somehow (defensive).
        u = max(0, min(u, max_count))
        levels[level_str] = SpellSlotLevelState(
            max=max_count, used=u, remaining=max(0, max_count - u)
        )
    return SpellSlotStateRead(character_id=character_id, levels=levels)


def expend_slot(
    db: Session, character_id: uuid.UUID, level: int, dm_email: str
) -> SpellSlotStateRead:
    """Spend one slot of the given level.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        level: Slot level to expend (1..9).
        dm_email: Email of the requesting DM.

    Returns:
        Updated slot state.

    Raises:
        ValueError: If level is out of range.
        NoSpellSlotError: If the PC has no remaining slots of that level.
        PermissionError: If the DM does not own the campaign.
    """
    if level < 1 or level > 9:
        raise ValueError("Slot level must be between 1 and 9.")
    pc = _assert_pc_owner(db, character_id, dm_email)
    max_slots = _max_slots_for_pc(pc)
    key = str(level)
    if max_slots.get(key, 0) <= 0:
        raise NoSpellSlotError(f"{pc.character_name} has no level {level} slots at all.")
    used = dict(pc.spell_slots_used or {})
    current = int(used.get(key, 0))
    if current >= max_slots[key]:
        raise NoSpellSlotError(f"{pc.character_name} has no level {level} slots remaining.")
    used[key] = current + 1
    pc.spell_slots_used = used
    db.add(pc)
    db.commit()
    db.refresh(pc)
    return slot_state(db, character_id, dm_email)


def restore_slot(
    db: Session, character_id: uuid.UUID, level: int, dm_email: str
) -> SpellSlotStateRead:
    """Restore one slot of the given level (undo button).

    No-op if used count for that level is already 0.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        level: Slot level to restore (1..9).
        dm_email: Email of the requesting DM.

    Returns:
        Updated slot state.

    Raises:
        ValueError: If level is out of range.
        PermissionError: If the DM does not own the campaign.
    """
    if level < 1 or level > 9:
        raise ValueError("Slot level must be between 1 and 9.")
    pc = _assert_pc_owner(db, character_id, dm_email)
    used = dict(pc.spell_slots_used or {})
    key = str(level)
    current = int(used.get(key, 0))
    if current > 0:
        used[key] = current - 1
        pc.spell_slots_used = used
        db.add(pc)
        db.commit()
        db.refresh(pc)
    return slot_state(db, character_id, dm_email)


def long_rest_recover(db: Session, character_id: uuid.UUID, dm_email: str) -> SpellSlotStateRead:
    """Zero out used-slots (full recovery per RAW long rest).

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        Updated slot state (all remaining = max).
    """
    pc = _assert_pc_owner(db, character_id, dm_email)
    pc.spell_slots_used = {}
    db.add(pc)
    db.commit()
    db.refresh(pc)
    return slot_state(db, character_id, dm_email)


# Re-export for convenience.
__all__ = [
    "NoSpellSlotError",
    "list_known_for_character",
    "learn_spell",
    "set_prepared",
    "forget_spell",
    "slot_state",
    "expend_slot",
    "restore_slot",
    "long_rest_recover",
]


# Provided so callers needing the bare slot-key set can compute it without
# importing character_service. Kept here for forward-compat with Plan 21.
def max_slots(pc: PlayerCharacter) -> dict[str, int]:  # noqa: D401 - thin wrapper
    """Return the max-slots dict for a PC (Warlock normalized)."""
    return _max_slots_for_pc(pc)
