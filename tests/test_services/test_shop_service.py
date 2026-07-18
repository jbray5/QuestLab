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


class TestPurchase:
    """Plan 50 — players buying with coin from their phone."""

    def _pc_with_gold(self, db, campaign_id, dm, gp=50, sp=0):
        """A minimal PC in the campaign with a set purse."""
        import services.character_service as char_svc
        from db.repos.character_repo import CharacterRepo
        from domain.character import PlayerCharacterUpdate
        from domain.enums import CharacterClass

        pc = char_svc.create_character(
            db,
            campaign_id=campaign_id,
            dm_email=dm,
            player_name="P",
            character_name="Buyer",
            race="Human",
            character_class=CharacterClass.ROGUE,
            level=2,
            score_str=10,
            score_dex=14,
            score_con=12,
            score_int=10,
            score_wis=10,
            score_cha=10,
            hp_max=15,
            hp_current=15,
            ac=13,
            speed=30,
        )
        row = CharacterRepo.get_by_id(db, pc.id)
        CharacterRepo.update(db, row, PlayerCharacterUpdate(gp=gp, sp=sp))
        return pc

    def test_happy_path_deducts_and_delivers(self, duckdb_session: Session):
        """Coin leaves the purse, stock drops, item lands in the pack."""
        import services.player_service as play_svc

        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session,
            shop.id,
            dm,
            ShopItemAdd(name="Everbright Lantern", price_gp=25, stock=3),
        )
        pc = self._pc_with_gold(duckdb_session, campaign.id, dm, gp=50)

        receipt = shop_svc.purchase(duckdb_session, pc.id, card.shop_item_id)

        assert receipt.item_name == "Everbright Lantern"
        assert receipt.gp == 25 and receipt.sp == 0 and receipt.cp == 0
        assert receipt.stock == 2
        gear = play_svc.list_gear(duckdb_session, pc.id)
        assert any(g["name"] == "Everbright Lantern" for g in gear)

    def test_fractional_price_makes_change(self, duckdb_session: Session):
        """A 0.5 gp item paid from 1 gp leaves 5 sp."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session, shop.id, dm, ShopItemAdd(name="Plum Jam", price_gp=0.5)
        )
        pc = self._pc_with_gold(duckdb_session, campaign.id, dm, gp=1)

        receipt = shop_svc.purchase(duckdb_session, pc.id, card.shop_item_id)

        assert (receipt.gp, receipt.sp, receipt.cp) == (0, 5, 0)

    def test_insufficient_funds_changes_nothing(self, duckdb_session: Session):
        """A short purse errors with the shortfall; no coin or stock moves."""
        from db.repos.character_repo import CharacterRepo

        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session, shop.id, dm, ShopItemAdd(name="Greatsword", price_gp=50, stock=1)
        )
        pc = self._pc_with_gold(duckdb_session, campaign.id, dm, gp=10)

        with pytest.raises(ValueError, match="40 gp short"):
            shop_svc.purchase(duckdb_session, pc.id, card.shop_item_id)

        assert CharacterRepo.get_by_id(duckdb_session, pc.id).gp == 10
        storefront = shop_svc.get_storefront(duckdb_session, shop.id)
        assert storefront.items[0].stock == 1

    def test_sold_out_refuses(self, duckdb_session: Session):
        """Zero stock cannot be bought."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session, shop.id, dm, ShopItemAdd(name="Rare Bloom", price_gp=5, stock=0)
        )
        pc = self._pc_with_gold(duckdb_session, campaign.id, dm)

        with pytest.raises(ValueError, match="sold out"):
            shop_svc.purchase(duckdb_session, pc.id, card.shop_item_id)

    def test_barter_items_refuse_coin(self, duckdb_session: Session):
        """cost_text (fey bargain) items cannot be bought with gold."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session,
            shop.id,
            dm,
            ShopItemAdd(name="Debt-Marked Ring", price_gp=0, cost_text="a favour, called in later"),
        )
        pc = self._pc_with_gold(duckdb_session, campaign.id, dm)

        with pytest.raises(ValueError, match="different price"):
            shop_svc.purchase(duckdb_session, pc.id, card.shop_item_id)

    def test_cross_campaign_pc_denied(self, duckdb_session: Session):
        """A PC from another campaign cannot buy here."""
        dm = _dm()
        campaign_a = _campaign(duckdb_session, dm)
        campaign_b = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign_a.id, dm)
        card = shop_svc.add_item(
            duckdb_session, shop.id, dm, ShopItemAdd(name="Lantern", price_gp=5)
        )
        outsider = self._pc_with_gold(duckdb_session, campaign_b.id, dm)

        with pytest.raises(PermissionError):
            shop_svc.purchase(duckdb_session, outsider.id, card.shop_item_id)

    def test_unlimited_stock_stays_unlimited(self, duckdb_session: Session):
        """stock=None never decrements."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session, shop.id, dm, ShopItemAdd(name="Rations", price_gp=1)
        )
        pc = self._pc_with_gold(duckdb_session, campaign.id, dm)

        receipt = shop_svc.purchase(duckdb_session, pc.id, card.shop_item_id)

        assert receipt.stock is None

    def test_repeat_purchase_merges_quantity(self, duckdb_session: Session):
        """Buying the same item twice stacks quantity in the pack."""
        import services.player_service as play_svc

        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session, shop.id, dm, ShopItemAdd(name="Torch Bundle", price_gp=1)
        )
        pc = self._pc_with_gold(duckdb_session, campaign.id, dm, gp=10)

        shop_svc.purchase(duckdb_session, pc.id, card.shop_item_id)
        shop_svc.purchase(duckdb_session, pc.id, card.shop_item_id)

        gear = play_svc.list_gear(duckdb_session, pc.id)
        row = next(g for g in gear if g["name"] == "Torch Bundle")
        assert row["quantity"] == 2


class TestDeleteCascade:
    """A PC who bought things must still be deletable (repo emulates cascade)."""

    def test_delete_pc_with_inventory(self, duckdb_session: Session):
        """Deleting a PC clears inventory junction rows instead of erroring."""
        import services.character_service as char_svc
        from db.repos.character_item_repo import CharacterItemRepo
        from db.repos.character_repo import CharacterRepo

        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        shop = _shop(duckdb_session, campaign.id, dm)
        card = shop_svc.add_item(
            duckdb_session, shop.id, dm, ShopItemAdd(name="Lantern", price_gp=5)
        )
        pc = TestPurchase()._pc_with_gold(duckdb_session, campaign.id, dm, gp=10)
        shop_svc.purchase(duckdb_session, pc.id, card.shop_item_id)
        assert len(CharacterItemRepo.list_for_character(duckdb_session, pc.id)) == 1

        char_svc.delete_character(duckdb_session, pc.id, dm)

        assert CharacterRepo.get_by_id(duckdb_session, pc.id) is None
        assert CharacterItemRepo.list_for_character(duckdb_session, pc.id) == []


class TestSellAndPool:
    """Plan 51 — selling to vendors and pooling coin."""

    def _pc(self, db, campaign_id, dm, gp=10):
        """Reuse the purchase-test PC factory."""
        return TestPurchase()._pc_with_gold(db, campaign_id, dm, gp=gp)

    def _give_lantern(self, db, campaign_id, dm, pc_id, value_gp=10, qty=1, equipped=False):
        """Put a catalog item straight into the PC's pack."""
        import services.inventory_service as inv_svc
        import services.item_service as item_svc
        from domain.character import CharacterItemCreate
        from domain.item import ItemCreate

        item = item_svc.create_item(
            db,
            ItemCreate(
                name=f"Sellable {uuid.uuid4().hex[:6]}",
                rarity=ItemRarity.COMMON,
                item_type="Adventuring Gear",
                value_gp=value_gp,
            ),
        )
        return inv_svc.add_item(
            db, pc_id, CharacterItemCreate(item_id=item.id, quantity=qty, equipped=equipped), dm
        )

    def test_sell_credits_half_value(self, duckdb_session: Session):
        """A 10 gp item sells for 5 gp; the row disappears at zero."""
        import services.player_service as play_svc

        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        pc = self._pc(duckdb_session, campaign.id, dm, gp=0)
        row = self._give_lantern(duckdb_session, campaign.id, dm, pc.id, value_gp=10)

        receipt = shop_svc.sell(duckdb_session, pc.id, row.id)

        assert receipt.amount_gp == 5
        assert receipt.gp == 5 and receipt.quantity_left == 0
        assert all(
            g["character_item_id"] != str(row.id) for g in play_svc.list_gear(duckdb_session, pc.id)
        )

    def test_sell_decrements_stacks(self, duckdb_session: Session):
        """Selling from a stack of 3 leaves 2."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        pc = self._pc(duckdb_session, campaign.id, dm, gp=0)
        row = self._give_lantern(duckdb_session, campaign.id, dm, pc.id, value_gp=1, qty=3)

        receipt = shop_svc.sell(duckdb_session, pc.id, row.id)

        assert receipt.quantity_left == 2
        assert (receipt.gp, receipt.sp) == (0, 5)  # half of 1 gp = 5 sp

    def test_sell_refuses_equipped_and_worthless_and_quest(self, duckdb_session: Session):
        """Equipped, zero-value, and quest items are refused."""
        import services.inventory_service as inv_svc
        import services.item_service as item_svc
        from domain.character import CharacterItemCreate
        from domain.item import ItemCreate

        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        pc = self._pc(duckdb_session, campaign.id, dm)
        equipped = self._give_lantern(duckdb_session, campaign.id, dm, pc.id, equipped=True)
        with pytest.raises(ValueError, match="Unequip"):
            shop_svc.sell(duckdb_session, pc.id, equipped.id)

        worthless = self._give_lantern(duckdb_session, campaign.id, dm, pc.id, value_gp=0)
        with pytest.raises(ValueError, match="No vendor"):
            shop_svc.sell(duckdb_session, pc.id, worthless.id)

        quest_item = item_svc.create_item(
            duckdb_session,
            ItemCreate(
                name="Ciphered Page", rarity=ItemRarity.COMMON, item_type="Quest item", value_gp=100
            ),
        )
        qrow = inv_svc.add_item(
            duckdb_session, pc.id, CharacterItemCreate(item_id=quest_item.id), dm
        )
        with pytest.raises(ValueError, match="No vendor"):
            shop_svc.sell(duckdb_session, pc.id, qrow.id)

    def test_sell_other_pcs_row_denied(self, duckdb_session: Session):
        """You cannot sell a party-mate's gear."""
        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        pc_a = self._pc(duckdb_session, campaign.id, dm)
        pc_b = self._pc(duckdb_session, campaign.id, dm)
        row_b = self._give_lantern(duckdb_session, campaign.id, dm, pc_b.id)

        with pytest.raises(PermissionError):
            shop_svc.sell(duckdb_session, pc_a.id, row_b.id)

    def test_give_moves_coin_with_change(self, duckdb_session: Session):
        """2.5 gp moves exactly; both purses re-denominate."""
        import services.player_service as play_svc
        from db.repos.character_repo import CharacterRepo

        dm = _dm()
        campaign = _campaign(duckdb_session, dm)
        giver = self._pc(duckdb_session, campaign.id, dm, gp=10)
        taker = self._pc(duckdb_session, campaign.id, dm, gp=0)

        receipt = play_svc.give_coin(duckdb_session, giver.id, taker.id, 2.5)

        assert receipt.to_name == "Buyer"
        assert (receipt.gp, receipt.sp) == (7, 5)
        got = CharacterRepo.get_by_id(duckdb_session, taker.id)
        assert (got.gp, got.sp) == (2, 5)

    def test_give_guards(self, duckdb_session: Session):
        """Self, cross-campaign, and over-purse transfers are refused."""
        import services.player_service as play_svc

        dm = _dm()
        campaign_a = _campaign(duckdb_session, dm)
        campaign_b = _campaign(duckdb_session, dm)
        giver = self._pc(duckdb_session, campaign_a.id, dm, gp=5)
        outsider = self._pc(duckdb_session, campaign_b.id, dm)

        with pytest.raises(ValueError, match="already have"):
            play_svc.give_coin(duckdb_session, giver.id, giver.id, 1)
        with pytest.raises(PermissionError):
            play_svc.give_coin(duckdb_session, giver.id, outsider.id, 1)
        # over-purse against a valid partymate
        taker = self._pc(duckdb_session, campaign_a.id, dm)
        with pytest.raises(ValueError, match="short"):
            play_svc.give_coin(duckdb_session, giver.id, taker.id, 100)

    def test_party_lists_campaign_mates_only(self, duckdb_session: Session):
        """The pooling dropdown sees the party, not other campaigns."""
        import services.player_service as play_svc

        dm = _dm()
        campaign_a = _campaign(duckdb_session, dm)
        campaign_b = _campaign(duckdb_session, dm)
        me = self._pc(duckdb_session, campaign_a.id, dm)
        mate = self._pc(duckdb_session, campaign_a.id, dm)
        self._pc(duckdb_session, campaign_b.id, dm)

        party = play_svc.list_party(duckdb_session, me.id)

        ids = {p["id"] for p in party}
        assert ids == {str(mate.id)}
