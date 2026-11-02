"""Plan 132 — DM homebrew magic items and weapons.

A DM makes their own items (from scratch or by copying a catalog row), edits and
deletes only their own, and the shared SRD rows stay admin-only. A homebrew magic
weapon's +1 (``properties["bonus"]``, the PHB seed's representation) reaches the
attack preview. Delete refuses while a character, a shop or a loot table holds it.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.adventure_repo import AdventureRepo
from db.repos.item_repo import ItemRepo, LootTableRepo
from domain.adventure import AdventureCreate
from domain.enums import AdventureTier, CharacterClass, ItemRarity
from domain.item import Item, ItemCreate, LootTableCreate
from domain.shop import ShopCreate, ShopItemAdd
from services import attack_service, shop_service

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"
DM = "hb_items_dm@example.com"
OTHER = "hb_items_other@example.com"


def _h(email: str) -> dict:
    """The trusted identity header for this DM."""
    return {_AUTH: email}


def _srd_longsword(engine) -> uuid.UUID:
    """The shared (no owner) mundane Longsword, as the SRD seed makes it."""
    with Session(engine) as s:
        return ItemRepo.create(
            s,
            ItemCreate(
                name="Longsword",
                rarity=ItemRarity.COMMON,
                item_type="Weapon",
                value_gp=15,
                weapon_category="Martial Melee",
                damage_die="1d8",
                damage_type="slashing",
                weapon_properties=["Versatile"],
                versatile_damage="1d10",
                mastery="Sap",
            ),
        ).id


def _moonblade_body(**over) -> dict:
    """A +1 rare longsword that needs attunement, built on the SRD Longsword."""
    body = {
        "name": f"Moonblade {uuid.uuid4().hex[:4]}",
        "rarity": "Rare",
        "item_type": "Weapon (longsword)",
        "description": "A silver blade that hums under moonlight.",
        "attunement_required": True,
        "value_gp": 4000,
        "is_magic": True,
        "properties": {"bonus": "+1"},
        "weapon_category": "Martial Melee",
        "damage_die": "1d8",
        "damage_type": "slashing",
        "weapon_properties": ["Versatile"],
        "versatile_damage": "1d10",
        "weapon_range": None,
        "mastery": "Sap",
    }
    body.update(over)
    return body


def _make(client, email: str = DM, **over) -> dict:
    """POST a homebrew item as this DM (Moonblade unless overridden); return the JSON."""
    resp = client.post("/api/items", headers=_h(email), json=_moonblade_body(**over))
    assert resp.status_code == 201, resp.text
    return resp.json()


def _campaign_pc(engine, dm: str = DM, name: str = "Brannoc") -> tuple[uuid.UUID, uuid.UUID]:
    """A campaign and one level-1 fighter (STR 16 → +3, proficiency +2)."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Hollow Road", dm_email=dm)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name="Sam",
            character_name=name,
            race="Human",
            character_class=CharacterClass.FIGHTER,
            level=1,
            score_str=16,
            score_dex=12,
            score_con=14,
            score_int=10,
            score_wis=10,
            score_cha=8,
            hp_max=12,
            hp_current=12,
            ac=16,
            speed=30,
        )
        return campaign.id, pc.id


# ── Create, visibility, copy ─────────────────────────────────────────────────


def test_create_stamps_the_owner_and_only_they_see_it(client):
    """A new item is the author's homebrew: listed for them, invisible to another DM."""
    item = _make(client)
    assert item["created_by_email"] == DM
    assert item["properties"] == {"bonus": "+1"}
    q = item["name"]
    mine = [i["id"] for i in client.get(f"/api/items?q={q}", headers=_h(DM)).json()]
    theirs = [i["id"] for i in client.get(f"/api/items?q={q}", headers=_h(OTHER)).json()]
    assert mine == [item["id"]] and theirs == []


def test_copy_and_edit_makes_a_new_row_and_leaves_the_original(client, api_engine):
    """Copying the SRD Longsword makes the DM's own row; the shared one is untouched."""
    base_id = _srd_longsword(api_engine)
    base = client.get(f"/api/items/{base_id}", headers=_h(DM)).json()
    copy = {k: v for k, v in base.items() if k not in {"id", "created_by_email"}}
    copy.update(name="Longsword of the Watch", is_magic=True, properties={"bonus": "+2"})
    made = client.post("/api/items", headers=_h(DM), json=copy)
    assert made.status_code == 201, made.text
    assert made.json()["id"] != str(base_id)
    assert made.json()["created_by_email"] == DM
    assert made.json()["damage_die"] == "1d8" and made.json()["mastery"] == "Sap"
    after = client.get(f"/api/items/{base_id}", headers=_h(DM)).json()
    assert after == base


def test_mundane_homebrew_lists_under_mundane_and_all(client):
    """A non-magic homebrew weapon has a home: kind=mundane and kind=all, not the magic list."""
    item = _make(client, is_magic=False, rarity="Common", properties=None, name="Ash Cudgel")

    def names(kind: str) -> list[str]:
        url = "/api/items?q=Ash Cudgel" + (f"&kind={kind}" if kind else "")
        return [i["name"] for i in client.get(url, headers=_h(DM)).json()]

    assert names("") == []
    assert names("mundane") == [item["name"]]
    assert names("all") == [item["name"]]
    assert client.get("/api/items?kind=everything", headers=_h(DM)).status_code == 422


def test_weapon_type_filter_matches_weapon_kinds(client):
    """The 'Weapon' type filter now also finds 'Weapon (longsword)' items."""
    item = _make(client)
    hits = client.get(f"/api/items?item_type=Weapon&q={item['name']}", headers=_h(DM)).json()
    assert [i["id"] for i in hits] == [item["id"]]


def test_the_form_limits_are_the_servers(client):
    """Blank or over-long names and unreadable dice are a plain 422."""
    for bad in (
        {"name": "   "},
        {"name": "x" * 201},
        {"damage_die": "banana"},
        {"versatile_damage": "1d7"},
        {"item_type": ""},
    ):
        resp = client.post("/api/items", headers=_h(DM), json=_moonblade_body(**bad))
        assert resp.status_code == 422, bad
    flat = client.post("/api/items", headers=_h(DM), json=_moonblade_body(damage_die="1"))
    assert flat.status_code == 201  # the SRD blowgun deals a flat 1
    blank = client.post("/api/items", headers=_h(DM), json=_moonblade_body(versatile_damage=""))
    assert blank.status_code == 201 and blank.json()["versatile_damage"] is None


# ── Edit ─────────────────────────────────────────────────────────────────────


def test_edit_is_for_the_owner_only(client, api_engine):
    """The author edits; another DM gets 403; nobody but an admin edits an SRD row."""
    item = _make(client)
    ok = client.patch(
        f"/api/items/{item['id']}",
        headers=_h(DM),
        json={"properties": {"bonus": "+2"}, "rarity": "VeryRare"},
    )
    assert ok.status_code == 200
    assert ok.json()["properties"] == {"bonus": "+2"} and ok.json()["rarity"] == "VeryRare"
    no = client.patch(f"/api/items/{item['id']}", headers=_h(OTHER), json={"value_gp": 1})
    assert no.status_code == 403
    srd = _srd_longsword(api_engine)
    assert (
        client.patch(f"/api/items/{srd}", headers=_h(DM), json={"value_gp": 1}).status_code == 403
    )


# ── Names: a homebrew "Longsword" never shadows the SRD one ─────────────────


def test_a_homebrew_name_cannot_match_one_the_dm_can_see(client, api_engine):
    """Kits and shops look items up by name: an SRD name or your own repeat is a plain 409."""
    _srd_longsword(api_engine)
    clash = client.post("/api/items", headers=_h(DM), json=_moonblade_body(name=" longsword "))
    assert clash.status_code == 409
    assert "The rules already have an item called Longsword" in clash.json()["detail"]
    mine = _make(client, name="Moonblade")
    again = client.post("/api/items", headers=_h(DM), json=_moonblade_body(name="MOONBLADE"))
    assert again.status_code == 409 and "You already have" in again.json()["detail"]
    # Another table never sees this DM's homebrew, so the name is free there.
    assert _make(client, email=OTHER, name="Moonblade")["created_by_email"] == OTHER
    # Saving the edit form unchanged keeps its own name; renaming onto the SRD row is refused.
    same = client.patch(f"/api/items/{mine['id']}", headers=_h(DM), json={"name": "Moonblade"})
    assert same.status_code == 200
    onto = client.patch(f"/api/items/{mine['id']}", headers=_h(DM), json={"name": "Longsword"})
    assert onto.status_code == 409


def test_seeders_and_backfill_ignore_homebrew_names(api_engine):
    """A DM's "Chain Mail" doesn't stop the SRD seed; a homebrew "Mace" is no backfill template."""
    from services import item_service

    with Session(api_engine) as s:
        ItemRepo.create(
            s,
            ItemCreate(name="Chain Mail", rarity=ItemRarity.COMMON, item_type="Armor"),
            owner_email=DM,
        )
        armor = ItemCreate(name="Chain Mail", rarity=ItemRarity.COMMON, item_type="Armor (heavy)")
        assert item_service.seed_armor(s, [armor]) == 1
        ItemRepo.create(
            s,
            ItemCreate(
                name="Mace",
                rarity=ItemRarity.COMMON,
                item_type="Weapon",
                weapon_category="Simple Melee",
                damage_die="4d12",
                damage_type="fire",
            ),
            owner_email=DM,
        )
        relic = ItemRepo.create(
            s,
            ItemCreate(
                name="Mace of Terror",
                rarity=ItemRarity.RARE,
                item_type="Weapon (mace)",
                is_magic=True,
            ),
        )
        assert item_service.backfill_weapon_stats(s) == 0
        assert ItemRepo.get_by_id(s, relic.id).damage_die is None


# ── Delete ───────────────────────────────────────────────────────────────────


def test_delete_works_when_unused_and_only_for_the_owner(client, api_engine):
    """An unused homebrew item deletes for its author; others and SRD rows are refused."""
    item = _make(client)
    assert client.delete(f"/api/items/{item['id']}", headers=_h(OTHER)).status_code == 403
    assert client.delete(f"/api/items/{item['id']}", headers=_h(DM)).status_code == 204
    assert client.get(f"/api/items/{item['id']}", headers=_h(DM)).status_code == 404
    assert client.delete(f"/api/items/{item['id']}", headers=_h(DM)).status_code == 404
    srd = _srd_longsword(api_engine)
    assert client.delete(f"/api/items/{srd}", headers=_h(DM)).status_code == 403


def test_an_admin_may_delete_an_unused_srd_row(client, api_engine, monkeypatch):
    """BOOTSTRAP_ADMIN_EMAILS may remove a shared row nothing uses."""
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "boss132@example.com")
    srd = _srd_longsword(api_engine)
    assert client.delete(f"/api/items/{srd}", headers=_h("boss132@example.com")).status_code == 204


def test_delete_is_refused_while_a_character_carries_it(client, api_engine):
    """In a PC's bag: 409 with a plain sentence naming them; out of the bag, it deletes."""
    item = _make(client)
    _, pc_id = _campaign_pc(api_engine)
    added = client.post(
        f"/api/characters/{pc_id}/inventory", headers=_h(DM), json={"item_id": item["id"]}
    )
    assert added.status_code == 201, added.text
    refused = client.delete(f"/api/items/{item['id']}", headers=_h(DM))
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert item["name"] in detail and "carried by Brannoc" in detail
    assert "first" in detail
    row_id = added.json()["id"]
    gone = client.delete(f"/api/characters/{pc_id}/inventory/{row_id}", headers=_h(DM))
    assert gone.status_code in (200, 204)
    assert client.delete(f"/api/items/{item['id']}", headers=_h(DM)).status_code == 204


def test_delete_is_refused_while_a_shop_or_loot_table_holds_it(client, api_engine):
    """Stocked in a shop or listed on a loot table: refused, and the message says where."""
    item = _make(client)
    item_id = uuid.UUID(item["id"])
    campaign_id, _ = _campaign_pc(api_engine)
    with Session(api_engine) as s:
        shop = shop_service.create_shop(s, campaign_id, DM, ShopCreate(name="The Gilded Anvil"))
        shop_service.add_item(s, shop.id, DM, ShopItemAdd(item_id=item_id, price_gp=500))
    refused = client.delete(f"/api/items/{item_id}", headers=_h(DM))
    assert refused.status_code == 409
    assert "stocked in The Gilded Anvil" in refused.json()["detail"]

    other = _make(client, name="Hoard Blade")
    with Session(api_engine) as s:
        adv = AdventureRepo.create(
            s, AdventureCreate(campaign_id=campaign_id, title="Arc", tier=AdventureTier.TIER1)
        )
        LootTableRepo.create(
            s,
            LootTableCreate(
                adventure_id=adv.id,
                name="Dragon hoard",
                tier=AdventureTier.TIER1,
                entries=[{"item_id": other["id"], "weight": 1}],
            ),
        )
    refused = client.delete(f"/api/items/{other['id']}", headers=_h(DM))
    assert refused.status_code == 409
    assert "listed on Dragon hoard" in refused.json()["detail"]


def test_other_tables_are_counted_not_named(client, api_engine, monkeypatch):
    """An admin deleting a row another DM's PC carries sees a count, not that table's names."""
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "boss132b@example.com")
    item = _make(client)
    _, pc_id = _campaign_pc(api_engine, name="Secret Sera")
    client.post(f"/api/characters/{pc_id}/inventory", headers=_h(DM), json={"item_id": item["id"]})
    refused = client.delete(f"/api/items/{item['id']}", headers=_h("boss132b@example.com"))
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert "Secret Sera" not in detail and "1 character at other tables" in detail


# ── The +1 reaches the table ─────────────────────────────────────────────────


def test_moonblade_in_a_pcs_bag_shows_the_plus_one(client, api_engine):
    """Moonblade (+1, rare, attunement): add to a PC; the attack preview adds the +1."""
    base_id = _srd_longsword(api_engine)
    moon = _make(client, name="Moonblade")
    assert moon["rarity"] == "Rare" and moon["attunement_required"] is True
    catalog = [i["name"] for i in client.get("/api/items?q=Moonblade", headers=_h(DM)).json()]
    assert catalog == ["Moonblade"]
    _, pc_id = _campaign_pc(api_engine)
    added = client.post(
        f"/api/characters/{pc_id}/inventory",
        headers=_h(DM),
        json={"item_id": moon["id"], "equipped": True, "attuned": True},
    )
    assert added.status_code == 201, added.text

    plain = client.post(
        f"/api/items/{base_id}/attack-preview?character_id={pc_id}", headers=_h(DM)
    ).json()
    magic = client.post(
        f"/api/items/{moon['id']}/attack-preview?character_id={pc_id}", headers=_h(DM)
    ).json()
    assert plain["hit_bonus"] == 5 and plain["damage_roll"] == "1d8+3"
    assert plain["magic_bonus"] == 0
    assert magic["hit_bonus"] == 6 and magic["damage_roll"] == "1d8+4"
    assert magic["magic_bonus"] == 1
    two = client.post(
        f"/api/items/{moon['id']}/attack-preview?character_id={pc_id}&two_handed=true",
        headers=_h(DM),
    ).json()
    assert two["damage_roll"] == "1d10+4"


def test_homebrew_shows_in_the_inventory_add_search_for_its_owner(client):
    """The inventory panel's add-item search (GET /items?q=) finds the DM's own homebrew."""
    item = _make(client, name="Moonblade of Ashes")
    hits = [i["id"] for i in client.get("/api/items?q=moonblade of", headers=_h(DM)).json()]
    assert item["id"] in hits
    none = [i["id"] for i in client.get("/api/items?q=moonblade of", headers=_h(OTHER)).json()]
    assert item["id"] not in none


# ── attack_service.magic_bonus (unit) ────────────────────────────────────────


def _weapon(props) -> Item:
    """An unsaved weapon row carrying these properties."""
    return Item(
        name="Test Sword",
        rarity=ItemRarity.RARE,
        item_type="Weapon",
        weapon_category="Martial Melee",
        damage_die="1d8",
        damage_type="slashing",
        properties=props,
    )


@pytest.mark.parametrize(
    ("props", "expected"),
    [
        ({"bonus": "+1"}, 1),
        ({"bonus": "+3"}, 3),
        ({"bonus": 2}, 2),
        ({"bonus": "+5"}, 3),
        ({"bonus": "-1"}, 0),
        ({"bonus": "a lot"}, 0),
        ({"bonus": True}, 0),
        ({"source": "PHB"}, 0),
        (None, 0),
    ],
)
def test_magic_bonus_reads_the_phb_representation(props, expected):
    """``properties["bonus"]`` like the PHB seed's "+1"; capped at +3, junk counts as 0."""
    assert attack_service.magic_bonus(_weapon(props)) == expected
