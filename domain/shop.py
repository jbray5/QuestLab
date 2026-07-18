"""Shop domain models — the player marketplace (Plan 47).

Shops belong to a campaign and stock rows from the existing ``items``
catalog with per-shop prices. Player-facing projections (Storefront /
Market) are capability-URL safe: they carry no DM-only data.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel
from pydantic import Field as PField
from sqlmodel import Field, SQLModel

from domain.enums import ItemRarity


class Shop(SQLModel, table=True):
    """Shop SQLModel table — one storefront in a campaign's town."""

    __tablename__ = "shops"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    name: str = Field(min_length=1, max_length=200)
    # The shopkeeper's name — player-facing flavor.
    keeper: Optional[str] = Field(default=None, max_length=200)
    # Short player-facing description of the shop.
    blurb: Optional[str] = None
    # Where in town it sits ("The Green, east row").
    location: Optional[str] = Field(default=None, max_length=200)
    banner_url: Optional[str] = Field(default=None, max_length=1000)
    # Hidden shops (e.g. a secret fey market) never appear on the player
    # market page — the DM reveals them by sharing the direct storefront link.
    hidden: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ShopItem(SQLModel, table=True):
    """ShopItem SQLModel table — one catalog item stocked in one shop."""

    __tablename__ = "shop_items"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    shop_id: uuid.UUID = Field(foreign_key="shops.id", index=True)
    item_id: uuid.UUID = Field(foreign_key="items.id", index=True)
    # Shop price in gold pieces; fractions encode silver/copper (0.5 = 5 sp).
    price_gp: float = Field(default=0, ge=0)
    # None = plenty in stock; an int counts down as the DM sells.
    stock: Optional[int] = Field(default=None, ge=0)
    # The keeper's one-line sales patter — player-facing.
    pitch: Optional[str] = Field(default=None, max_length=500)
    # A non-gold cost ("one true secret", "a year of your voice"). When set,
    # it is shown in place of the gold price — for barter/fey markets.
    cost_text: Optional[str] = Field(default=None, max_length=200)
    sort_order: int = Field(default=0)


class ShopCreate(BaseModel):
    """Input schema for creating a shop."""

    name: str = PField(min_length=1, max_length=200)
    keeper: Optional[str] = None
    blurb: Optional[str] = None
    location: Optional[str] = None
    hidden: bool = False


class ShopUpdate(BaseModel):
    """Partial update schema for a shop."""

    name: Optional[str] = None
    keeper: Optional[str] = None
    blurb: Optional[str] = None
    location: Optional[str] = None
    banner_url: Optional[str] = None
    hidden: Optional[bool] = None


class ShopItemAdd(BaseModel):
    """Add one item to a shop — an existing catalog row or a new custom item."""

    # Reference an existing catalog item…
    item_id: Optional[uuid.UUID] = None
    # …or describe a new one (name required when item_id is absent).
    name: Optional[str] = None
    item_type: Optional[str] = None
    rarity: Optional[ItemRarity] = None
    description: Optional[str] = None
    price_gp: float = PField(default=0, ge=0)
    stock: Optional[int] = None
    pitch: Optional[str] = None
    cost_text: Optional[str] = None


class ShopItemUpdate(BaseModel):
    """Partial update for a stocked item (price / stock / pitch / cost)."""

    price_gp: Optional[float] = PField(default=None, ge=0)
    stock: Optional[int] = None
    pitch: Optional[str] = None
    cost_text: Optional[str] = None
    sort_order: Optional[int] = None


class ShopStockRequest(BaseModel):
    """AI stocking request — concept prompt + how many items to invent."""

    concept: Optional[str] = None
    count: int = PField(default=10, ge=1, le=24)


class ShopRead(BaseModel):
    """DM-side shop summary (includes the stocked-item count)."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    keeper: Optional[str] = None
    blurb: Optional[str] = None
    location: Optional[str] = None
    banner_url: Optional[str] = None
    hidden: bool = False
    item_count: int = 0

    model_config = {"from_attributes": True}


class StorefrontItem(BaseModel):
    """One item card on the player-facing storefront."""

    shop_item_id: uuid.UUID
    item_id: uuid.UUID
    name: str
    item_type: str
    rarity: ItemRarity
    description: Optional[str] = None
    attunement_required: bool = False
    is_magic: bool = False
    image_url: Optional[str] = None
    price_gp: float = 0
    stock: Optional[int] = None
    pitch: Optional[str] = None
    cost_text: Optional[str] = None


class StorefrontRead(BaseModel):
    """The full player-facing storefront — capability URL, no DM data."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    keeper: Optional[str] = None
    blurb: Optional[str] = None
    location: Optional[str] = None
    banner_url: Optional[str] = None
    items: list[StorefrontItem] = PField(default_factory=list)


class MarketShop(BaseModel):
    """One shop card on the player-facing town market page."""

    id: uuid.UUID
    name: str
    keeper: Optional[str] = None
    blurb: Optional[str] = None
    location: Optional[str] = None
    banner_url: Optional[str] = None
    item_count: int = 0


class MarketRead(BaseModel):
    """The town market — every shop in the campaign, player-safe."""

    campaign_id: uuid.UUID
    campaign_name: str
    shops: list[MarketShop] = PField(default_factory=list)


class PurchaseRequest(BaseModel):
    """A player buying one stocked item with coin (Plan 50)."""

    shop_item_id: uuid.UUID


class PurchaseReceipt(BaseModel):
    """Result of a coin purchase — what was bought and the new purse."""

    item_name: str
    price_gp: float
    # Remaining stock on the shelf (None = plenty).
    stock: Optional[int] = None
    # The buyer's purse after payment.
    pp: int = 0
    gp: int = 0
    ep: int = 0
    sp: int = 0
    cp: int = 0
