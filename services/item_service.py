"""Item service — business logic for magic item browsing."""

import uuid
from typing import Any, Literal, Optional

from sqlmodel import Session

from db.repos.item_repo import ItemRepo, LootTableRepo
from domain.enums import ItemRarity
from domain.item import Item, ItemConflictError, ItemCreate, ItemRead, ItemUpdate
from integrations.dnd_rules import rulesets
from integrations.dnd_rules import srd_weapons_2014 as srd14
from integrations.dnd_rules.magic_items import PHB_MAGIC_ITEMS
from services.auth_service import catalog_visible, require_catalog_editor

ItemKind = Literal["magic", "mundane", "all"]
"""Which part of the catalog a list shows: magic items (the default), the rest, or both."""


def is_weapon(item: Item) -> bool:
    """Return True iff the item has weapon stats populated.

    Args:
        item: An Item ORM object.

    Returns:
        True if both ``weapon_category`` and ``damage_die`` are set.
    """
    return bool(item.weapon_category and item.damage_die)


def _type_matches(item_type: str, wanted: str) -> bool:
    """True when ``item_type`` is ``wanted`` or a kind of it ("Weapon (longsword)" is a Weapon).

    Args:
        item_type: The item's catalog type.
        wanted: The type filter, any case.

    Returns:
        Whether the item passes the filter.
    """
    have = (item_type or "").strip().lower()
    want = wanted.strip().lower()
    return have == want or have.startswith(f"{want} (")


def list_items(
    db: Session,
    q: Optional[str] = None,
    rarity: Optional[str] = None,
    item_type: Optional[str] = None,
    viewer: Optional[str] = None,
    kind: ItemKind = "magic",
) -> list[ItemRead]:
    """Return catalog items (magic ones by default) with optional search / filter.

    Args:
        db: Active database session.
        q: Optional name substring search (case-insensitive).
        rarity: Optional exact rarity filter (e.g. 'Rare', 'VeryRare').
        item_type: Optional type filter (e.g. 'Weapon', 'Potion'); 'Weapon'
            also matches 'Weapon (longsword)'.
        viewer: The listing DM: shared items plus their own homebrew (SEC-003).
        kind: 'magic' (default), 'mundane' (weapons, armor and gear: where a
            DM's non-magic homebrew lives, Plan 132) or 'all'.

    Returns:
        Filtered list of ItemRead objects ordered by name.
    """
    is_magic = {"magic": True, "mundane": False}.get(kind)
    items = [
        i
        for i in ItemRepo.list_all(db, is_magic=is_magic)
        if catalog_visible(i.created_by_email, viewer)
    ]
    if q:
        lower = q.lower()
        items = [i for i in items if lower in i.name.lower()]
    if rarity:
        items = [i for i in items if i.rarity.value == rarity]
    if item_type:
        items = [i for i in items if _type_matches(i.item_type, item_type)]
    return [ItemRead.model_validate(i) for i in items]


def is_variant_magic_weapon(item: Item) -> bool:
    """True for a magic weapon without stats of its own: "+1 Weapon", "Weapon (any sword)".

    Plan 135: the SRD writes many magic weapons against a kind of weapon, so the row
    has no damage die until the startup backfill can name one ("any sword" becomes a
    longsword; "any" and ammunition never do).

    Args:
        item: An Item ORM object.

    Returns:
        Whether it's a magic item typed "Weapon" or "Weapon (...)" that ``is_weapon``
        doesn't already count.
    """
    return bool(item.is_magic) and not is_weapon(item) and _type_matches(item.item_type, "Weapon")


def _base_weapon(item: Item) -> Optional[str]:
    """The lowercased SRD weapon a shared row's stats come from ("trident"), if any.

    Args:
        item: A weapon row.

    Returns:
        The row's own name for a mundane weapon; the base weapon of a magic one
        ("Weapon (trident)" gives "trident", "any sword" gives "longsword"); None when
        the type names no single weapon.
    """
    if not item.is_magic:
        return item.name.strip().lower()
    return _parse_weapon_template(item.item_type or "")


def _as_2014(item: Item) -> Optional[ItemRead]:
    """The row as the 2014 rules (SRD 5.1) have it, or None when 2014 has no such weapon.

    Mastery is a 2024 rule, so it is always cleared. A shared row built on a 2024-only
    weapon (Musket, Pistol) is left out, and one built on a weapon whose 2014 stats
    differ (Lance, Trident, War Pick) shows those. A DM's homebrew keeps its own stats.

    Args:
        item: A weapon row the viewer may see.

    Returns:
        A read copy for the 2014 list (the stored row never changes), or None.
    """
    read = ItemRead.model_validate(item)
    update: dict[str, Any] = {"mastery": None}
    base = None if item.created_by_email else _base_weapon(item)
    if base in srd14.NOT_IN_2014:
        return None
    change = dict(srd14.CHANGES_2014.get(base or "", {})) if is_weapon(item) else {}
    special = change.pop("special", None)
    update.update(change)
    if special:
        update["description"] = f"{item.description}\n\n{special}" if item.description else special
    return read.model_copy(update=update)


def list_weapons(
    db: Session,
    q: Optional[str] = None,
    category: Optional[str] = None,
    mastery: Optional[str] = None,
    property_name: Optional[str] = None,
    is_magic: Optional[bool] = None,
    viewer: Optional[str] = None,
    ruleset: Optional[Any] = None,
) -> list[ItemRead]:
    """Return all weapon items with optional filters.

    A weapon is an item with ``weapon_category`` and ``damage_die`` populated. With a
    ``ruleset`` (Plan 135, the Weapons page's switch) the list also holds the magic
    weapons that have no stats of their own ("Weapon (any sword)"); they carry no
    category, mastery or property, so those filters leave them out. Under "2014" every
    row loses its mastery (and the mastery filter is ignored), the 2024-only firearms
    are left out, and the few weapons whose SRD 5.1 stats differ show those.

    Args:
        db: Active database session.
        q: Optional case-insensitive name substring.
        category: Optional exact match on ``weapon_category`` (e.g. 'Simple Melee').
        mastery: Optional exact match on mastery property (e.g. 'Vex'); ignored for 2014.
        property_name: Optional property the weapon must have (e.g. 'Finesse').
        is_magic: Optional magic filter. None = both mundane and magic.
        viewer: The listing DM: shared weapons plus their own homebrew (SEC-003).
        ruleset: None (the list as it always was), "2024" or "2014" (Plan 135).

    Returns:
        Filtered list of ItemRead objects ordered by name.

    Raises:
        ValueError: For a ruleset other than "2024" or "2014".
    """
    edition = rulesets.normalize(ruleset) if ruleset is not None else None
    old_2014 = edition == rulesets.R2014

    def wanted(i: Item) -> bool:
        """A weapon row (or, with an edition, a stat-less magic weapon) the viewer may see."""
        kind_ok = is_weapon(i) or (edition is not None and is_variant_magic_weapon(i))
        return kind_ok and catalog_visible(i.created_by_email, viewer)

    items = [i for i in ItemRepo.list_all(db, is_magic=is_magic) if wanted(i)]
    if q:
        lower = q.lower()
        items = [i for i in items if lower in i.name.lower()]
    if category:
        items = [i for i in items if (i.weapon_category or "").lower() == category.lower()]
    if mastery and not old_2014:
        items = [i for i in items if (i.mastery or "").lower() == mastery.lower()]
    if old_2014:
        reads = [r for r in (_as_2014(i) for i in items) if r is not None]
    else:
        reads = [ItemRead.model_validate(i) for i in items]
    if property_name:  # after the 2014 view, which changes a few rows' properties
        target = property_name.lower()
        reads = [r for r in reads if any(p.lower() == target for p in (r.weapon_properties or []))]
    return reads


def seed_weapons(db: Session, payloads: list[ItemCreate]) -> int:
    """Seed mundane SRD weapons into the items table. Idempotent.

    Distinct from ``seed_magic_items`` — those are magical-only. Weapon seeding
    inserts only if the items table has no weapons yet.

    Args:
        db: Active database session.
        payloads: Validated ItemCreate payloads (each must have weapon fields set).

    Returns:
        Number of weapons inserted (0 if any already present).
    """
    existing = [i for i in ItemRepo.list_all(db) if is_weapon(i)]
    if existing:
        return 0
    inserted = 0
    for payload in payloads:
        ItemRepo.create(db, payload)
        inserted += 1
    return inserted


def seed_armor(db: Session, payloads: list[ItemCreate]) -> int:
    """Seed SRD armor and the shield into the items table, by name. Idempotent.

    Unlike weapons this is per-row: a catalog that already has "Shield" but not
    "Chain Mail" gets the missing rows only (Plan 83). Only shared rows count, so
    a DM's homebrew "Chain Mail" never stands in for the SRD one (Plan 132).

    Args:
        db: Active database session.
        payloads: Validated ItemCreate payloads.

    Returns:
        Number of rows inserted.
    """
    have = {i.name for i in ItemRepo.list_all(db) if not i.created_by_email}
    inserted = 0
    for payload in payloads:
        if payload.name in have:
            continue
        ItemRepo.create(db, payload)
        inserted += 1
    return inserted


def create_item(db: Session, payload: ItemCreate, dm_email: Optional[str] = None) -> Item:
    """Persist a new item.

    Used for ad-hoc homebrew or campaign-specific plot items (False
    Moonglass etc.). A DM's item is stamped with their email (SEC-003): it
    lists only for them and only they (or an admin) can change it. Seeders
    and internal callers pass no email, which makes a shared catalog row.
    Plan 132: a homebrew name must not be one its DM can already see.

    Args:
        db: Active database session.
        payload: Validated ItemCreate.
        dm_email: The authoring DM, or None for the shared catalog.

    Returns:
        Persisted Item.

    Raises:
        ItemConflictError: If a homebrew name is already taken.
    """
    if dm_email is not None:
        _require_free_name(db, payload.name, dm_email)
    return ItemRepo.create(db, payload, owner_email=dm_email)


def update_item(db: Session, item_id: uuid.UUID, payload: ItemUpdate, dm_email: str) -> Item:
    """Partially update an item the DM may edit (SEC-003).

    Args:
        db: Active database session.
        item_id: UUID of the item.
        payload: Partial update.
        dm_email: The requesting DM.

    Returns:
        The updated Item.

    Raises:
        ValueError: If the item does not exist.
        PermissionError: If it is shared (non-admin) or another DM's homebrew.
        ItemConflictError: If a homebrew item is renamed to a name its DM can already see.
    """
    item = get_item(db, item_id)
    require_catalog_editor(item.created_by_email, dm_email)
    renamed = payload.name is not None and payload.name.casefold() != item.name.casefold()
    if renamed and item.created_by_email:
        _require_free_name(db, payload.name, item.created_by_email, skip=item.id)
    return ItemRepo.update(db, item, payload)


def _require_free_name(
    db: Session, name: str, owner_email: str, skip: Optional[uuid.UUID] = None
) -> None:
    """Refuse a homebrew name already used by an item its owner can see (Plan 132).

    Starting kits, shops and the backfill look items up by name, so a homebrew
    "Longsword" must never stand beside (or in for) the SRD one. The shared rows and
    the owner's own homebrew count; other DMs' homebrew doesn't (they never see it).

    Args:
        db: Active database session.
        name: The proposed name.
        owner_email: The homebrew row's owner.
        skip: The row being renamed (it may keep its own name).

    Raises:
        ItemConflictError: If the name is taken.
    """
    for row in ItemRepo.list_named(db, name):
        if row.id != skip and catalog_visible(row.created_by_email, owner_email):
            mine = bool(row.created_by_email)
            where = "You already have a homebrew item" if mine else "The rules already have an item"
            raise ItemConflictError(
                f"{where} called {row.name}. Give this one its own name, so inventories, "
                "shops and starting gear can tell them apart."
            )


def _name_list(names: list[str], limit: int = 3) -> str:
    """Join names for a sentence: "A", "A and B", "A, B and C", "A, B, C and 2 more"."""
    if len(names) > limit:
        return f"{', '.join(names[:limit])} and {len(names) - limit} more"
    if len(names) <= 1:
        return "".join(names)
    return f"{', '.join(names[:-1])} and {names[-1]}"


def _places(rows: list[tuple[str, str]], dm_email: str, one: str, many: str) -> Optional[str]:
    """Phrase where-used rows: names from the DM's own campaigns, a count for anyone else's.

    Args:
        rows: ``(name, campaign DM email)`` pairs.
        dm_email: The requesting DM (only their own tables are named).
        one: Noun for a single row elsewhere ("character").
        many: Plural noun ("characters").

    Returns:
        A phrase like "Brannoc and Wren" or "Brannoc and 2 characters at other
        tables", or None when there are no rows.
    """
    if not rows:
        return None
    me = dm_email.strip().lower()
    mine = [name for name, dm in rows if (dm or "").strip().lower() == me]
    others = len(rows) - len(mine)
    parts = [_name_list(mine)] if mine else []
    if others:
        parts.append(f"{others} {one if others == 1 else many} at other tables")
    return " and ".join(parts)


def where_used(db: Session, item: Item, dm_email: str) -> list[str]:
    """Plain phrases for everywhere the item is still held: bags, shops, loot tables.

    Args:
        db: Active database session.
        item: The catalog item.
        dm_email: The requesting DM (other DMs' tables are counted, never named).

    Returns:
        Phrases like "carried by Brannoc" or "stocked in The Gilded Anvil"; empty
        when the item is unused.
    """
    out: list[str] = []
    holders = _places(ItemRepo.inventory_holders(db, item.id), dm_email, "character", "characters")
    if holders:
        out.append(f"carried by {holders}")
    shops = _places(ItemRepo.shops_stocking(db, item.id), dm_email, "shop", "shops")
    if shops:
        out.append(f"stocked in {shops}")
    loot = _places(
        LootTableRepo.tables_listing_item(db, item.id), dm_email, "loot table", "loot tables"
    )
    if loot:
        out.append(f"listed on {loot}")
    return out


def delete_item(db: Session, item_id: uuid.UUID, dm_email: str) -> None:
    """Delete a catalog item the DM may edit, unless something still holds it (Plan 132).

    Deleting never cascades: an item in a character's inventory, a shop or a
    loot table is refused with a plain sentence saying where, so nothing at
    the table silently disappears.

    Args:
        db: Active database session.
        item_id: UUID of the item.
        dm_email: The requesting DM.

    Raises:
        ValueError: If the item does not exist.
        PermissionError: If it is shared (non-admin) or another DM's homebrew.
        ItemConflictError: If any inventory, shop or loot table still holds it.
    """
    item = get_item(db, item_id)
    require_catalog_editor(item.created_by_email, dm_email)
    uses = where_used(db, item, dm_email)
    if uses:
        raise ItemConflictError(
            f"{item.name} is still in use: {'; '.join(uses)}. Take it out first, then delete it."
        )
    ItemRepo.delete(db, item)


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
        ItemRepo.create(db, _magic_item_payload(raw))
        inserted += 1
    return inserted


def _magic_item_payload(raw: dict) -> ItemCreate:
    """Turn one seed dict from ``magic_items.py`` into a shared, magic ItemCreate.

    Args:
        raw: A seed entry (name, rarity, item_type, description, ...).

    Returns:
        The validated payload; an unknown rarity falls back to Common.
    """
    try:
        # Normalise "Very Rare" → "VeryRare" if seed data uses space
        rarity = ItemRarity(raw.get("rarity", "Common").replace(" ", ""))
    except ValueError:
        rarity = ItemRarity.COMMON
    return ItemCreate(
        name=raw["name"],
        rarity=rarity,
        item_type=raw.get("item_type", "Wondrous Item"),
        description=raw.get("description"),
        attunement_required=raw.get("attunement_required", False),
        value_gp=raw.get("value_gp", 0),
        is_magic=True,
        properties=raw.get("properties"),
    )


def seed_missing_magic_items(db: Session, entries: list[dict]) -> int:
    """Insert the seed magic items an existing catalog lacks, by name. Idempotent.

    ``seed_magic_items`` only fills an empty table, so items added to the seed later
    (Plan 135: the SRD 5.1 magic weapons the first seed missed) need this to reach
    databases that already exist, prod included. Runs at startup. Only shared rows
    count, as in ``seed_armor``: a DM's homebrew of the same name never stands in for
    the SRD one. Existing rows are never read for anything but their names, so they
    stay exactly as they are.

    Args:
        db: Active database session.
        entries: Seed dicts in the ``magic_items.py`` shape.

    Returns:
        Number of rows inserted (0 once every entry is present).
    """
    have = {i.name.strip().casefold() for i in ItemRepo.list_all(db) if not i.created_by_email}
    inserted = 0
    for raw in entries:
        key = raw["name"].strip().casefold()
        if key in have:
            continue
        ItemRepo.create(db, _magic_item_payload(raw))
        have.add(key)
        inserted += 1
    return inserted


# Magic items whose ``item_type`` is generic ("any sword", "any axe") default
# to a representative SRD weapon so equipped attack rolls just work. Tied to
# the Plan 18 weapon catalog names (case-insensitive match later).
_GENERIC_WEAPON_DEFAULTS: dict[str, str] = {
    "any sword": "Longsword",
    "any sword that deals slashing damage": "Longsword",
    "any axe": "Battleaxe",
    "any axe or sword": "Longsword",
}


def _parse_weapon_template(item_type: str) -> Optional[str]:
    """Pull the base weapon name from an ``item_type`` like 'Weapon (mace)'.

    Returns:
        Lowercased base weapon name, or None if the type can't be matched
        (e.g. "Weapon (any)", "Weapon (arrow)").
    """
    if not item_type or "(" not in item_type:
        return None
    inside = item_type.split("(", 1)[1].rsplit(")", 1)[0].strip().lower()
    if not inside:
        return None
    if inside in {"any", "arrow", "bolt", "ammunition"}:
        return None  # too generic or non-weapon
    # Map generic-but-equippable templates to a default weapon.
    if inside in _GENERIC_WEAPON_DEFAULTS:
        return _GENERIC_WEAPON_DEFAULTS[inside].lower()
    return inside


def backfill_weapon_stats(db: Session) -> int:
    """Populate weapon columns on magic-weapon items by name-matching SRD weapons.

    Called from the lifespan hook after mundane weapons are seeded. Idempotent:
    only touches magic items whose ``weapon_category`` is currently NULL but
    whose ``item_type`` parses to a known SRD weapon. Items whose base type is
    "any" / "arrow" / etc. are skipped.

    Args:
        db: Active database session.

    Returns:
        Number of items updated.
    """
    from domain.item import ItemUpdate

    all_items = ItemRepo.list_all(db)
    # Build a name→weapon lookup from the shared weapons (never a DM's homebrew
    # "Longsword", Plan 132), which already have weapon stats.
    weapon_by_name: dict[str, object] = {}
    for i in all_items:
        if i.weapon_category and i.damage_die and not i.created_by_email:
            weapon_by_name[i.name.lower()] = i
    if not weapon_by_name:
        return 0

    updated = 0
    for item in all_items:
        if not item.is_magic:
            continue
        if item.weapon_category:
            continue  # already populated
        template = _parse_weapon_template(item.item_type or "")
        if not template:
            continue
        src = weapon_by_name.get(template)
        if src is None:
            continue
        ItemRepo.update(
            db,
            item,
            ItemUpdate(
                weapon_category=src.weapon_category,
                damage_die=src.damage_die,
                damage_type=src.damage_type,
                weapon_properties=src.weapon_properties,
                versatile_damage=src.versatile_damage,
                weapon_range=src.weapon_range,
                mastery=src.mastery,
            ),
        )
        updated += 1
    return updated
