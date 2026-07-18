"""Shop service — the player marketplace (Plan 47).

Business logic + authorization for campaign shops. DM operations require
campaign ownership; the storefront/market projections are capability-URL
reads (the UUID is the secret) and carry no DM-only data.
"""

import logging
import uuid
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.campaign_repo import CampaignRepo
from db.repos.item_repo import ItemRepo
from db.repos.shop_repo import ShopItemRepo, ShopRepo
from domain.campaign import Campaign
from domain.enums import ItemRarity
from domain.item import Item, ItemCreate, ItemUpdate
from domain.shop import (
    MarketRead,
    MarketShop,
    PurchaseReceipt,
    Shop,
    ShopCreate,
    ShopItem,
    ShopItemAdd,
    ShopItemUpdate,
    ShopRead,
    ShopUpdate,
    StorefrontItem,
    StorefrontRead,
)
from integrations import blob_storage
from integrations.openai_client import generate_image
from services import ai_service, campaign_service

logger = logging.getLogger(__name__)


def _get_owned_campaign(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> Campaign:
    """Fetch a campaign, asserting the requester owns it.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        The owned Campaign row.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the requester is not the owner.
    """
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    campaign_service._assert_owner(campaign, dm_email)
    return campaign


def _get_owned_shop(db: DBSession, shop_id: uuid.UUID, dm_email: str) -> Shop:
    """Fetch a shop, asserting the requester owns its campaign.

    Args:
        db: Active database session.
        shop_id: UUID of the shop.
        dm_email: Email of the requesting DM.

    Returns:
        The Shop row.

    Raises:
        ValueError: If the shop does not exist.
        PermissionError: If the requester does not own the campaign.
    """
    shop = ShopRepo.get_by_id(db, shop_id)
    if shop is None:
        raise ValueError(f"Shop {shop_id} not found.")
    _get_owned_campaign(db, shop.campaign_id, dm_email)
    return shop


def _shop_read(db: DBSession, shop: Shop) -> ShopRead:
    """Build a DM-side ShopRead with the stocked-item count."""
    read = ShopRead.model_validate(shop)
    read.item_count = ShopItemRepo.count_for_shop(db, shop.id)
    return read


def list_shops(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> list[ShopRead]:
    """List a campaign's shops for the DM manager.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        ShopReads in stable town order.
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    return [_shop_read(db, s) for s in ShopRepo.list_for_campaign(db, campaign_id)]


def create_shop(db: DBSession, campaign_id: uuid.UUID, dm_email: str, data: ShopCreate) -> ShopRead:
    """Create a shop in a campaign.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        data: Validated creation payload.

    Returns:
        The created shop as a ShopRead.
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    return _shop_read(db, ShopRepo.create(db, campaign_id, data))


def update_shop(db: DBSession, shop_id: uuid.UUID, dm_email: str, data: ShopUpdate) -> ShopRead:
    """Update a shop's flavor fields.

    Args:
        db: Active database session.
        shop_id: UUID of the shop.
        dm_email: Email of the requesting DM.
        data: Partial update payload.

    Returns:
        The refreshed ShopRead.
    """
    shop = _get_owned_shop(db, shop_id, dm_email)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(shop, field, value)
    return _shop_read(db, ShopRepo.save(db, shop))


def delete_shop(db: DBSession, shop_id: uuid.UUID, dm_email: str) -> None:
    """Delete a shop and its stocked-item rows (catalog items survive).

    Args:
        db: Active database session.
        shop_id: UUID of the shop.
        dm_email: Email of the requesting DM.
    """
    shop = _get_owned_shop(db, shop_id, dm_email)
    ShopItemRepo.delete_for_shop(db, shop.id)
    ShopRepo.delete(db, shop)


def _storefront_item(row: ShopItem, item: Item) -> StorefrontItem:
    """Join one shop_items row with its catalog item into a player card."""
    return StorefrontItem(
        shop_item_id=row.id,
        item_id=item.id,
        name=item.name,
        item_type=item.item_type,
        rarity=item.rarity,
        description=item.description,
        attunement_required=item.attunement_required,
        is_magic=item.is_magic,
        image_url=item.image_url,
        price_gp=row.price_gp,
        stock=row.stock,
        pitch=row.pitch,
        cost_text=row.cost_text,
    )


def _storefront_items(db: DBSession, shop_id: uuid.UUID) -> list[StorefrontItem]:
    """Resolve a shop's stocked rows to player-facing item cards."""
    cards: list[StorefrontItem] = []
    for row in ShopItemRepo.list_for_shop(db, shop_id):
        item = ItemRepo.get_by_id(db, row.item_id)
        if item is None:
            continue
        cards.append(_storefront_item(row, item))
    return cards


def _find_or_create_item(db: DBSession, data: ShopItemAdd) -> Item:
    """Reuse a catalog item by exact name (case-insensitive) or create one.

    Reuse keeps AI-generated art shared: a Potion of Healing stocked in two
    shops points at one catalog row and one image.
    """
    name = (data.name or "").strip()
    if not name:
        raise ValueError("Item name is required when item_id is not given.")
    for item in ItemRepo.list_all(db):
        if item.name.strip().lower() == name.lower():
            return item
    rarity = data.rarity or ItemRarity.COMMON
    return ItemRepo.create(
        db,
        ItemCreate(
            name=name,
            rarity=rarity,
            item_type=data.item_type or "Adventuring Gear",
            description=data.description,
            value_gp=int(data.price_gp),
            is_magic=rarity != ItemRarity.COMMON,
        ),
    )


def add_item(db: DBSession, shop_id: uuid.UUID, dm_email: str, data: ShopItemAdd) -> StorefrontItem:
    """Stock one item — an existing catalog row or a new custom item.

    Args:
        db: Active database session.
        shop_id: UUID of the shop.
        dm_email: Email of the requesting DM.
        data: The item reference or definition + shop price.

    Returns:
        The stocked item as a player-facing card.

    Raises:
        ValueError: If the referenced catalog item does not exist.
    """
    shop = _get_owned_shop(db, shop_id, dm_email)
    if data.item_id is not None:
        item = ItemRepo.get_by_id(db, data.item_id)
        if item is None:
            raise ValueError(f"Item {data.item_id} not found.")
    else:
        item = _find_or_create_item(db, data)
    order = ShopItemRepo.count_for_shop(db, shop.id)
    row = ShopItem(
        shop_id=shop.id,
        item_id=item.id,
        price_gp=data.price_gp or float(item.value_gp),
        stock=data.stock,
        pitch=data.pitch,
        cost_text=data.cost_text,
        sort_order=order,
    )
    return _storefront_item(ShopItemRepo.create(db, row), item)


def update_item(
    db: DBSession,
    shop_id: uuid.UUID,
    shop_item_id: uuid.UUID,
    dm_email: str,
    data: ShopItemUpdate,
) -> StorefrontItem:
    """Update a stocked item's price / stock / pitch.

    Args:
        db: Active database session.
        shop_id: UUID of the shop.
        shop_item_id: UUID of the shop_items row.
        dm_email: Email of the requesting DM.
        data: Partial update payload.

    Returns:
        The refreshed player-facing card.

    Raises:
        ValueError: If the row does not exist or belongs to another shop.
    """
    _get_owned_shop(db, shop_id, dm_email)
    row = ShopItemRepo.get_by_id(db, shop_item_id)
    if row is None or row.shop_id != shop_id:
        raise ValueError(f"Shop item {shop_item_id} not found.")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    row = ShopItemRepo.save(db, row)
    item = ItemRepo.get_by_id(db, row.item_id)
    if item is None:
        raise ValueError(f"Item {row.item_id} not found.")
    return _storefront_item(row, item)


def remove_item(db: DBSession, shop_id: uuid.UUID, shop_item_id: uuid.UUID, dm_email: str) -> None:
    """Remove an item from a shop (the catalog row survives).

    Args:
        db: Active database session.
        shop_id: UUID of the shop.
        shop_item_id: UUID of the shop_items row.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the row does not exist or belongs to another shop.
    """
    _get_owned_shop(db, shop_id, dm_email)
    row = ShopItemRepo.get_by_id(db, shop_item_id)
    if row is None or row.shop_id != shop_id:
        raise ValueError(f"Shop item {shop_item_id} not found.")
    ShopItemRepo.delete(db, row)


_RARITY_ALIASES = {
    "common": ItemRarity.COMMON,
    "uncommon": ItemRarity.UNCOMMON,
    "rare": ItemRarity.RARE,
    "veryrare": ItemRarity.VERY_RARE,
    "very rare": ItemRarity.VERY_RARE,
    "legendary": ItemRarity.LEGENDARY,
    "artifact": ItemRarity.ARTIFACT,
}


def stock_shop(
    db: DBSession,
    shop_id: uuid.UUID,
    dm_email: str,
    concept: Optional[str] = None,
    count: int = 10,
) -> StorefrontRead:
    """AI-stock a shop: invent keeper + blurb + priced inventory (Plan 47).

    Existing stock is kept; new items append after it. Catalog items are
    reused by name so art is shared. Keeper/blurb/location fill in only if
    currently empty (the DM's own flavor wins).

    Args:
        db: Active database session.
        shop_id: UUID of the shop.
        dm_email: Email of the requesting DM.
        concept: Optional concept prompt ("fey curiosities, festival week").
        count: Number of items to invent (1-24).

    Returns:
        The refreshed storefront.
    """
    shop = _get_owned_shop(db, shop_id, dm_email)
    campaign = CampaignRepo.get_by_id(db, shop.campaign_id)
    generated = ai_service.generate_shop_stock(
        campaign_name=campaign.name if campaign else "",
        campaign_setting=campaign.setting if campaign else "",
        campaign_tone=campaign.tone if campaign else "",
        shop_name=shop.name,
        concept=concept,
        count=count,
    )
    if not shop.keeper and generated.keeper:
        shop.keeper = generated.keeper[:200]
    if not shop.blurb and generated.blurb:
        shop.blurb = generated.blurb
    if not shop.location and generated.location:
        shop.location = generated.location[:200]
    ShopRepo.save(db, shop)

    order = ShopItemRepo.count_for_shop(db, shop.id)
    for entry in generated.items:
        rarity = _RARITY_ALIASES.get(entry.rarity.strip().lower(), ItemRarity.COMMON)
        item = _find_or_create_item(
            db,
            ShopItemAdd(
                name=entry.name,
                item_type=entry.item_type or "Adventuring Gear",
                rarity=rarity,
                description=entry.description or None,
                price_gp=entry.price_gp,
            ),
        )
        ShopItemRepo.create(
            db,
            ShopItem(
                shop_id=shop.id,
                item_id=item.id,
                price_gp=max(entry.price_gp, 0.0),
                stock=entry.stock,
                pitch=(entry.pitch or None) and entry.pitch[:500],
                sort_order=order,
            ),
        )
        order += 1
    logger.info("Stocked shop %s with %d AI items", shop.id, len(generated.items))
    return get_storefront(db, shop.id)


def generate_item_image(
    db: DBSession, shop_id: uuid.UUID, shop_item_id: uuid.UUID, dm_email: str
) -> str:
    """Generate catalog art for one stocked item via gpt-image-1 (Plan 47).

    The image saves onto the catalog item, so every shop stocking it shares
    the art.

    Args:
        db: Active database session.
        shop_id: UUID of the shop (authz anchor).
        shop_item_id: UUID of the shop_items row.
        dm_email: Email of the requesting DM.

    Returns:
        The uploaded image URL.

    Raises:
        ValueError: If the row or catalog item does not exist.
        RuntimeError: If generation or upload fails.
    """
    _get_owned_shop(db, shop_id, dm_email)
    row = ShopItemRepo.get_by_id(db, shop_item_id)
    if row is None or row.shop_id != shop_id:
        raise ValueError(f"Shop item {shop_item_id} not found.")
    item = ItemRepo.get_by_id(db, row.item_id)
    if item is None:
        raise ValueError(f"Item {row.item_id} not found.")

    detail = (item.description or "").strip()[:400]
    prompt = (
        f"A single {item.name} — {item.item_type.lower()} from a Dungeons and Dragons "
        f"world. {detail} Painterly fantasy illustration, one centered object as a "
        "shop display piece, soft dramatic lighting, rich color, dark parchment "
        "background with subtle vignette. No text, no watermark, no border, no hands."
    )
    png = generate_image(prompt, size="1024x1024", quality="medium")
    url = blob_storage.upload(path=f"items/item-{item.id}.png", data=png, content_type="image/png")
    ItemRepo.update(db, item, ItemUpdate(image_url=url))
    logger.info("Generated item art for %s", item.id)
    return url


def generate_banner(db: DBSession, shop_id: uuid.UUID, dm_email: str) -> ShopRead:
    """Generate storefront banner art for a shop via gpt-image-1 (Plan 47).

    Args:
        db: Active database session.
        shop_id: UUID of the shop.
        dm_email: Email of the requesting DM.

    Returns:
        The refreshed ShopRead with banner_url set.

    Raises:
        RuntimeError: If generation or upload fails.
    """
    shop = _get_owned_shop(db, shop_id, dm_email)
    blurb = (shop.blurb or "a fantasy village shop").strip()[:300]
    keeper = f" run by {shop.keeper}" if shop.keeper else ""
    prompt = (
        f'Storefront of "{shop.name}", {blurb}{keeper}. Fantasy village market street, '
        "warm inviting light, hanging wooden sign, wares visible in the window, "
        "painterly concept art, wide establishing shot. "
        f'The shop sign reads "{shop.name}". No watermark.'
    )
    png = generate_image(prompt, size="1536x1024", quality="medium")
    url = blob_storage.upload(path=f"shops/shop-{shop.id}.png", data=png, content_type="image/png")
    shop.banner_url = url
    return _shop_read(db, ShopRepo.save(db, shop))


def get_storefront(db: DBSession, shop_id: uuid.UUID) -> StorefrontRead:
    """Player-facing storefront — capability URL, no auth, no DM data.

    Args:
        db: Active database session.
        shop_id: UUID of the shop (the capability secret).

    Returns:
        The StorefrontRead.

    Raises:
        ValueError: If the shop does not exist.
    """
    shop = ShopRepo.get_by_id(db, shop_id)
    if shop is None:
        raise ValueError(f"Shop {shop_id} not found.")
    return StorefrontRead(
        id=shop.id,
        campaign_id=shop.campaign_id,
        name=shop.name,
        keeper=shop.keeper,
        blurb=shop.blurb,
        location=shop.location,
        banner_url=shop.banner_url,
        items=_storefront_items(db, shop.id),
    )


def get_market(db: DBSession, campaign_id: uuid.UUID) -> MarketRead:
    """Player-facing town market — every shop in the campaign, no auth.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign (the capability secret).

    Returns:
        The MarketRead.

    Raises:
        ValueError: If the campaign does not exist.
    """
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    # Hidden shops (secret fey markets, etc.) never surface here — the DM
    # reveals them by sharing the direct storefront link.
    shops = [
        MarketShop(
            id=s.id,
            name=s.name,
            keeper=s.keeper,
            blurb=s.blurb,
            location=s.location,
            banner_url=s.banner_url,
            item_count=ShopItemRepo.count_for_shop(db, s.id),
        )
        for s in ShopRepo.list_for_campaign(db, campaign_id)
        if not s.hidden
    ]
    return MarketRead(campaign_id=campaign.id, campaign_name=campaign.name, shops=shops)


# ---------------------------------------------------------------------------
# Plan 50 — transactional market: players buy with coin from their phone
# ---------------------------------------------------------------------------

# Copper value of each purse denomination (5e standard).
_COPPER_PER = {"pp": 1000, "gp": 100, "ep": 50, "sp": 10, "cp": 1}


def _purse_copper(pc) -> int:
    """Total purse value in copper pieces.

    Args:
        pc: The PlayerCharacter row.

    Returns:
        Combined value of pp/gp/ep/sp/cp in copper.
    """
    return sum(getattr(pc, coin, 0) * rate for coin, rate in _COPPER_PER.items())


def _redenominate(total_cp: int) -> dict[str, int]:
    """Split a copper total back into purse fields.

    Value-exact but normalizing: change comes back as gp/sp/cp (electrum and
    platinum are folded into gold). Documented trade-off — predictable purses
    beat clever change-making at the table.

    Args:
        total_cp: The purse's new total value in copper.

    Returns:
        Field dict for a PlayerCharacterUpdate (pp/ep zeroed).
    """
    gp, rem = divmod(total_cp, 100)
    sp, cp = divmod(rem, 10)
    return {"pp": 0, "gp": gp, "ep": 0, "sp": sp, "cp": cp}


def purchase(db: DBSession, pc_id: uuid.UUID, shop_item_id: uuid.UUID) -> PurchaseReceipt:
    """A player buys one stocked item with coin (Plan 50).

    Capability trust: the caller holds the PC's UUID (their sheet link), so
    no DM auth — the checks are business rules: same campaign, priced in
    coin (fey-bargain items refuse gold), in stock, and affordable. Payment
    deducts from the PC purse; the item quantity-merges into their inventory.

    Args:
        db: Active database session.
        pc_id: UUID of the buying player character.
        shop_item_id: UUID of the shop_items row being bought.

    Returns:
        A PurchaseReceipt with the new purse and remaining stock.

    Raises:
        ValueError: Unknown PC/row/item, sold out, coin-refusing item, or
            insufficient funds (message carries the shortfall).
        PermissionError: If the shop is not in the PC's campaign.
    """
    from db.repos.character_repo import CharacterRepo
    from domain.character import CharacterItemCreate, PlayerCharacterUpdate
    from integrations.event_bus import publish_pc_updated
    from services import inventory_service

    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise ValueError(f"Character {pc_id} not found.")
    row = ShopItemRepo.get_by_id(db, shop_item_id)
    if row is None:
        raise ValueError(f"Shop item {shop_item_id} not found.")
    shop = ShopRepo.get_by_id(db, row.shop_id)
    if shop is None or shop.campaign_id != pc.campaign_id:
        raise PermissionError("That stall doesn't trade with strangers from other lands.")
    item = ItemRepo.get_by_id(db, row.item_id)
    if item is None:
        raise ValueError(f"Item {row.item_id} not found.")

    if row.cost_text:
        raise ValueError(
            "The keeper waves your coin away — this one has a different price. Ask at the table."
        )
    if row.stock is not None and row.stock <= 0:
        raise ValueError(f"{item.name} is sold out.")

    price_cp = round(row.price_gp * 100)
    purse_cp = _purse_copper(pc)
    if purse_cp < price_cp:
        short = (price_cp - purse_cp) / 100
        raise ValueError(f"Not enough coin — you're {short:g} gp short for {item.name}.")

    # Pay: deduct value-exactly, purse re-denominated as gp/sp/cp.
    CharacterRepo.update(db, pc, PlayerCharacterUpdate(**_redenominate(purse_cp - price_cp)))

    # Take one off the shelf (counted stock only).
    if row.stock is not None:
        row.stock -= 1
        ShopItemRepo.save(db, row)

    # Into the pack — quantity-merges and emits pc.inventory.updated. The
    # campaign owner's email satisfies inventory_service's DM authz.
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    inventory_service.add_item(db, pc.id, CharacterItemCreate(item_id=item.id), campaign.dm_email)
    publish_pc_updated(pc.id, pc.campaign_id)
    logger.info("Purchase: %s bought %s for %.2f gp", pc.id, item.name, row.price_gp)

    refreshed = CharacterRepo.get_by_id(db, pc_id)
    return PurchaseReceipt(
        item_name=item.name,
        price_gp=row.price_gp,
        stock=row.stock,
        pp=refreshed.pp,
        gp=refreshed.gp,
        ep=refreshed.ep,
        sp=refreshed.sp,
        cp=refreshed.cp,
    )
