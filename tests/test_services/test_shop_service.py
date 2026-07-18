"""Plan 47 tests — the player marketplace.

Claude stocking + OpenAI/Blob image calls are monkeypatched on the modules
the service imports from; the CRUD, catalog reuse, and projection logic run
for real against the in-memory DuckDB.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.shop_service as shop_svc
from domain.enums import ItemRarity
from domain.shop import ShopCreate, ShopItemAdd, ShopItemUpdate, ShopUpdate
from services.ai_service import _ShopStockItem, _ShopStockOutput


def _dm() -> str:
    """Unique DM email per test."""
    return f"dm-{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db: Session, dm: str):
    """Create a minimal campaign."""
    return camp_svc.create_campaign(
        db, name="The Severance", setting="Fey-touched vale", tone="Whimsical", dm_email=dm
    )


def _shop(db: Session, campaign_id: uuid.UUID, dm: str, name: str = "The Gilded Burr"):
    """Create a bare shop."""
    return shop_svc.create_shop(db, campaign_id, dm, ShopCreate(name=name))


def _fake_stock(monkeypatch, items: list[_ShopStockItem] | None = None) -> dict:
    """Stub ai_service.generate_shop_stock; return captured call kwargs."""
    captured: dict = {}
    output = _ShopStockOutput(
        keeper="Maribel Thistledown",
        blurb="Curiosities plucked from the hedgerows of the Feywild.",
        location="The Green, east row",
        items=(
            items
            if items is not None
            else [
                _ShopStockItem(
                    name="Potion of Healing",
                    item_type="Potion",
                    rarity="Common",
                    description="Restores 2d4+2 hit points.",
                    price_gp=50,
                    stock=3,
                    pitch="Fresh from the still this morning!",
                ),
                _ShopStockItem(
                    name="Fey-Touched Plum Jam",
                    item_type="Provisions",
                    rarity="Common",
                    description="Tastes like a summer you half remember.",
                    price_gp=0.5,
                    pitch="One spoonful and you'll dream in colour.",
                ),
            ]
        ),
    )

    def fake_generate(**kwargs):
        captured.update(kwargs)
        return output

    monkeypatch.setattr(shop_svc.ai_service, "generate_shop_stock", fake_generate)
    return captured


class TestShopCrud:
    """Shop create / update / delete with campaign-owner authz."""

    def test_create_and_list(self, duckdb_session: Session):
        """A created shop lists for its campaign with a zero item count."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        _shop(duckdb_session, campaign.id, dm)

        shops = shop_svc.list_shops(duckdb_session, campaign.id, dm)

        assert len(shops) == 1
        assert shops[0].name == "The Gilded Burr"
        assert shops[0].item_count == 0

    def test_non_owner_forbidden(self, duckdb_session: Session):
        """A different DM cannot list or mutate someone else's shops."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)

        with pytest.raises(PermissionError):
            shop_svc.list_shops(duckdb_session, campaign.id, _dm())
        with pytest.raises(PermissionError):
            shop_svc.update_shop(duckdb_session, shop.id, _dm(), ShopUpdate(name="Stolen"))

    def test_update_fields(self, duckdb_session: Session):
        """Partial updates land and survive a re-read."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)

        updated = shop_svc.update_shop(
            duckdb_session, shop.id, dm, ShopUpdate(keeper="Maribel", location="East row")
        )

        assert updated.keeper == "Maribel"
        assert shop_svc.list_shops(duckdb_session, campaign.id, dm)[0].location == "East row"

    def test_delete_removes_stock_rows(self, duckdb_session: Session):
        """Deleting a shop removes its stock rows but not catalog items."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session, shop.id, dm, ShopItemAdd(name="Rope (50 ft)", price_gp=1)
        )

        shop_svc.delete_shop(duckdb_session, shop.id, dm)

        with pytest.raises(ValueError):
            shop_svc.get_storefront(duckdb_session, shop.id)
        from db.repos.item_repo import ItemRepo

        assert ItemRepo.get_by_id(duckdb_session, card.item_id) is not None


class TestStocking:
    """Manual adds, catalog reuse, and AI stocking."""

    def test_add_custom_item_creates_catalog_row(self, duckdb_session: Session):
        """A named item with no item_id creates a catalog row."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)

        card = shop_svc.add_item(
            duckdb_session,
            shop.id,
            dm,
            ShopItemAdd(
                name="Waystone Chalk", item_type="Trinket", price_gp=2, pitch="Marks true."
            ),
        )

        assert card.name == "Waystone Chalk"
        assert card.price_gp == 2
        storefront = shop_svc.get_storefront(duckdb_session, shop.id)
        assert [i.name for i in storefront.items] == ["Waystone Chalk"]

    def test_add_reuses_catalog_by_name(self, duckdb_session: Session):
        """Stocking the same name twice points at one catalog item."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop_a = _shop(duckdb_session, campaign.id, dm, name="A")
        shop_b = _shop(duckdb_session, campaign.id, dm, name="B")

        card_a = shop_svc.add_item(
            duckdb_session, shop_a.id, dm, ShopItemAdd(name="Potion of Healing", price_gp=50)
        )
        card_b = shop_svc.add_item(
            duckdb_session, shop_b.id, dm, ShopItemAdd(name="potion of healing", price_gp=60)
        )

        assert card_a.item_id == card_b.item_id
        assert card_b.price_gp == 60

    def test_update_and_remove_item(self, duckdb_session: Session):
        """Price/stock edits persist; removal empties the storefront."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session, shop.id, dm, ShopItemAdd(name="Lantern", price_gp=5, stock=2)
        )

        updated = shop_svc.update_item(
            duckdb_session, shop.id, card.shop_item_id, dm, ShopItemUpdate(price_gp=4, stock=1)
        )
        assert (updated.price_gp, updated.stock) == (4, 1)

        shop_svc.remove_item(duckdb_session, shop.id, card.shop_item_id, dm)
        assert shop_svc.get_storefront(duckdb_session, shop.id).items == []

    def test_ai_stock_fills_shop_and_flavor(self, duckdb_session: Session, monkeypatch):
        """AI stocking creates items, keeps DM flavor precedence, passes context."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        captured = _fake_stock(monkeypatch)

        storefront = shop_svc.stock_shop(
            duckdb_session, shop.id, dm, concept="fey curiosities", count=2
        )

        assert captured["campaign_name"] == "The Severance"
        assert captured["concept"] == "fey curiosities"
        assert len(storefront.items) == 2
        assert storefront.keeper == "Maribel Thistledown"
        jam = next(i for i in storefront.items if "Jam" in i.name)
        assert jam.price_gp == 0.5
        assert jam.rarity == ItemRarity.COMMON

    def test_ai_stock_respects_existing_flavor(self, duckdb_session: Session, monkeypatch):
        """The DM's own keeper/blurb are not overwritten by stocking."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        shop_svc.update_shop(duckdb_session, shop.id, dm, ShopUpdate(keeper="Halve"))
        _fake_stock(monkeypatch)

        storefront = shop_svc.stock_shop(duckdb_session, shop.id, dm)

        assert storefront.keeper == "Halve"

    def test_ai_stock_bad_rarity_falls_back_common(self, duckdb_session: Session, monkeypatch):
        """An off-menu rarity string degrades to Common instead of raising."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        _fake_stock(
            monkeypatch,
            items=[_ShopStockItem(name="Odd Bauble", item_type="Trinket", rarity="Mythical")],
        )

        storefront = shop_svc.stock_shop(duckdb_session, shop.id, dm)

        assert storefront.items[0].rarity == ItemRarity.COMMON


class TestProjectionsAndArt:
    """Capability-URL projections + image generation."""

    def test_market_lists_shops_without_auth(self, duckdb_session: Session):
        """The market projection needs no DM email and counts items."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        shop_svc.add_item(duckdb_session, shop.id, dm, ShopItemAdd(name="Lantern", price_gp=5))

        market = shop_svc.get_market(duckdb_session, campaign.id)

        assert market.campaign_name == "The Severance"
        assert len(market.shops) == 1
        assert market.shops[0].item_count == 1

    def test_hidden_shop_excluded_from_market_only(self, duckdb_session: Session):
        """A hidden shop is off the player market but reachable by direct link."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        _shop(duckdb_session, campaign.id, dm, name="Open Store")
        secret = shop_svc.create_shop(
            duckdb_session, campaign.id, dm, ShopCreate(name="Fey Market", hidden=True)
        )

        market = shop_svc.get_market(duckdb_session, campaign.id)
        assert [s.name for s in market.shops] == ["Open Store"]  # secret hidden

        # DM manager still sees it, and the direct storefront still resolves.
        dm_names = {s.name for s in shop_svc.list_shops(duckdb_session, campaign.id, dm)}
        assert "Fey Market" in dm_names
        assert shop_svc.get_storefront(duckdb_session, secret.id).name == "Fey Market"

    def test_unhiding_reveals_on_market(self, duckdb_session: Session):
        """Flipping hidden off brings the shop onto the market."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        secret = shop_svc.create_shop(
            duckdb_session, campaign.id, dm, ShopCreate(name="Fey Market", hidden=True)
        )
        assert shop_svc.get_market(duckdb_session, campaign.id).shops == []

        shop_svc.update_shop(duckdb_session, secret.id, dm, ShopUpdate(hidden=False))

        assert [s.name for s in shop_svc.get_market(duckdb_session, campaign.id).shops] == [
            "Fey Market"
        ]

    def test_cost_text_shows_on_storefront(self, duckdb_session: Session):
        """A non-gold cost rides through to the storefront card."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        shop_svc.add_item(
            duckdb_session,
            shop.id,
            dm,
            ShopItemAdd(name="A Kept Secret", price_gp=0, cost_text="one true secret"),
        )

        card = shop_svc.get_storefront(duckdb_session, shop.id).items[0]

        assert card.cost_text == "one true secret"
        assert card.price_gp == 0

    def test_item_image_saves_on_catalog_item(self, duckdb_session: Session, monkeypatch):
        """Generated art uploads and lands on the shared catalog item."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session,
            shop.id,
            dm,
            ShopItemAdd(name="Moonlit Vial", item_type="Potion", price_gp=25),
        )
        captured: dict = {}

        def fake_generate_image(prompt: str, **kwargs):
            captured["prompt"] = prompt
            return b"\x89PNGFAKE"

        def fake_upload(*, path: str, data: bytes, content_type: str = "image/png"):
            captured["path"] = path
            return f"https://fake.blob/{path}"

        monkeypatch.setattr(shop_svc, "generate_image", fake_generate_image)
        monkeypatch.setattr(shop_svc.blob_storage, "upload", fake_upload)

        url = shop_svc.generate_item_image(duckdb_session, shop.id, card.shop_item_id, dm)

        assert url == f"https://fake.blob/items/item-{card.item_id}.png"
        assert "Moonlit Vial" in captured["prompt"]
        storefront = shop_svc.get_storefront(duckdb_session, shop.id)
        assert storefront.items[0].image_url == url

    def test_banner_saves_on_shop(self, duckdb_session: Session, monkeypatch):
        """Banner art uploads and lands on the shop row."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        monkeypatch.setattr(shop_svc, "generate_image", lambda prompt, **k: b"\x89PNGFAKE")
        monkeypatch.setattr(
            shop_svc.blob_storage,
            "upload",
            lambda *, path, data, content_type="image/png": f"https://fake.blob/{path}",
        )

        updated = shop_svc.generate_banner(duckdb_session, shop.id, dm)

        assert updated.banner_url == f"https://fake.blob/shops/shop-{shop.id}.png"
