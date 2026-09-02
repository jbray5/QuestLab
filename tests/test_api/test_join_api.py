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
