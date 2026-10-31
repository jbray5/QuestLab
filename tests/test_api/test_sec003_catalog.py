"""SEC-003 — the shared catalog belongs to nobody; homebrew belongs to its DM.

Monsters, items and spells were editable (and spells deletable) by any signed-in
DM, so one table's edit rewrote every table's catalog. Now shared rows are
admin-only to change, homebrew is stamped with its author who alone (with an
admin) may change it, and lists show the shared catalog plus your own homebrew.
"""

import uuid

from sqlmodel import Session

from db.repos.item_repo import ItemRepo
from db.repos.spell_repo import SpellRepo
from domain.enums import ItemRarity
from domain.item import ItemCreate
from domain.spell import SpellCreate

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _h(email: str) -> dict:
    return {_AUTH: email}


def _shared_item(engine) -> uuid.UUID:
    with Session(engine) as s:
        return ItemRepo.create(
            s,
            ItemCreate(
                name=f"Shared Cloak {uuid.uuid4().hex[:4]}",
                rarity=ItemRarity.UNCOMMON,
                item_type="Wondrous Item",
                is_magic=True,
            ),
        ).id


def _shared_spell(engine) -> uuid.UUID:
    with Session(engine) as s:
        return SpellRepo.create(
            s,
            SpellCreate(
                name=f"Shared Bolt {uuid.uuid4().hex[:4]}",
                level=1,
                school="Evocation",
                casting_time="1 action",
                range="60 feet",
                duration="Instantaneous",
                description="Zap.",
            ),
        ).id


def test_a_dm_cannot_change_the_shared_catalog(client, api_engine):
    """A non-admin DM gets 403 on shared items and spells, and can't delete a spell."""
    dm = "dm_cat1@example.com"
    item_id = _shared_item(api_engine)
    spell_id = _shared_spell(api_engine)
    assert (
        client.patch(f"/api/items/{item_id}", headers=_h(dm), json={"image_url": "x"}).status_code
        == 403
    )
    assert (
        client.patch(f"/api/spells/{spell_id}", headers=_h(dm), json={"school": "X"}).status_code
        == 403
    )
    assert client.delete(f"/api/spells/{spell_id}", headers=_h(dm)).status_code == 403


def test_an_admin_can_change_the_shared_catalog(client, api_engine, monkeypatch):
    """BOOTSTRAP_ADMIN_EMAILS may correct a shared row."""
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "boss@example.com")
    item_id = _shared_item(api_engine)
    resp = client.patch(
        f"/api/items/{item_id}", headers=_h("boss@example.com"), json={"image_url": "/a.png"}
    )
    assert resp.status_code == 200 and resp.json()["image_url"] == "/a.png"


def test_homebrew_is_its_authors(client):
    """The author edits their homebrew; another DM can neither edit nor see it."""
    author, other = "dm_cat2@example.com", "dm_cat3@example.com"
    name = f"Moonglass Shard {uuid.uuid4().hex[:4]}"
    made = client.post(
        "/api/items",
        headers=_h(author),
        json={"name": name, "rarity": "Rare", "item_type": "Wondrous Item", "is_magic": True},
    )
    assert made.status_code == 201
    item = made.json()
    assert item["created_by_email"] == author
    ok = client.patch(f"/api/items/{item['id']}", headers=_h(author), json={"value_gp": 50})
    assert ok.status_code == 200
    no = client.patch(f"/api/items/{item['id']}", headers=_h(other), json={"value_gp": 1})
    assert no.status_code == 403
    mine = [i["name"] for i in client.get(f"/api/items?q={name}", headers=_h(author)).json()]
    theirs = [i["name"] for i in client.get(f"/api/items?q={name}", headers=_h(other)).json()]
    assert mine == [name] and theirs == []


def test_homebrew_spells_are_their_authors(client):
    """A DM's homebrew spell: theirs to edit and delete, invisible to other DMs."""
    author, other = "dm_cat4@example.com", "dm_cat5@example.com"
    name = f"Lantern Ward {uuid.uuid4().hex[:4]}"
    made = client.post(
        "/api/spells",
        headers=_h(author),
        json={
            "name": name,
            "level": 2,
            "school": "Abjuration",
            "casting_time": "1 action",
            "range": "Self",
            "duration": "1 hour",
            "description": "A ward of warm light.",
        },
    )
    assert made.status_code == 201
    spell_id = made.json()["id"]
    assert client.delete(f"/api/spells/{spell_id}", headers=_h(other)).status_code == 403
    assert [s["name"] for s in client.get(f"/api/spells?q={name}", headers=_h(other)).json()] == []
    assert client.delete(f"/api/spells/{spell_id}", headers=_h(author)).status_code == 204


def test_custom_monsters_are_their_authors(client):
    """Only the author changes a custom monster; the SRD rows are admin-only."""
    author, other = "dm_cat6@example.com", "dm_cat7@example.com"
    body = {
        "name": f"Bog Hag {uuid.uuid4().hex[:4]}",
        "size": "Medium",
        "creature_type": "Fey",
        "alignment": "neutral evil",
        "ac": 15,
        "hp_average": 60,
        "hp_formula": "8d8+24",
        "score_str": 16,
        "score_dex": 12,
        "score_con": 16,
        "score_int": 12,
        "score_wis": 14,
        "score_cha": 14,
        "challenge_rating": "3",
        "xp": 700,
        "proficiency_bonus": 2,
    }
    made = client.post("/api/monsters", headers=_h(author), json=body)
    assert made.status_code == 201, made.text
    mid = made.json()["id"]
    assert (
        client.patch(f"/api/monsters/{mid}", headers=_h(author), json={"ac": 16}).status_code == 200
    )
    assert (
        client.patch(f"/api/monsters/{mid}", headers=_h(other), json={"ac": 1}).status_code == 403
    )
    listed = [m["id"] for m in client.get("/api/monsters", headers=_h(other)).json()]
    assert mid not in listed
