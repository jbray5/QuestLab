"""Plan 126 — the DM's guided character wizard, through the API.

``GET /api/campaigns/{cid}/character-builder/options`` and
``POST /api/campaigns/{cid}/character-builder`` reuse the player's creator with the same rules,
but for the campaign's DM: owner only, no join code, and the "players can create characters"
switch doesn't apply to them.
"""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
from db.repos.campaign_repo import CampaignRepo

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"


def auth(email: str) -> dict:
    """Trusted identity header dict for a given DM email."""
    return {_AUTH_HEADER: email}


def _seed(engine, dm: str, *, signup: bool = False, code: str = "TABLE1") -> str:
    """A campaign with player sign-up OFF and a join code set; return its id."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(
            s, name="Hollowmere", setting="R", tone="T", dm_email=dm
        )
        row = CampaignRepo.get_by_id(s, campaign.id)
        row.allow_player_signup = signup
        row.join_code = code
        s.add(row)
        s.commit()
        return str(campaign.id)


def _build(**over) -> dict:
    body = {
        "character_name": "Sable Quickstep",
        "player_name": "Not assigned yet",
        "species": "Dwarf",
        "character_class": "Fighter",
        "background": "Soldier",
        "level": 1,
        "scores": {"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10},
        "score_method": "standard",
        "background_bonus": {"STR": 2, "CON": 1},
        "skills": ["Athletics", "Perception"],
        "kit": "Chain mail, longsword & shield",
    }
    body.update(over)
    return body


def test_options_need_no_join_code_and_ignore_the_signup_switch(client, api_engine):
    """The player's route is shut (sign-up off, code required); the DM's opens."""
    dm = "wizard-dm@example.com"
    cid = _seed(api_engine, dm)
    assert client.get(f"/api/play/join/{cid}/options").status_code == 403
    assert client.get(f"/api/play/join/{cid}/options?code=TABLE1").status_code == 403

    resp = client.get(f"/api/campaigns/{cid}/character-builder/options", headers=auth(dm))
    assert resp.status_code == 200
    body = resp.json()
    assert body["campaign_name"] == "Hollowmere"
    assert body["asi_levels"]["Fighter"][:2] == [4, 6]
    assert any(f["name"] == "Sentinel" for f in body["feats"])


def test_owner_only(client, api_engine):
    """Another DM gets 403 on both routes; no identity at all gets 401; unknown campaign 404."""
    cid = _seed(api_engine, "owner@example.com")
    other = auth("someone-else@example.com")
    assert (
        client.get(f"/api/campaigns/{cid}/character-builder/options", headers=other).status_code
        == 403
    )
    resp = client.post(f"/api/campaigns/{cid}/character-builder", json=_build(), headers=other)
    assert resp.status_code == 403
    assert client.get(f"/api/campaigns/{cid}/character-builder/options").status_code == 401
    missing = client.get(
        f"/api/campaigns/{uuid.uuid4()}/character-builder/options",
        headers=auth("owner@example.com"),
    )
    assert missing.status_code == 404
    # Nothing was created by the refused build.
    listed = client.get(f"/api/campaigns/{cid}/characters", headers=auth("owner@example.com"))
    assert listed.json() == []


def test_dm_builds_with_signup_off_and_no_code(client, api_engine):
    """The DM's build lands as a real sheet with a player link, the switch notwithstanding."""
    dm = "builder-dm@example.com"
    cid = _seed(api_engine, dm)
    resp = client.post(f"/api/campaigns/{cid}/character-builder", json=_build(), headers=auth(dm))
    assert resp.status_code == 201, resp.text
    res = resp.json()
    assert res["hp_max"] == 13 and res["ac"] == 18 and res["play_key"]
    pcs = client.get(f"/api/campaigns/{cid}/characters", headers=auth(dm)).json()
    assert [(p["character_name"], p["player_name"]) for p in pcs] == [
        ("Sable Quickstep", "Not assigned yet")
    ]
    # The player route is still shut for the same build.
    assert (
        client.post(f"/api/play/join/{cid}/characters?code=TABLE1", json=_build()).status_code
        == 403
    )


def test_dm_level_6_fighter_takes_two_improvements(client, api_engine):
    """Same rules as the player's: the count is checked, the picks land on the sheet."""
    dm = "ladder-dm@example.com"
    cid = _seed(api_engine, dm)
    url = f"/api/campaigns/{cid}/character-builder"
    one = [{"level": 4, "name": "Ability Score Improvement", "asi": {"STR": 2}}]
    resp = client.post(url, json=_build(level=6, asi=one), headers=auth(dm))
    assert resp.status_code == 422
    assert "levels 4 and 6" in resp.json()["detail"]

    two = one + [{"level": 6, "name": "Sentinel", "asi": {"DEX": 1}}]
    resp = client.post(url, json=_build(level=6, asi=two), headers=auth(dm))
    assert resp.status_code == 201, resp.text
    pc = client.get(f"/api/characters/{resp.json()['pc_id']}", headers=auth(dm)).json()
    assert pc["level"] == 6 and pc["score_str"] == 19 and pc["score_dex"] == 14
    assert pc["feats"] == ["Savage Attacker", "Sentinel"]
    # d10+2 at 1, five levels of 6+2, Dwarven Toughness +1 a level.
    assert pc["hp_max"] == 12 + 5 * 8 + 6
