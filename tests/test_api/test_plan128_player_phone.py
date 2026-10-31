"""Plan 128 (persona run 3): the player's phone names its player and sends feedback.

- ``player_name`` joins the fields a player link may set, 1-100 characters once
  trimmed; everything outside the player's scope is still the DM's.
- ``POST /api/play/{key}/feedback`` files a note in the beta inbox under the
  character (``player:<pc id>``), starting with the character's name. No
  account, and an unknown or replaced link can't send one.
"""

import uuid

from sqlmodel import Session, select

import services.campaign_service as camp_svc
import services.character_service as char_svc
from domain.beta import Feedback
from domain.enums import CharacterClass

_DM = "phone128@example.com"
_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _pc(engine, player_name: str = "Not assigned yet") -> tuple[uuid.UUID, str, str]:
    """Create a campaign and one PC; return (pc_id, play token, character name)."""
    name = f"Ser Corwin Vale {uuid.uuid4().hex[:4]}"
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Phones", setting="R", tone="T", dm_email=_DM)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=_DM,
            player_name=player_name,
            character_name=name,
            race="Dwarf",
            character_class=CharacterClass.PALADIN,
            level=5,
            score_str=17,
            score_dex=10,
            score_con=14,
            score_int=8,
            score_wis=12,
            score_cha=14,
            hp_max=49,
            hp_current=49,
            ac=18,
            speed=30,
        )
        return pc.id, pc.play_token, name


def test_a_player_can_name_themselves(client, api_engine):
    """The phone saves "What should we call you?"; the name is trimmed and the DM sees it."""
    pc_id, token, _name = _pc(api_engine)
    resp = client.patch(f"/api/play/{token}/state", json={"player_name": "  Kemi  "})
    assert resp.status_code == 200, resp.text
    assert resp.json()["player_name"] == "Kemi"
    dm_view = client.get(f"/api/characters/{pc_id}", headers={_AUTH: _DM})
    assert dm_view.status_code == 200 and dm_view.json()["player_name"] == "Kemi"


def test_a_player_name_is_one_to_a_hundred_characters(client, api_engine):
    """Blank, too long and non-text names are refused with a field-level 422; 100 is fine."""
    _pc_id, token, _name = _pc(api_engine)
    for bad in ("", "   ", "x" * 101, 5, None):
        resp = client.patch(f"/api/play/{token}/state", json={"player_name": bad})
        assert resp.status_code == 422, (bad, resp.text)
        detail = resp.json()["detail"]
        assert isinstance(detail, list) and detail[0]["loc"] == ["player_name"]
    ok = client.patch(f"/api/play/{token}/state", json={"player_name": "y" * 100})
    assert ok.status_code == 200 and ok.json()["player_name"] == "y" * 100
    # The rest of the sheet's identity stays the DM's.
    assert (
        client.patch(f"/api/play/{token}/state", json={"character_name": "Mallory"}).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/play/{token}/state", json={"player_name": "Kemi", "level": 9}
        ).status_code
        == 403
    )


def test_a_player_sends_feedback_from_the_phone(client, api_engine):
    """The note lands in the beta inbox under the character, prefixed with its name."""
    pc_id, token, name = _pc(api_engine)
    resp = client.post(
        f"/api/play/{token}/feedback",
        json={
            "kind": "broken",
            "text": "  My heal says force.  ",
            "page": f"/play/{token}?tab=journal",
            "viewport": "390×844",
        },
    )
    assert resp.status_code == 201, resp.text
    with Session(api_engine) as s:
        note = s.exec(select(Feedback).where(Feedback.id == uuid.UUID(resp.json()["id"]))).one()
    assert note.email == f"player:{pc_id}"
    assert note.kind == "broken"
    assert note.text == f"From {name}'s phone: My heal says force."
    assert note.viewport == "390×844"


def test_player_feedback_needs_a_working_link_and_some_words(client, api_engine):
    """An unknown link is a 404 and stores nothing; an empty note is a 422."""
    _pc_id, token, _name = _pc(api_engine)
    unknown = client.post("/api/play/not-a-real-key/feedback", json={"text": "hello"})
    assert unknown.status_code == 404
    empty = client.post(f"/api/play/{token}/feedback", json={"kind": "idea", "text": ""})
    assert empty.status_code == 422
    too_long = client.post(f"/api/play/{token}/feedback", json={"text": "x" * 4001})
    assert too_long.status_code == 422
    with Session(api_engine) as s:
        assert s.exec(select(Feedback)).all() == []


def test_a_reset_link_cannot_send_feedback(client, api_engine):
    """After the DM resets the link, the old key is refused (the new one works)."""
    pc_id, old, _name = _pc(api_engine)
    reset = client.post(f"/api/characters/{pc_id}/play-link/reset", headers={_AUTH: _DM})
    assert reset.status_code == 200, reset.text
    assert client.post(f"/api/play/{old}/feedback", json={"text": "hi"}).status_code == 404
    new = reset.json()["play_key"]
    assert client.post(f"/api/play/{new}/feedback", json={"text": "hi"}).status_code == 201
