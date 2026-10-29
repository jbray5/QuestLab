"""API-layer tests for the level-up guide (Plan 115).

The player routes are capability URLs (no auth header), so they must refuse to level a PC
until the campaign's DM grants it, and the grant route must be DM-only.
"""

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from domain.enums import CharacterClass

DM = "dm@example.com"
HDR = {"X-MS-CLIENT-PRINCIPAL-NAME": DM}


def _seed(engine) -> str:
    """One level-3 rogue; returns its id."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="C", setting="R", tone="T", dm_email=DM)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=DM,
            player_name="Parker",
            character_name="Thane",
            race="Elf",
            character_class=CharacterClass.ROGUE,
            level=3,
            score_str=12,
            score_dex=16,
            score_con=13,
            score_int=14,
            score_wis=12,
            score_cha=8,
            hp_max=23,
            hp_current=23,
            ac=14,
            feats=["Lucky"],
        )
        return str(pc.id)


def test_player_needs_a_grant(client, api_engine):
    pc_id = _seed(api_engine)
    assert client.get(f"/api/play/{pc_id}/level-up").status_code == 404
    body = {"feat": {"name": "Ability Score Improvement", "asi": {"DEX": 2}}}
    assert client.post(f"/api/play/{pc_id}/level-up", json=body).status_code == 422


def test_grant_is_dm_only(client, api_engine):
    pc_id = _seed(api_engine)
    assert client.post(f"/api/characters/{pc_id}/level-up", json={}).status_code == 401
    other = {"X-MS-CLIENT-PRINCIPAL-NAME": "stranger@example.com"}
    assert (
        client.post(f"/api/characters/{pc_id}/level-up", json={}, headers=other).status_code == 403
    )


def test_grant_guide_apply(client, api_engine):
    pc_id = _seed(api_engine)
    r = client.post(f"/api/characters/{pc_id}/level-up", json={}, headers=HDR)
    assert r.status_code == 200 and r.json()["pending_level"] == 4
    assert client.get(f"/api/play/{pc_id}").json()["pending_level"] == 4

    plan = client.get(f"/api/play/{pc_id}/level-up").json()
    assert plan["to_level"] == 4 and plan["hp_average_gain"] == 6
    lucky = next(f for f in plan["feats"] if f["name"] == "Lucky")
    assert not lucky["ok"]

    body = {"feat": {"name": "Ability Score Improvement", "asi": {"DEX": 2}}, "armor": "light"}
    res = client.post(f"/api/play/{pc_id}/level-up", json=body)
    assert res.status_code == 200, res.text
    assert res.json()["level"] == 4 and res.json()["ac"] == 15
    assert client.get(f"/api/play/{pc_id}/level-up").status_code == 404


def test_revoke(client, api_engine):
    pc_id = _seed(api_engine)
    client.post(f"/api/characters/{pc_id}/level-up", json={}, headers=HDR)
    r = client.delete(f"/api/characters/{pc_id}/level-up", headers=HDR)
    assert r.status_code == 200 and r.json()["pending_level"] is None
