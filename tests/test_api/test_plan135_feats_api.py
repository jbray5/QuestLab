"""Plan 135 (FT) — homebrew feats over HTTP: the builder's options and build, the level-up.

A DM makes "Deadeye" (2014, +1 DEX, −5/+10 ranged) through the homebrew API. A player on the
join link sees it in the options (marked homebrew, with its full text) and takes it at a level
4 build; the level-up guide offers it with the same fields and applies it.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
from db.repos.campaign_repo import CampaignRepo

pytestmark = pytest.mark.usefixtures("uuid_play_links")

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _h(email: str) -> dict:
    """The trusted identity header for ``email``."""
    return {_AUTH: email}


def _dm() -> str:
    """A fresh DM email."""
    return f"dm135ftapi_{uuid.uuid4().hex[:8]}@example.com"


def _seed(engine, dm: str) -> str:
    """A 2014 campaign with player sign-up on and join code ZELDA2; return its id."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(
            s, name="Hyrule", setting="R", tone="T", dm_email=dm, ruleset="2014"
        )
        row = CampaignRepo.get_by_id(s, campaign.id)
        row.allow_player_signup = True
        row.join_code = "ZELDA2"
        s.add(row)
        s.commit()
        return str(campaign.id)


def _deadeye(client, dm: str) -> None:
    """James's feat, through the homebrew API."""
    resp = client.post(
        "/api/homebrew/feats",
        json={
            "name": "Deadeye",
            "ruleset": "2014",
            "category": "general",
            "blurb": "Long shots and hard hits.",
            "description": "Your ranged attacks can take −5 to hit for +10 damage.",
            "prerequisite": "",
            "asi_options": ["DEX"],
            "repeatable": False,
            "power_attack": {"to_hit": -5, "damage": 10, "weapons": "ranged"},
        },
        headers=_h(dm),
    )
    assert resp.status_code == 201, resp.text


def _build(level: int, asi: list) -> dict:
    """A 2014 Human Champion Fighter (Archery), as the wizard sends it."""
    return {
        "character_name": f"Sheik {level}",
        "player_name": "James",
        "species": "Human",
        "character_class": "Fighter",
        "subclass": "Champion",
        "background": "Acolyte",
        "level": level,
        "scores": {"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10},
        "score_method": "standard",
        "background_bonus": {},
        "skills": ["Athletics", "Perception"],
        "kit": "Chain mail, longsword & shield, light crossbow",
        "class_choices": [{"key": "fighting_style", "picks": ["Archery"]}],
        "asi": asi,
    }


def test_player_takes_deadeye_at_build_and_on_level_up(client, api_engine):
    dm = _dm()
    cid = _seed(api_engine, dm)
    _deadeye(client, dm)

    opts = client.get(f"/api/play/join/{cid}/options?code=ZELDA2")
    assert opts.status_code == 200, opts.text
    row = next(f for f in opts.json()["feats"] if f["name"] == "Deadeye")
    assert row["homebrew"] is True and row["asi_options"] == ["DEX"]
    assert row["description"].startswith("Your ranged attacks")
    assert row["power_attack"]["damage"] == 10

    url = f"/api/play/join/{cid}/characters?code=ZELDA2"
    pick = {"level": 4, "name": "Deadeye", "asi": {"DEX": 1}, "spells": [], "skills": []}
    built = client.post(url, json=_build(4, [pick]))
    assert built.status_code == 201, built.text
    pc = client.get(f"/api/characters/{built.json()['pc_id']}", headers=_h(dm)).json()
    assert pc["score_dex"] == 15 and pc["feats"] == ["Archery", "Deadeye"]

    wrong = client.post(url, json=_build(4, [{**pick, "asi": {"STR": 1}}]))
    assert wrong.status_code == 422 and "Deadeye can raise only DEX" in wrong.text

    low = client.post(url, json=_build(3, []))
    assert low.status_code == 201, low.text
    pc_id = low.json()["pc_id"]
    grant = client.post(f"/api/characters/{pc_id}/level-up", json={}, headers=_h(dm))
    assert grant.status_code == 200, grant.text
    plan = client.get(f"/api/play/{pc_id}/level-up").json()
    offered = next(f for f in plan["feats"] if f["name"] == "Deadeye")
    assert offered["homebrew"] is True and offered["ok"] is True
    assert offered["power_attack"] == {"to_hit": -5, "damage": 10, "weapons": "ranged"}
    done = client.post(
        f"/api/play/{pc_id}/level-up", json={"feat": {"name": "Deadeye", "asi": {"DEX": 1}}}
    )
    assert done.status_code == 200, done.text
    pc = client.get(f"/api/characters/{pc_id}", headers=_h(dm)).json()
    assert pc["score_dex"] == 15 and pc["feats"] == ["Archery", "Deadeye"]


def test_another_dms_campaign_never_sees_the_feat(client, api_engine):
    james, other = _dm(), _dm()
    _deadeye(client, james)
    theirs = _seed(api_engine, other)
    body = client.get(
        f"/api/campaigns/{theirs}/character-builder/options", headers=_h(other)
    ).json()
    assert "Deadeye" not in [f["name"] for f in body["feats"]]
    assert not any(f.get("homebrew") for f in body["feats"])
