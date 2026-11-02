"""Plan 132 — DM homebrew monsters: make, copy, edit, delete (and refuse when in use).

A DM makes a monster from a blank form or by copying any stat block. It is stamped
with their email, shows only in their own lists (and the encounter builder's search),
and only they (or an admin) may change or delete it. A monster still in an encounter
or linked to an NPC is never deleted out from under it: the server says where it is used.
"""

import uuid

from sqlmodel import Session

from db.repos.monster_repo import MonsterRepo
from domain.monster import MonsterStatBlockCreate
from services.arena_service import parse_foe_attacks

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _h(email: str) -> dict:
    return {_AUTH: email}


def _body(name: str) -> dict:
    """A small homebrew stat block in the shape the form sends."""
    return {
        "name": name,
        "source": "Homebrew",
        "size": "Medium",
        "creature_type": "Fey",
        "alignment": "neutral evil",
        "ac": 15,
        "ac_notes": "natural armor",
        "hp_average": 58,
        "hp_formula": "9d8+18",
        "speed": {"walk": 30, "swim": 30},
        "score_str": 16,
        "score_dex": 12,
        "score_con": 14,
        "score_int": 12,
        "score_wis": 14,
        "score_cha": 14,
        "saving_throws": {"wis": 4},
        "skills": {"stealth": 5},
        "damage_resistances": ["Cold"],
        "damage_immunities": [],
        "condition_immunities": ["Charmed"],
        "senses": {"darkvision": 60, "passive_perception": 12},
        "languages": "Common, Sylvan",
        "challenge_rating": "3",
        "xp": 700,
        "proficiency_bonus": 2,
        "traits": [{"name": "Amphibious", "desc": "It can breathe air and water."}],
        "actions": [
            {"name": "Multiattack", "desc": "Two claw attacks."},
            {"name": "Claw", "desc": "+5 to hit, 2d6+3 slashing"},
        ],
        "bonus_actions": [],
        "reactions": [],
        "legendary_actions": [],
    }


def _make(client, email: str, name: str | None = None) -> dict:
    name = name or f"Bog Hag {uuid.uuid4().hex[:6]}"
    made = client.post("/api/monsters", headers=_h(email), json=_body(name))
    assert made.status_code == 201, made.text
    return made.json()


def _srd_goblin(engine) -> uuid.UUID:
    """A shared SRD row (no owner, not custom), as the seed writes it."""
    with Session(engine) as s:
        return MonsterRepo.create(
            s,
            MonsterStatBlockCreate(
                name=f"Goblin {uuid.uuid4().hex[:4]}",
                size="Small",
                creature_type="Humanoid",
                alignment="neutral evil",
                ac=15,
                ac_notes="leather armor, shield",
                hp_average=7,
                hp_formula="2d6",
                speed={"walk": 30},
                score_str=8,
                score_dex=14,
                score_con=10,
                score_int=10,
                score_wis=8,
                score_cha=8,
                challenge_rating="1/4",
                xp=50,
                proficiency_bonus=2,
                actions=[{"name": "Scimitar", "desc": "+4 to hit, 1d6+2 slashing"}],
            ),
        ).id


def _adventure(client, email: str) -> tuple[str, str]:
    """A campaign and an arc for ``email``; returns (campaign_id, adventure_id)."""
    camp = client.post("/api/campaigns", headers=_h(email), json={"name": "Hollowmere"})
    assert camp.status_code == 201, camp.text
    cid = camp.json()["id"]
    adv = client.post(
        f"/api/campaigns/{cid}/adventures", headers=_h(email), json={"title": "The Bog"}
    )
    assert adv.status_code == 201, adv.text
    return cid, adv.json()["id"]


def test_create_stamps_the_dm_and_marks_it_homebrew(client):
    """A new monster is the caller's: custom, stamped with their email, read back whole."""
    dm = "hm_create@example.com"
    m = _make(client, dm)
    assert m["created_by_email"] == dm
    assert m["is_custom"] is True
    assert m["source"] == "Homebrew"
    assert m["actions"][1] == {"name": "Claw", "desc": "+5 to hit, 2d6+3 slashing"}
    assert m["speed"] == {"walk": 30, "swim": 30}


def test_another_dm_cannot_see_it(client):
    """Homebrew lists for its author only; another DM's list never shows it."""
    author, other = "hm_vis1@example.com", "hm_vis2@example.com"
    m = _make(client, author)
    mine = [x["id"] for x in client.get("/api/monsters", headers=_h(author)).json()]
    theirs = [x["id"] for x in client.get("/api/monsters", headers=_h(other)).json()]
    assert m["id"] in mine
    assert m["id"] not in theirs


def test_copy_an_srd_block_makes_a_new_homebrew_row(client, api_engine):
    """Copy and edit: the copy is a new row the DM owns; the SRD original is untouched."""
    dm = "hm_copy@example.com"
    gid = _srd_goblin(api_engine)
    original = client.get(f"/api/monsters/{gid}", headers=_h(dm)).json()
    assert original["created_by_email"] is None and original["is_custom"] is False

    keep = {
        k: v
        for k, v in original.items()
        if k not in {"id", "is_custom", "created_by_email", "image_url", "figure_url", "model_url"}
    }
    # The form sends "SRD" through untouched if the DM leaves it; the server re-labels it.
    copy = {**keep, "name": "Goblin Boss (mine)", "hp_average": 21, "hp_formula": "6d6"}
    made = client.post("/api/monsters", headers=_h(dm), json=copy)
    assert made.status_code == 201, made.text
    m = made.json()
    assert m["id"] != str(gid)
    assert m["created_by_email"] == dm and m["is_custom"] is True
    assert m["source"] == "Homebrew"
    assert m["actions"] == original["actions"]

    again = client.get(f"/api/monsters/{gid}", headers=_h(dm)).json()
    assert again["name"] == original["name"] and again["hp_average"] == 7


def test_edit_is_the_authors_only(client, api_engine):
    """The author edits their homebrew; another DM gets 403, and so does an SRD row."""
    author, other = "hm_edit1@example.com", "hm_edit2@example.com"
    m = _make(client, author)
    ok = client.patch(
        f"/api/monsters/{m['id']}",
        headers=_h(author),
        json={"ac": 17, "actions": [{"name": "Bite", "desc": "+6 to hit, 1d10+4 piercing"}]},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["ac"] == 17 and ok.json()["actions"][0]["name"] == "Bite"

    no = client.patch(f"/api/monsters/{m['id']}", headers=_h(other), json={"ac": 1})
    assert no.status_code == 403

    gid = _srd_goblin(api_engine)
    srd = client.patch(f"/api/monsters/{gid}", headers=_h(author), json={"ac": 1})
    assert srd.status_code == 403


def test_delete_is_refused_while_an_encounter_uses_it(client):
    """In an encounter: 409 naming the encounter. Out of it: deletes (204, then 404)."""
    dm = "hm_del1@example.com"
    m = _make(client, dm, name="Mire Stalker")
    _, adv = _adventure(client, dm)
    enc = client.post(
        f"/api/adventures/{adv}/encounters",
        headers=_h(dm),
        json={
            "name": "Ambush at the ford",
            "monster_roster": [{"monster_id": m["id"], "count": 2}],
        },
    )
    assert enc.status_code == 201, enc.text

    refused = client.delete(f"/api/monsters/{m['id']}", headers=_h(dm))
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert "Mire Stalker" in detail and "Ambush at the ford" in detail
    assert client.get(f"/api/monsters/{m['id']}", headers=_h(dm)).status_code == 200

    cleared = client.patch(
        f"/api/encounters/{enc.json()['id']}", headers=_h(dm), json={"monster_roster": []}
    )
    assert cleared.status_code == 200, cleared.text
    assert client.delete(f"/api/monsters/{m['id']}", headers=_h(dm)).status_code == 204
    assert client.get(f"/api/monsters/{m['id']}", headers=_h(dm)).status_code == 404


def test_delete_is_refused_while_an_npc_uses_it(client):
    """An NPC's combat stat block can't vanish under it either."""
    dm = "hm_del2@example.com"
    m = _make(client, dm, name="Auntie's True Form")
    cid, _ = _adventure(client, dm)
    npc = client.post(
        f"/api/campaigns/{cid}/npcs",
        headers=_h(dm),
        json={"name": "Auntie Sorrel", "monster_stat_block_id": m["id"]},
    )
    assert npc.status_code == 201, npc.text
    refused = client.delete(f"/api/monsters/{m['id']}", headers=_h(dm))
    assert refused.status_code == 409
    assert "Auntie Sorrel" in refused.json()["detail"]


def test_delete_works_unused_and_is_the_authors_only(client, api_engine):
    """An unused homebrew deletes for its author; others and SRD rows are refused."""
    author, other = "hm_del3@example.com", "hm_del4@example.com"
    m = _make(client, author)
    assert client.delete(f"/api/monsters/{m['id']}", headers=_h(other)).status_code == 403
    gid = _srd_goblin(api_engine)
    assert client.delete(f"/api/monsters/{gid}", headers=_h(author)).status_code == 403
    assert client.delete(f"/api/monsters/{m['id']}", headers=_h(author)).status_code == 204
    assert client.delete(f"/api/monsters/{m['id']}", headers=_h(author)).status_code == 404


def test_homebrew_shows_in_the_encounter_builder_search(client):
    """The encounter builder's monster search finds the author's homebrew, and the
    difficulty meter counts it; another DM's search does not find it."""
    author, other = "hm_enc1@example.com", "hm_enc2@example.com"
    name = f"Lantern Wight {uuid.uuid4().hex[:4]}"
    m = _make(client, author, name=name)

    found = client.get("/api/monsters", headers=_h(author), params={"search": "lantern wight"})
    assert [x["id"] for x in found.json()] == [m["id"]]
    hidden = client.get("/api/monsters", headers=_h(other), params={"search": "lantern wight"})
    assert hidden.json() == []

    _, adv = _adventure(client, author)
    preview = client.post(
        f"/api/adventures/{adv}/encounters/preview-difficulty",
        headers=_h(author),
        json={"roster": [{"monster_id": m["id"], "count": 1}]},
    )
    assert preview.status_code == 200, preview.text
    enc = client.post(
        f"/api/adventures/{adv}/encounters",
        headers=_h(author),
        json={
            "name": "Lights in the reeds",
            "monster_roster": [{"monster_id": m["id"], "count": 1}],
        },
    )
    assert enc.status_code == 201, enc.text
    roster = client.get(f"/api/encounters/{enc.json()['id']}", headers=_h(author)).json()[
        "monster_roster"
    ]
    assert roster[0]["name"] == name and roster[0]["xp"] == 700


def test_the_arena_reads_a_homebrew_attack(client):
    """The form writes attacks as the SRD does ("+5 to hit, 2d6+3 slashing …"), so the
    arena rolls a homebrew monster's attacks and its Multiattack like any SRD block."""
    body = _body(f"Reed Hound {uuid.uuid4().hex[:4]}")
    body["actions"] = [
        {"name": "Multiattack", "desc": "Two claw attacks."},
        {
            "name": "Claw",
            "desc": "+5 to hit, 2d6+3 slashing damage. DC 13 Strength save or knocked prone.",
        },
    ]
    made = client.post("/api/monsters", headers=_h("hm_arena@example.com"), json=body)
    assert made.status_code == 201, made.text
    attacks = parse_foe_attacks(made.json()["actions"])
    assert len(attacks) == 1
    claw = attacks[0]
    assert (claw.name, claw.hit_bonus, claw.damage, claw.damage_type, claw.count) == (
        "Claw",
        5,
        "2d6+3",
        "slashing",
        2,
    )
