"""Plan 128 — a pool feature (Lay on Hands, 5 × level points) spends several points at once.

Before, both the phone and the DM's sheet could spend only one use per call, so
a 25-point pool meant 25 taps (or 25 requests).
"""

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from domain.enums import CharacterClass
from services import feature_service

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"
_DM = "dm_pools@example.com"


def _paladin(engine):
    """A level-5 Paladin with its tracked features; return (pc_id, play token)."""
    with Session(engine) as s:
        cid = camp_svc.create_campaign(s, name="Pools", setting="R", tone="T", dm_email=_DM).id
        pc = char_svc.create_character(
            s,
            campaign_id=cid,
            dm_email=_DM,
            player_name="Nina",
            character_name="Mercy",
            race="Human",
            character_class=CharacterClass.PALADIN,
            level=5,
            score_str=16,
            score_dex=10,
            score_con=14,
            score_int=8,
            score_wis=12,
            score_cha=16,
            hp_max=44,
            hp_current=44,
            ac=18,
        )
        feature_service.sync_for_level(s, pc.id, _DM)
        return pc.id, pc.play_token


def _lay_on_hands(client, token):
    rows = client.get(f"/api/play/{token}/features").json()
    return next(r for r in rows if r["feature_name"] == "Lay on Hands")


def test_player_spends_several_points(client, api_engine):
    """The phone spends 7 of the 25 points in one call."""
    _pc_id, token = _paladin(api_engine)
    loh = _lay_on_hands(client, token)
    assert loh["max_uses"] == 25
    resp = client.post(f"/api/play/{token}/features/{loh['id']}/spend?amount=7")
    assert resp.status_code == 200, resp.text
    assert resp.json()["uses_spent"] == 7


def test_spending_more_than_is_left_stops_at_empty(client, api_engine):
    """Asking for more than the pool holds empties it and no further."""
    _pc_id, token = _paladin(api_engine)
    loh = _lay_on_hands(client, token)
    client.post(f"/api/play/{token}/features/{loh['id']}/spend?amount=20")
    resp = client.post(f"/api/play/{token}/features/{loh['id']}/spend?amount=20")
    assert resp.status_code == 200 and resp.json()["uses_spent"] == 25


def test_amount_is_bounded(client, api_engine):
    """Zero, negative and huge amounts are refused."""
    _pc_id, token = _paladin(api_engine)
    loh = _lay_on_hands(client, token)
    for bad in (0, -3, 101):
        resp = client.post(f"/api/play/{token}/features/{loh['id']}/spend?amount={bad}")
        assert resp.status_code == 422


def test_dm_spends_and_gives_back_points(client, api_engine):
    """The DM's sheet spends 5 and gives 2 back, each in one call."""
    pc_id, token = _paladin(api_engine)
    loh = _lay_on_hands(client, token)
    base = f"/api/characters/{pc_id}/features/{loh['id']}"
    assert client.post(f"{base}/spend?amount=5", headers={_AUTH: _DM}).json()["uses_spent"] == 5
    assert client.post(f"{base}/restore?amount=2", headers={_AUTH: _DM}).json()["uses_spent"] == 3
