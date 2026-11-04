"""Plan 135 — ``GET /weapons?ruleset=``: the Weapons page's 2024/2014 switch.

Without ``ruleset`` the route answers exactly as before. ``2014`` clears mastery,
drops the 2024 firearms and ignores a mastery filter; both editions list the magic
weapons that have no stats of their own. Another DM's homebrew never shows.
"""

from sqlmodel import Session

from domain.enums import ItemRarity
from domain.item import ItemCreate
from integrations.dnd_rules.magic_items import SRD51_MAGIC_WEAPONS
from integrations.dnd_rules.srd_weapons_2024 import SRD_WEAPONS_2024
from services import item_service

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"
DM = "wp135_api_dm@example.com"
OTHER = "wp135_api_other@example.com"


def _h(email: str = DM) -> dict:
    """The trusted identity header for this DM."""
    return {_AUTH: email}


def _seed(engine) -> None:
    """The startup item seeding: magic items, the Plan 135 sync, weapons, backfill."""
    with Session(engine) as s:
        item_service.seed_magic_items(s)
        item_service.seed_missing_magic_items(s, SRD51_MAGIC_WEAPONS)
        item_service.seed_weapons(s, SRD_WEAPONS_2024)
        item_service.backfill_weapon_stats(s)


def _get(client, email: str = DM, **params) -> list[dict]:
    """GET /api/weapons with these query params; return the JSON list."""
    resp = client.get("/api/weapons", headers=_h(email), params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_no_ruleset_answers_as_before(client, api_engine):
    """Only statted weapons, with their 2024 mastery, firearms included."""
    _seed(api_engine)
    rows = {r["name"]: r for r in _get(client)}
    assert rows["Longsword"]["mastery"] == "Sap"
    assert "Musket" in rows and "Pistol" in rows
    assert "+1 Weapon" not in rows
    assert all(r["damage_die"] for r in rows.values())
    vex = _get(client, mastery="Vex")
    assert vex and all(r["mastery"] == "Vex" for r in vex)


def test_2014_clears_mastery_drops_firearms_and_ignores_the_mastery_filter(client, api_engine):
    """The 2014 list: no mastery anywhere, no Musket or Pistol, the filter has no effect."""
    _seed(api_engine)
    rows = _get(client, ruleset="2014")
    names = [r["name"] for r in rows]
    assert all(r["mastery"] is None for r in rows)
    assert "Musket" not in names and "Pistol" not in names
    assert [r["name"] for r in _get(client, ruleset="2014", mastery="Vex")] == names
    trident = next(r for r in rows if r["name"] == "Trident")
    assert trident["damage_die"] == "1d6"


def test_magic_weapons_list_in_both_editions_with_the_filters(client, api_engine):
    """Flame Tongue, Vorpal Sword and a stat-less "+1 Weapon"; search and magic-only apply."""
    _seed(api_engine)
    for ruleset in ("2024", "2014"):
        names = {r["name"] for r in _get(client, ruleset=ruleset)}
        assert {"Flame Tongue", "Vorpal Sword", "+1 Weapon", "Sword of Sharpness"} <= names
        found = _get(client, ruleset=ruleset, q="vorpal", is_magic="true")
        assert [r["name"] for r in found] == ["Vorpal Sword"]
        martial = {r["name"] for r in _get(client, ruleset=ruleset, category="Martial Melee")}
        assert "+1 Weapon" not in martial and "Flame Tongue" in martial


def test_an_unknown_ruleset_is_a_422(client):
    """The edition is validated at the boundary."""
    resp = client.get("/api/weapons", headers=_h(), params={"ruleset": "1999"})
    assert resp.status_code == 422


def test_another_dms_homebrew_weapon_never_shows(client, api_engine):
    """A stat-less homebrew magic weapon is its author's alone, in every edition."""
    _seed(api_engine)
    with Session(api_engine) as s:
        item_service.create_item(
            s,
            ItemCreate(
                name="Whisper Edge",
                rarity=ItemRarity.RARE,
                item_type="Weapon (any sword)",
                is_magic=True,
            ),
            dm_email=OTHER,
        )
    for ruleset in (None, "2024", "2014"):
        params = {"ruleset": ruleset} if ruleset else {}
        assert "Whisper Edge" not in {r["name"] for r in _get(client, **params)}
    assert "Whisper Edge" in {r["name"] for r in _get(client, OTHER, ruleset="2014")}
