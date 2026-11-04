"""Plan 133 — the character builder's API with the DM's homebrew, and custom origin.

The acceptance path: a DM makes "Hylian" (2014, +2 DEX +1 WIS, Perception, two traits) and a
player picks it from the join link; the sheet carries the traits and the bonuses. Both doors'
options show the DM's homebrew (and only theirs). With custom origin switched on in the
campaign, a Hill Dwarf's bonuses move; with it off, that's refused (422).
"""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
from db.repos.campaign_repo import CampaignRepo

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"
OATH = "Oath of the Triforce"


def _h(email: str) -> dict:
    """The trusted identity header for ``email``."""
    return {_AUTH: email}


def _dm() -> str:
    """A fresh DM email."""
    return f"dm133api_{uuid.uuid4().hex[:8]}@example.com"


def _seed(engine, dm: str, ruleset: str = "2014") -> str:
    """A campaign with player sign-up on and join code ZELDA1; return its id."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(
            s, name="Hyrule", setting="R", tone="T", dm_email=dm, ruleset=ruleset
        )
        row = CampaignRepo.get_by_id(s, campaign.id)
        row.allow_player_signup = True
        row.join_code = "ZELDA1"
        s.add(row)
        s.commit()
        return str(campaign.id)


def _hylian(client, dm: str) -> None:
    """James's Hylian, through the homebrew API."""
    resp = client.post(
        "/api/homebrew/races",
        json={
            "name": "Hylian",
            "ruleset": "2014",
            "ability_bonuses": {"DEX": 2, "WIS": 1},
            "skills": ["Perception"],
            "traits": [
                {"name": "Hylian Ears", "text": "You hear the whispers of the goddess."},
                {"name": "Courage", "text": "Advantage on saves against being frightened."},
            ],
            "languages": "Common and Hylian",
            "hp_per_level": 1,
        },
        headers=_h(dm),
    )
    assert resp.status_code == 201, resp.text


def _oath(client, dm: str) -> None:
    """A Paladin oath with features at 3 and 7, through the homebrew API."""
    resp = client.post(
        "/api/homebrew/subclasses",
        json={
            "name": OATH,
            "character_class": "Paladin",
            "blurb": "Knights sworn to the three golden triangles.",
            "features": [
                {"level": 3, "name": "Triforce Strike", "text": "Spend a Channel Divinity."},
                {"level": 7, "name": "Aura of Wisdom", "text": "Allies add your Wisdom."},
            ],
        },
        headers=_h(dm),
    )
    assert resp.status_code == 201, resp.text


def _build(**over) -> dict:
    """A 2014 level 1 Hylian Fighter, as the wizard sends it."""
    body = {
        "character_name": "Link",
        "player_name": "James",
        "species": "Hylian",
        "character_class": "Fighter",
        "background": "Acolyte",
        "level": 1,
        "scores": {"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10},
        "score_method": "standard",
        "background_bonus": {},
        "skills": ["Athletics", "Survival"],
        "kit": "Chain mail, longsword & shield, light crossbow",
        "class_choices": [{"key": "fighting_style", "picks": ["Defense"]}],
    }
    body.update(over)
    return body


def test_player_picks_the_hylian_from_the_join_link(client, api_engine):
    dm = _dm()
    cid = _seed(api_engine, dm)
    _hylian(client, dm)
    _oath(client, dm)
    opts = client.get(f"/api/play/join/{cid}/options?code=ZELDA1")
    assert opts.status_code == 200, opts.text
    body = opts.json()
    row = next(s for s in body["species"] if s["name"] == "Hylian")
    assert row["homebrew"] is True and row["ability_bonuses"] == {"DEX": 2, "WIS": 1}
    assert body["homebrew_subclasses"]["Paladin"][0]["name"] == OATH
    assert body["subclass_features"][OATH] == {"3": ["Triforce Strike"], "7": ["Aura of Wisdom"]}
    assert body["custom_origin"] is False

    resp = client.post(f"/api/play/join/{cid}/characters?code=ZELDA1", json=_build())
    assert resp.status_code == 201, resp.text
    res = resp.json()
    # d10 + CON (+2) + the Hylian's +1 a level; chain mail 16 + shield 2 + Defense 1.
    assert res["hp_max"] == 13 and res["ac"] == 19
    assert not any("SRD" in w for w in res["warnings"])
    pc = client.get(f"/api/characters/{res['pc_id']}", headers=_h(dm)).json()
    assert pc["race"] == "Hylian"
    assert pc["score_dex"] == 15 and pc["score_wis"] == 13
    assert pc["skill_proficiencies"]["Perception"] == 1
    assert "Hylian Ears — You hear the whispers of the goddess." in pc["notes"]
    assert "Courage — Advantage on saves against being frightened." in pc["notes"]


def test_the_dm_door_shows_only_the_dms_own_homebrew(client, api_engine):
    james, other = _dm(), _dm()
    _hylian(client, james)
    _oath(client, james)
    mine = _seed(api_engine, james)
    theirs = _seed(api_engine, other)
    url = "/api/campaigns/{}/character-builder/options"
    body = client.get(url.format(mine), headers=_h(james)).json()
    assert "Hylian" in [s["name"] for s in body["species"]]
    assert [s["name"] for s in body["homebrew_subclasses"]["Paladin"]] == [OATH]
    body = client.get(url.format(theirs), headers=_h(other)).json()
    assert "Hylian" not in [s["name"] for s in body["species"]]
    assert body["homebrew_subclasses"] == {} and OATH not in body["subclass_features"]


def test_dm_builds_a_paladin_with_the_oath(client, api_engine):
    dm = _dm()
    cid = _seed(api_engine, dm)
    _oath(client, dm)
    body = _build(
        species="Human",
        character_class="Paladin",
        subclass=OATH,
        level=3,
        skills=["Athletics", "Medicine"],
        kit="Chain mail, longsword & shield, javelins",
        class_choices=None,
    )
    resp = client.post(f"/api/campaigns/{cid}/character-builder", json=body, headers=_h(dm))
    assert resp.status_code == 201, resp.text
    assert not any("isn't in the SRD" in w for w in resp.json()["warnings"])
    pc = client.get(f"/api/characters/{resp.json()['pc_id']}", headers=_h(dm)).json()
    assert pc["subclass"] == OATH


def test_custom_origin_follows_the_campaign_switch(client, api_engine):
    dm = _dm()
    cid = _seed(api_engine, dm)
    dwarf = _build(species="Dwarf", subrace="Hill Dwarf", origin_bonus={"DEX": 2, "INT": 1})
    off = client.post(f"/api/campaigns/{cid}/character-builder", json=dwarf, headers=_h(dm))
    assert off.status_code == 422, off.text
    assert "Custom origin is off" in off.text

    on = client.patch(f"/api/campaigns/{cid}", json={"custom_origin": True}, headers=_h(dm))
    assert on.status_code == 200, on.text
    opts = client.get(f"/api/campaigns/{cid}/character-builder/options", headers=_h(dm)).json()
    assert opts["custom_origin"] is True
    resp = client.post(f"/api/campaigns/{cid}/character-builder", json=dwarf, headers=_h(dm))
    assert resp.status_code == 201, resp.text
    pc = client.get(f"/api/characters/{resp.json()['pc_id']}", headers=_h(dm)).json()
    assert (pc["score_dex"], pc["score_int"], pc["score_con"], pc["score_wis"]) == (15, 9, 14, 12)

    same = dict(dwarf, character_name="Gimla", origin_bonus={"DEX": 3})
    bad = client.post(f"/api/campaigns/{cid}/character-builder", json=same, headers=_h(dm))
    assert bad.status_code == 422 and "each onto a different ability" in bad.text


def test_custom_origin_is_refused_in_a_2024_campaign(client, api_engine):
    dm = _dm()
    cid = _seed(api_engine, dm, ruleset="2024")
    body = _build(
        species="Dwarf",
        background="Criminal",
        background_bonus={"DEX": 2, "CON": 1},
        kit="Chain mail, longsword & shield",
        class_choices=None,
        origin_bonus={"DEX": 2},
    )
    resp = client.post(f"/api/campaigns/{cid}/character-builder", json=body, headers=_h(dm))
    assert resp.status_code == 422 and "2024 rules" in resp.text
