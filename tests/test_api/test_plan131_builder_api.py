"""Plan 131 — the character builder's API in a 2014 campaign.

``GET .../character-builder/options`` (DM) and ``GET /play/join/{cid}/options`` (player) say
which rules the campaign plays by and hand over that edition's tables; ``POST`` builds with
them, refusing 2014 mistakes in plain words (422). A 2024 campaign's payload only gains the
``ruleset`` value and empty 2014-only keys.
"""

from sqlmodel import Session

import services.campaign_service as camp_svc
from db.repos.campaign_repo import CampaignRepo
from db.repos.spell_repo import SpellRepo
from domain.spell import SpellCreate

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
_NEW_KEYS = ("spellbook_size", "unarmored_ac_base_subclass", "subclass_armor", "expanded_spells")


def auth(email: str) -> dict:
    """Trusted identity header dict for a given DM email."""
    return {_AUTH_HEADER: email}


def _seed(engine, dm: str, ruleset: str = "2014") -> str:
    """A campaign in ``ruleset`` with player sign-up on and join code TABLE1; return its id."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(
            s, name="Old School", setting="R", tone="T", dm_email=dm, ruleset=ruleset
        )
        row = CampaignRepo.get_by_id(s, campaign.id)
        row.allow_player_signup = True
        row.join_code = "TABLE1"
        s.add(row)
        # The same spell in both editions: each campaign must see it once.
        for edition in ("2014", "2024"):
            SpellRepo.create(
                s,
                SpellCreate(
                    name="Magic Missile",
                    level=1,
                    school="Evocation",
                    classes=["Sorcerer", "Wizard"],
                    casting_time="1 action",
                    range="120 feet",
                    duration="Instantaneous",
                    description="Three glowing darts.",
                    ruleset=edition,
                ),
            )
        s.commit()
        return str(campaign.id)


def _build(**over) -> dict:
    body = {
        "character_name": "Bruni",
        "player_name": "Not assigned yet",
        "species": "Dwarf",
        "subrace": "Hill Dwarf",
        "character_class": "Fighter",
        "background": "Acolyte",
        "level": 1,
        "scores": {"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10},
        "score_method": "standard",
        "background_bonus": {},
        "skills": ["Athletics", "Perception"],
        "kit": "Chain mail, longsword & shield, light crossbow",
        "class_choices": [{"key": "fighting_style", "picks": ["Defense"]}],
    }
    body.update(over)
    return body


def test_options_say_2014_and_carry_the_2014_tables(client, api_engine):
    dm = "old-dm@example.com"
    cid = _seed(api_engine, dm)
    resp = client.get(f"/api/campaigns/{cid}/character-builder/options", headers=auth(dm))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ruleset"] == "2014"
    names = [s["name"] for s in body["species"]]
    assert "Half-Elf" in names and "Goliath" not in names
    assert [s["name"] for s in body["spells"]].count("Magic Missile") == 1
    assert body["backgrounds"][0]["feat"] is None
    assert body["classes"]["Paladin"]["spellcasting"]["first_level"] == 2
    assert body["spellbook_size"]["Wizard"][2] == 10
    assert body["unarmored_ac_base_subclass"] == {"Draconic Bloodline": 13}
    assert body["choice_kinds"]["dragonborn_ancestry"]["record"] == "Draconic Ancestry"
    assert body["mastery_weapons"] == []
    # The player's door shows the same edition.
    player = client.get(f"/api/play/join/{cid}/options?code=TABLE1")
    assert player.status_code == 200, player.text
    assert player.json()["ruleset"] == "2014"


def test_2024_options_only_gain_empty_keys(client, api_engine):
    dm = "new-dm@example.com"
    cid = _seed(api_engine, dm, ruleset="2024")
    body = client.get(f"/api/campaigns/{cid}/character-builder/options", headers=auth(dm)).json()
    assert body["ruleset"] == "2024"
    assert all(body[k] == {} for k in _NEW_KEYS)
    assert "Goliath" in [s["name"] for s in body["species"]]
    assert [s["name"] for s in body["spells"]].count("Magic Missile") == 1
    assert body["mastery_weapons"]


def test_dm_builds_a_hill_dwarf(client, api_engine):
    dm = "dwarf-dm@example.com"
    cid = _seed(api_engine, dm)
    resp = client.post(f"/api/campaigns/{cid}/character-builder", json=_build(), headers=auth(dm))
    assert resp.status_code == 201, resp.text
    res = resp.json()
    # d10 + CON(+3) + Dwarven Toughness 1; chain mail 16 + shield 2 + Defense 1.
    assert res["hp_max"] == 14 and res["ac"] == 19
    pc = client.get(f"/api/characters/{res['pc_id']}", headers=auth(dm)).json()
    assert pc["race"] == "Hill Dwarf" and pc["ruleset"] == "2014"
    assert pc["score_con"] == 16 and pc["score_wis"] == 13
    assert pc["feats"] == ["Defense"]


def test_player_builds_a_half_orc_barbarian(client, api_engine):
    cid = _seed(api_engine, "orc-dm@example.com")
    body = _build(
        species="Half-Orc",
        subrace=None,
        character_class="Barbarian",
        player_name="Sam",
        skills=["Athletics", "Survival"],
        kit="Greataxe, two handaxes, javelins",
        class_choices=[],
    )
    resp = client.post(f"/api/play/join/{cid}/characters?code=TABLE1", json=body)
    assert resp.status_code == 201, resp.text
    # CON 14 + 1 (+2): d12 + 2; unarmored 10 + DEX(+1) + CON(+2). Menacing: Intimidation.
    assert resp.json()["hp_max"] == 14 and resp.json()["ac"] == 13


def test_2014_mistakes_are_refused_in_plain_words(client, api_engine):
    dm = "strict-dm@example.com"
    cid = _seed(api_engine, dm)
    url = f"/api/campaigns/{cid}/character-builder"
    cases = [
        (_build(background_bonus={"STR": 2, "CON": 1}), "come from your race"),
        (_build(origin_feat="Alert"), "no Origin feats"),
        (_build(subrace=None), "Pick a subrace"),
        (_build(species="Half-Elf", subrace=None), "picks 2 different abilities"),
    ]
    for body, words in cases:
        resp = client.post(url, json=body, headers=auth(dm))
        assert resp.status_code == 422, resp.text
        assert words in resp.json()["detail"]
    assert client.get(f"/api/campaigns/{cid}/characters", headers=auth(dm)).json() == []
