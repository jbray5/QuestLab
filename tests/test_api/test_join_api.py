"""API-layer tests for the QR join roster endpoint (Plan 63).

GET /play/join/{campaign_id} is unauthenticated by design (capability URL —
the QR is only shown in the room). It must expose names and portraits only,
never sheet stats, and 404 for unknown campaigns.
"""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from domain.enums import CharacterClass


def _seed(engine, dm: str) -> str:
    """Create a campaign with two PCs; return the campaign id as a string."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="C", setting="R", tone="T", dm_email=dm)
        for name, player in (("Willa", "Hayley"), ("Creed", "Cory")):
            char_svc.create_character(
                s,
                campaign_id=campaign.id,
                dm_email=dm,
                player_name=player,
                character_name=name,
                race="Human",
                character_class=CharacterClass.WIZARD,
                level=3,
                score_str=10,
                score_dex=14,
                score_con=14,
                score_int=16,
                score_wis=10,
                score_cha=10,
                hp_max=20,
                hp_current=17,
                ac=14,
                speed=30,
            )
        return str(campaign.id)


def test_join_roster_is_public_and_sorted(client, api_engine):
    """No auth header needed; rows sorted by character name, player-safe shape."""
    cid = _seed(api_engine, "dm@example.com")
    resp = client.get(f"/api/play/join/{cid}")  # no auth header
    assert resp.status_code == 200
    rows = resp.json()
    assert [r["character_name"] for r in rows] == ["Creed", "Willa"]
    assert set(rows[0].keys()) == {"id", "character_name", "player_name", "portrait_url"}
    # No sheet data leaks through the join roster.
    assert "hp" not in resp.text.lower()
    assert "score" not in resp.text.lower()


def test_join_roster_unknown_campaign_404(client):
    """A guessed/stale campaign UUID gets a 404, not a stack trace."""
    resp = client.get(f"/api/play/join/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_player_roll_lands_on_table(client, api_engine):
    """Plan 66 — POST /play/{pc}/roll rolls server-side and names a session."""
    import services.adventure_service as adv_svc
    import services.session_service as sess_svc

    dm = "dm_dice@example.com"
    with Session(api_engine) as s:
        campaign = camp_svc.create_campaign(s, name="C", setting="R", tone="T", dm_email=dm)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name="P",
            character_name="Roller",
            race="Human",
            character_class=CharacterClass.WIZARD,
            level=3,
            score_str=10,
            score_dex=14,
            score_con=14,
            score_int=16,
            score_wis=10,
            score_cha=10,
            hp_max=20,
            hp_current=20,
            ac=14,
            speed=30,
        )
        adventure = adv_svc.create_adventure(
            s,
            campaign_id=campaign.id,
            title="Adv",
            synopsis="s",
            tier="Tier1",
            act_count=3,
            dm_email=dm,
        )
        gs = sess_svc.create_session(
            s,
            adventure_id=adventure.id,
            session_number=1,
            title="S1",
            dm_email=dm,
            date_planned=None,
            attending_pc_ids=[],
        )
        pc_id, sid = str(pc.id), str(gs.id)

    resp = client.post(f"/api/play/{pc_id}/roll", json={"die": "d20", "modifier": 3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == sid
    assert len(body["rolls"]) == 1 and 1 <= body["rolls"][0] <= 20
    assert body["total"] == body["rolls"][0] + 3

    bad = client.post(f"/api/play/{pc_id}/roll", json={"die": "d7"})
    assert bad.status_code == 422  # not a real die


def test_campaign_name_is_player_safe(client, api_engine):
    """Plan 68 — GET /play/{pc}/campaign returns just the name, no auth."""
    cid = _seed(api_engine, "dm_card@example.com")
    roster = client.get(f"/api/play/join/{cid}").json()
    resp = client.get(f"/api/play/{roster[0]['id']}/campaign")
    assert resp.status_code == 200
    assert resp.json() == {"name": "C"}
