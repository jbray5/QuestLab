"""Inventory service — business logic for PC item ownership (Plan 00019).

Rules enforced here:
- A DM must own the PC's campaign to manage that PC's inventory.
- Attunement is capped at 3 per PC (RAW 5e); 4th attune raises
  ``AttunementLimitError``.
- ``add_item`` is idempotent on (character_id, item_id): if the PC already
  has the item, quantity is incremented instead of a duplicate row.
- ``set_quantity(0)`` deletes the row.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_item_repo import CharacterItemRepo
from db.repos.character_repo import CharacterRepo
from db.repos.item_repo import ItemRepo
from domain.character import (
    AttunementLimitError,
    CharacterItem,
    CharacterItemCreate,
    CharacterItemUpdate,
    PlayerCharacter,
)

ATTUNEMENT_CAP = 3
"""Max items a PC may be attuned to (D&D 5e 2024 RAW)."""


def _assert_pc_owner(db: Session, character_id: uuid.UUID, dm_email: str) -> PlayerCharacter:
    """Verify the DM owns the campaign that contains this PC.

    Args:
        db: Active database session.
        character_id: UUID of the player character.
        dm_email: Email of the requesting DM.

    Returns:
        The PlayerCharacter, after ownership is confirmed.

    Raises:
        ValueError: If the PC or campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    pc = CharacterRepo.get_by_id(db, character_id)
    if pc is None:
        raise ValueError(f"Player character {character_id} not found.")
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign for PC {character_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to manage this PC's inventory.")
    return pc


def _assert_row_owner(db: Session, character_item_id: uuid.UUID, dm_email: str) -> CharacterItem:
    """Fetch an inventory row + verify DM ownership in one call.

    Args:
        db: Active database session.
        character_item_id: UUID of the inventory row.
        dm_email: Email of the requesting DM.

    Returns:
        The CharacterItem row.

    Raises:
        ValueError: If the row does not exist.
        PermissionError: If the DM does not own the PC's campaign.
    """
    row = CharacterItemRepo.get_by_id(db, character_item_id)
    if row is None:
        raise ValueError(f"Inventory row {character_item_id} not found.")
    _assert_pc_owner(db, row.character_id, dm_email)
    return row


def list_for_character(db: Session, character_id: uuid.UUID, dm_email: str) -> list[CharacterItem]:
    """Return all inventory rows for a PC.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        Inventory rows ordered by acquired_at desc.

    Raises:
        ValueError: If the PC is not found.
        PermissionError: If the DM does not own the campaign.
    """
    _assert_pc_owner(db, character_id, dm_email)
    return CharacterItemRepo.list_for_character(db, character_id)


def add_item(
    db: Session,
    character_id: uuid.UUID,
    payload: CharacterItemCreate,
    dm_email: str,
) -> CharacterItem:
    """Add an item to a PC's inventory.

    Idempotent on (character_id, item_id): if a matching row exists, the
    existing row's quantity is incremented by ``payload.quantity``. Equipped
    and attuned flags from the payload are applied only when creating a new
    row (existing flags are preserved on a quantity merge).

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        payload: Validated creation payload.
        dm_email: Email of the requesting DM.

    Returns:
        The created or merged CharacterItem.

    Raises:
        ValueError: If the PC or item does not exist.
        PermissionError: If the DM does not own the campaign.
        AttunementLimitError: If the payload requests attunement and the PC
            is already at the cap.
    """
    _assert_pc_owner(db, character_id, dm_email)
    item = ItemRepo.get_by_id(db, payload.item_id)
    if item is None:
        raise ValueError(f"Item {payload.item_id} not found.")

    existing = CharacterItemRepo.find_by_pc_and_item(db, character_id, payload.item_id)
    if existing is not None:
        return CharacterItemRepo.update(
            db,
            existing,
            CharacterItemUpdate(quantity=existing.quantity + payload.quantity),
        )

    if payload.attuned:
        current = CharacterItemRepo.count_attuned_for_pc(db, character_id)
        if current >= ATTUNEMENT_CAP:
            raise AttunementLimitError(
                f"PC is already attuned to {ATTUNEMENT_CAP} items (RAW cap)."
            )

    return CharacterItemRepo.create(db, character_id, payload)


def add_handout(
    db: Session,
    character_id: uuid.UUID,
    item_id: uuid.UUID,
    dm_email: str,
) -> CharacterItem:
    """Add an item from the mid-session loot-handout flow (Plan 16).

    Thin wrapper over ``add_item`` with ``quantity=1`` and no equip/attune.
    Idempotent — repeated handouts increment quantity on the same row.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        item_id: UUID of the item.
        dm_email: Email of the requesting DM.

    Returns:
        The created or merged inventory row.
    """
    return add_item(
        db,
        character_id,
        CharacterItemCreate(item_id=item_id, quantity=1),
        dm_email,
    )


def set_quantity(
    db: Session, character_item_id: uuid.UUID, quantity: int, dm_email: str
) -> Optional[CharacterItem]:
    """Set the quantity of an inventory row. Quantity 0 deletes the row.

    Args:
        db: Active database session.
        character_item_id: UUID of the row.
        quantity: New quantity (>=0).
        dm_email: Email of the requesting DM.

    Returns:
        Updated row, or None if quantity was 0 and the row was deleted.

    Raises:
        ValueError: If the row does not exist or quantity < 0.
        PermissionError: If the DM does not own the campaign.
    """
    if quantity < 0:
        raise ValueError("Quantity cannot be negative.")
    row = _assert_row_owner(db, character_item_id, dm_email)
    if quantity == 0:
        CharacterItemRepo.delete(db, row)
        return None
    return CharacterItemRepo.update(db, row, CharacterItemUpdate(quantity=quantity))


def set_equipped(
    db: Session, character_item_id: uuid.UUID, equipped: bool, dm_email: str
) -> CharacterItem:
    """Toggle the equipped flag.

    Args:
        db: Active database session.
        character_item_id: UUID of the row.
        equipped: New equipped state.
        dm_email: Email of the requesting DM.

    Returns:
        Updated row.
    """
    row = _assert_row_owner(db, character_item_id, dm_email)
    return CharacterItemRepo.update(db, row, CharacterItemUpdate(equipped=equipped))


def set_attuned(
    db: Session, character_item_id: uuid.UUID, attuned: bool, dm_email: str
) -> CharacterItem:
    """Toggle the attuned flag. Enforces the 3-attuned cap.

    Args:
        db: Active database session.
        character_item_id: UUID of the row.
        attuned: New attuned state.
        dm_email: Email of the requesting DM.

    Returns:
        Updated row.

    Raises:
        AttunementLimitError: If attuning would exceed the 3-item cap.
    """
    row = _assert_row_owner(db, character_item_id, dm_email)
    if attuned and not row.attuned:
        current = CharacterItemRepo.count_attuned_for_pc(db, row.character_id)
        if current >= ATTUNEMENT_CAP:
            raise AttunementLimitError(
                f"PC is already attuned to {ATTUNEMENT_CAP} items (RAW cap)."
            )
    patch = CharacterItemUpdate(attuned=attuned)
    updated = CharacterItemRepo.update(db, row, patch)
    # attuned_at is not part of CharacterItemUpdate; mutate directly for the timestamp.
    updated.attuned_at = datetime.now(UTC) if attuned else None
    db.add(updated)
    db.commit()
    db.refresh(updated)
    return updated


def remove(db: Session, character_item_id: uuid.UUID, dm_email: str) -> bool:
    """Delete an inventory row.

    Args:
        db: Active database session.
        character_item_id: UUID of the row.
        dm_email: Email of the requesting DM.

    Returns:
        True.
    """
    row = _assert_row_owner(db, character_item_id, dm_email)
    return CharacterItemRepo.delete(db, row)
