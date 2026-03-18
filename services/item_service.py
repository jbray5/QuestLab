"""Item service — business logic for magic item browsing and AI lore generation."""

import uuid
from typing import Optional

from sqlmodel import Session

from db.repos.item_repo import ItemRepo
from domain.enums import ItemRarity
from domain.item import Item, ItemCreate, ItemRead
from integrations.dnd_rules.magic_items import PHB_MAGIC_ITEMS


def list_items(
    db: Session,
    q: Optional[str] = None,
    rarity: Optional[str] = None,
    item_type: Optional[str] = None,
) -> list[ItemRead]:
    """Return all magic items with optional search / filter.

    Args:
        db: Active database session.
        q: Optional name substring search (case-insensitive).
        rarity: Optional exact rarity filter (e.g. 'Rare', 'VeryRare').
        item_type: Optional item_type filter (e.g. 'Weapon', 'Potion').

    Returns:
        Filtered list of ItemRead objects ordered by name.
    """
    items = ItemRepo.list_all(db, is_magic=True)
    if q:
        lower = q.lower()
        items = [i for i in items if lower in i.name.lower()]
    if rarity:
        items = [i for i in items if i.rarity.value == rarity]
    if item_type:
        lower_type = item_type.lower()
        items = [i for i in items if i.item_type.lower() == lower_type]
    return [ItemRead.model_validate(i) for i in items]


def get_item(db: Session, item_id: uuid.UUID) -> Item:
    """Fetch a single item by ID or raise ValueError.

    Args:
        db: Active database session.
        item_id: UUID of the item.

    Returns:
        The matching Item ORM object.

    Raises:
        ValueError: If no item with the given ID exists.
    """
    item = ItemRepo.get_by_id(db, item_id)
    if item is None:
        raise ValueError(f"Item {item_id} not found.")
    return item


def seed_magic_items(db: Session) -> int:
    """Seed PHB magic items into the items table if it is empty.

    Idempotent — does nothing when items already exist.

    Args:
        db: Active database session.

    Returns:
        Number of items inserted (0 if already seeded).
    """
    existing = ItemRepo.list_all(db, is_magic=True)
    if existing:
        return 0

    inserted = 0
    for raw in PHB_MAGIC_ITEMS:
        try:
            rarity_val = raw.get("rarity", "Common")
            # Normalise "Very Rare" → "VeryRare" if seed data uses space
            rarity_val = rarity_val.replace(" ", "")
            rarity = ItemRarity(rarity_val)
        except ValueError:
            rarity = ItemRarity.COMMON

        data = ItemCreate(
            name=raw["name"],
            rarity=rarity,
            item_type=raw.get("item_type", "Wondrous Item"),
            description=raw.get("description"),
            attunement_required=raw.get("attunement_required", False),
            value_gp=raw.get("value_gp", 0),
            is_magic=True,
            properties=raw.get("properties"),
        )
        ItemRepo.create(db, data)
        inserted += 1
    return inserted
