"""Plan 135 (RS) — the counter routes: the DM's sheet and the player's play link.

``/characters/{id}/resources`` is the DM's (list, add, change, remove, spend, restore);
``/play/{key}/resources`` lets the player list, spend and restore their own character's
counters, and nobody else's.
"""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.homebrew_service as hb_svc
from domain.enums import CharacterClass
from domain.homebrew import HomebrewSubclassCreate

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"

SUPERIORITY = {
    "name": "Superiority Dice",
    "level": 3,
    "recovery": "short",
    "uses": {"3": 4, "7": 5, "15": 6},
    "die": {"3": "d8", "10": "d10", "18": "d12"},
}


def _dm() -> str:
    """A fresh DM email."""
    return f"dm135api_{uuid.uuid4().hex[:8]}@example.com"


def _table(engine, dm: str, level: int = 10):
    """A 2014 campaign, the DM's Battle Master-style subclass and two Fighters.

    Returns:
        ``(pc_id, pc_token, friend_id, friend_token)``.
    """
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(
            s, name="Hyrule", setting="R", tone="T", dm_email=dm, ruleset="2014"
        )
        hb_svc.create_subclass(
            s,
            HomebrewSubclassCreate(
                name="Sheikah Blade", character_class="Fighter", resources=[SUPERIORITY]
            ),
            dm,
        )
        out = []
        for name in ("Impa", "Paya"):
            pc = char_svc.create_character(
                s,
                campaign_id=campaign.id,
                dm_email=dm,
                player_name="James",
                character_name=name,
                race="Human",
                character_class=CharacterClass.FIGHTER,
                subclass="Sheikah Blade",
                level=level,
                score_str=16,
                score_dex=14,
                score_con=14,
                score_int=10,
                score_wis=12,
                score_cha=8,
                hp_max=80,
                hp_current=80,
                ac=18,
            )
            out += [str(pc.id), pc.play_token]
        return tuple(out)


def test_dm_sees_spends_and_rests_a_subclass_counter(client, api_engine):
    """5 × d10 at level 10; spend one → 4 left; a short rest refills and reports it."""
    dm = _dm()
    h = {_AUTH: dm}
    pc, *_ = _table(api_engine, dm)
    r = client.get(f"/api/characters/{pc}/resources", headers=h)
    assert r.status_code == 200, r.text
    [dice] = r.json()
    assert (dice["source"], dice["max_uses"], dice["die"], dice["uses_spent"]) == (
        "subclass",
        5,
        "d10",
        0,
    )
    r = client.post(f"/api/characters/{pc}/resources/{dice['id']}/spend", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["max_uses"] - r.json()["uses_spent"] == 4
    r = client.post(f"/api/characters/{pc}/rest/short", headers=h)
    assert "Superiority Dice" in r.json()["features_restored"]
    assert client.get(f"/api/characters/{pc}/resources", headers=h).json()[0]["uses_spent"] == 0


def test_dm_manages_hand_made_counters(client, api_engine):
    """Add (201), change, spend, restore and remove (204) a hand-made counter."""
    dm = _dm()
    h = {_AUTH: dm}
    pc, *_ = _table(api_engine, dm)
    body = {"name": "Fighting Spirit", "max_uses": 3, "die": "none", "recovery": "long"}
    r = client.post(f"/api/characters/{pc}/resources", json=body, headers=h)
    assert r.status_code == 201, r.text
    made = r.json()
    assert (made["source"], made["die"], made["max_uses"]) == ("custom", None, 3)
    url = f"/api/characters/{pc}/resources/{made['id']}"
    r = client.patch(url, json={"max_uses": 4, "die": "d6"}, headers=h)
    assert (r.json()["max_uses"], r.json()["die"]) == (4, "d6")
    assert client.post(f"{url}/spend?amount=2", headers=h).json()["uses_spent"] == 2
    assert client.post(f"{url}/restore", headers=h).json()["uses_spent"] == 1
    names = [c["name"] for c in client.get(f"/api/characters/{pc}/resources", headers=h).json()]
    assert names == ["Superiority Dice", "Fighting Spirit"]
    assert client.post(f"/api/characters/{pc}/resources", json=body, headers=h).status_code == 409
    assert client.delete(url, headers=h).status_code == 204
    assert client.delete(url, headers=h).status_code == 404


def test_subclass_counter_cant_be_edited_on_the_sheet(client, api_engine):
    """PATCH or DELETE on a subclass counter is a 409 that points at the subclass."""
    dm = _dm()
    h = {_AUTH: dm}
    pc, *_ = _table(api_engine, dm)
    rid = client.get(f"/api/characters/{pc}/resources", headers=h).json()[0]["id"]
    r = client.patch(f"/api/characters/{pc}/resources/{rid}", json={"max_uses": 9}, headers=h)
    assert r.status_code == 409 and "subclass" in r.json()["detail"]
    assert client.delete(f"/api/characters/{pc}/resources/{rid}", headers=h).status_code == 409


def test_bad_counter_bodies_are_422(client, api_engine):
    """A die that isn't d4–d12, or 0 uses, never reaches the service."""
    dm = _dm()
    h = {_AUTH: dm}
    pc, *_ = _table(api_engine, dm)
    for body in ({"name": "X", "max_uses": 3, "die": "d7"}, {"name": "X", "max_uses": 0}):
        assert (
            client.post(f"/api/characters/{pc}/resources", json=body, headers=h).status_code == 422
        )


def test_strangers_are_refused(client, api_engine):
    """Another DM gets 403 everywhere; no identity is a 401."""
    dm = _dm()
    pc, *_ = _table(api_engine, dm)
    rid = client.get(f"/api/characters/{pc}/resources", headers={_AUTH: dm}).json()[0]["id"]
    other = {_AUTH: _dm()}
    assert client.get(f"/api/characters/{pc}/resources", headers=other).status_code == 403
    assert (
        client.post(f"/api/characters/{pc}/resources/{rid}/spend", headers=other).status_code == 403
    )
    body = {"name": "Mine", "max_uses": 2}
    assert (
        client.post(f"/api/characters/{pc}/resources", json=body, headers=other).status_code == 403
    )
    assert client.get(f"/api/characters/{pc}/resources").status_code == 401


def test_play_link_spends_and_restores_its_own_counters(client, api_engine):
    """The player's link lists, spends and restores; another character's link can't spend."""
    dm = _dm()
    pc, token, _friend, friend_token = _table(api_engine, dm)
    r = client.get(f"/api/play/{token}/resources")
    assert r.status_code == 200, r.text
    [dice] = r.json()
    assert (dice["max_uses"], dice["die"]) == (5, "d10")
    r = client.post(f"/api/play/{token}/resources/{dice['id']}/spend")
    assert r.status_code == 200 and r.json()["uses_spent"] == 1
    r = client.post(f"/api/play/{token}/resources/{dice['id']}/restore")
    assert r.status_code == 200 and r.json()["uses_spent"] == 0

    assert client.post(f"/api/play/{friend_token}/resources/{dice['id']}/spend").status_code == 404
    made = client.post(
        f"/api/characters/{pc}/resources",
        json={"name": "Luck", "max_uses": 3},
        headers={_AUTH: dm},
    ).json()
    assert client.post(f"/api/play/{friend_token}/resources/{made['id']}/spend").status_code == 404
    assert client.post(f"/api/play/{token}/resources/{made['id']}/spend").status_code == 200
    # The player can't add or change counters: there's no such route on the link.
    assert client.post(f"/api/play/{token}/resources", json={"name": "X"}).status_code == 405
