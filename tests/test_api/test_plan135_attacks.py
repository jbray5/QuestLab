"""Plan 135 (RA) — natural attacks and the power-attack toggle over the API.

The DM's sheet reads ``GET /characters/{id}/natural-attacks`` (campaign DM only) and the
attack preview's ``power_attack``; the phone reads both from ``/play/{pc}/turn-kit``.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.homebrew_service as hb_svc
import services.item_service as item_svc
from domain.enums import CharacterClass, ItemRarity
from domain.homebrew import HomebrewFeatCreate, HomebrewRaceCreate
from domain.item import ItemCreate

# The phone is addressed by UUID here (pre-token links); see conftest.uuid_play_links.
pytestmark = pytest.mark.usefixtures("uuid_play_links")

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _h(email: str) -> dict:
    """The trusted identity header for ``email``."""
    return {_AUTH: email}


def _setup(engine) -> tuple[str, str, str]:
    """A 2014 campaign whose DM has a clawed race and Deadeye; a PC with both; a longbow.

    Returns:
        ``(dm email, pc id, longbow id)``.
    """
    dm = f"dm135raapi_{uuid.uuid4().hex[:8]}@example.com"
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Hyrule", dm_email=dm, ruleset="2014")
        hb_svc.create_race(
            s,
            HomebrewRaceCreate(
                name="Lizardfolk",
                natural_weapons=[
                    {"name": "Bite", "damage": "1d6", "damage_type": "piercing", "note": "reach 5"}
                ],
            ),
            dm,
        )
        hb_svc.create_feat(
            s,
            HomebrewFeatCreate(
                name="Deadeye",
                ruleset="2014",
                power_attack={"to_hit": -5, "damage": 10, "weapons": "ranged"},
            ),
            dm,
        )
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name="James",
            character_name="Tiss",
            race="Lizardfolk",
            character_class=CharacterClass.RANGER,
            level=1,
            score_str=16,
            score_dex=14,
            score_con=14,
            score_int=10,
            score_wis=12,
            score_cha=8,
            hp_max=12,
            hp_current=12,
            ac=14,
            feats=["Deadeye"],
        )
        bow = item_svc.create_item(
            s,
            ItemCreate(
                name=f"Longbow {uuid.uuid4().hex[:6]}",
                rarity=ItemRarity.COMMON,
                item_type="Weapon",
                value_gp=50,
                weapon_category="Martial Ranged",
                damage_die="1d8",
                damage_type="piercing",
                weapon_properties=["Ammunition", "Heavy", "Two-Handed"],
            ),
        )
        return dm, str(pc.id), str(bow.id)


def test_natural_attacks_route(client, api_engine):
    """The campaign's DM gets the Bite; another DM a 403; a missing PC a 404; no one a 401."""
    dm, pc, _ = _setup(api_engine)
    r = client.get(f"/api/characters/{pc}/natural-attacks", headers=_h(dm))
    assert r.status_code == 200, r.text
    [bite] = r.json()
    assert bite["name"] == "Bite" and bite["hit_bonus"] == 5
    assert bite["damage_roll"] == "1d6+3" and bite["damage_type"] == "piercing"
    assert bite["note"] == "reach 5" and bite["power_attack"] is None
    other = client.get(f"/api/characters/{pc}/natural-attacks", headers=_h("x135@example.com"))
    assert other.status_code == 403
    missing = client.get(f"/api/characters/{uuid.uuid4()}/natural-attacks", headers=_h(dm))
    assert missing.status_code == 404
    assert client.get(f"/api/characters/{pc}/natural-attacks").status_code == 401


def test_attack_preview_carries_the_toggle_for_the_dm(client, api_engine):
    """The longbow preview offers Deadeye's −5/+10 to the DM; anyone else is refused."""
    dm, pc, bow = _setup(api_engine)
    url = f"/api/items/{bow}/attack-preview?character_id={pc}"
    mine = client.post(url, headers=_h(dm)).json()
    assert mine["power_attack"] == {"to_hit": -5, "damage": 10, "feat": "Deadeye"}
    assert mine["hit_bonus"] == 4 and mine["damage_roll"] == "1d8+2"
    # Plan 135 (lead): only the campaign's DM may preview a PC (was: anyone signed in).
    assert client.post(url, headers=_h("y135@example.com")).status_code == 403
    missing = f"/api/items/{bow}/attack-preview?character_id={uuid.uuid4()}"
    assert client.post(missing, headers=_h(dm)).status_code == 404
    assert client.post(url).status_code == 401


def test_turn_kit_has_the_bite_and_the_bow_toggle(client, api_engine):
    """The phone's kit lists the Bite as a natural attack and the bow with the toggle."""
    dm, pc, bow = _setup(api_engine)
    added = client.post(
        f"/api/characters/{pc}/inventory", headers=_h(dm), json={"item_id": bow, "equipped": True}
    )
    assert added.status_code == 201, added.text
    kit = client.get(f"/api/play/{pc}/turn-kit")
    assert kit.status_code == 200, kit.text
    by_key = {o["key"]: o for o in kit.json()["action"]}
    bite = by_key["n-0"]
    assert (bite["kind"], bite["to_hit"], bite["damage"]) == ("natural", 5, "1d6+3")
    assert bite["note"] == "STR · piercing · natural · reach 5"
    assert by_key[f"w-{bow}"]["power_attack"]["feat"] == "Deadeye"
