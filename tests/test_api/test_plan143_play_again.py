"""Plan 143: play again and no roll, on the real routes."""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.character_repo import CharacterRepo
from domain.enums import CharacterClass

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _quest(creed_id: str) -> dict:
    """A choice, a fire check Creed skips, and an ending."""
    return {
        "title": "Q",
        "steps": [
            {
                "id": "ch",
                "kind": "choice",
                "text": "Pick.",
                "options": [{"label": "Fire", "next": "fire"}, {"label": "B", "next": "e"}],
            },
            {
                "id": "fire",
                "kind": "check",
                "text": "Wet wood.",
                "skills": ["Survival"],
                "dc": 30,
                "pass_next": "lit",
                "fail_next": "e",
                "no_roll": [creed_id],
            },
            {"id": "lit", "kind": "read", "text": "It catches.", "gp": 5, "next": "e"},
            {"id": "e", "kind": "end", "text": "Done."},
        ],
    }


def test_no_roll_and_play_again_routes(client, api_engine):
    """Creed skips the roll from his phone; the DM lets him play again; a stranger can't."""
    dm = f"dm143_{uuid.uuid4().hex[:8]}@example.com"
    with Session(api_engine) as db:
        campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
        pc = char_svc.create_character(
            db,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name="Cory",
            character_name="Creed",
            race="Dragonborn",
            character_class=CharacterClass.PALADIN,
            level=1,
            score_str=10,
            score_dex=10,
            score_con=10,
            score_int=10,
            score_wis=10,
            score_cha=10,
            hp_max=10,
            hp_current=10,
            ac=16,
        )
        key = CharacterRepo.get_by_id(db, pc.id).play_token
        campaign_id, pc_id = str(campaign.id), str(pc.id)
    head = {_AUTH: dm}
    made = client.post(
        f"/api/campaigns/{campaign_id}/side-quests", json=_quest(pc_id), headers=head
    )
    assert made.status_code == 201, made.text
    quest_id = made.json()["id"]
    assert made.json()["steps"][1]["no_roll"] == [pc_id]
    sent = client.post(
        f"/api/side-quests/{quest_id}/send", json={"character_ids": [pc_id]}, headers=head
    )
    run = sent.json()["quest"]["runs"][0]["run_id"]

    play = f"/api/play/{key}/side-quests/{run}"
    client.post(f"{play}/open")
    at_fire = client.post(f"{play}/advance", json={"step_id": "ch", "option": 0}).json()
    assert at_fire["step"]["no_roll"] is True and at_fire["step"]["skills"] == []
    lit = client.post(f"{play}/advance", json={"step_id": "fire"}).json()
    assert lit["step"]["id"] == "lit" and lit["outcome"]["no_roll"] is True

    url = f"/api/side-quests/{quest_id}/runs/{run}/again"
    stranger = {_AUTH: "someone-else@example.com"}
    assert client.post(url, json={}, headers=stranger).status_code == 403
    again = client.post(url, json={"take_back": True}, headers=head)
    assert again.status_code == 200, again.text
    body = again.json()
    assert body["status"] == "new" and body["log"][-1]["kind"] == "again"
    assert body["log"][-1]["taken_gp"] == 5
    fresh = client.get(play).json()
    assert fresh["step"]["id"] == "ch" and fresh["history"] == []
    assert client.post(url, json={}, headers=head).status_code == 409
