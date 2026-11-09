"""Plan 140: a choice step's party switch and the names, through the real routes."""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.character_repo import CharacterRepo
from domain.enums import CharacterClass

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"
_QUEST = {
    "title": "The Cold",
    "steps": [
        {
            "id": "ch",
            "kind": "choice",
            "text": "Four useful things.",
            "party_sees": True,
            "options": [{"label": "Fire", "next": "e"}, {"label": "Lantern", "next": "e"}],
        },
        {"id": "e", "kind": "end", "text": "Morning."},
    ],
}


def _setup(client, api_engine) -> tuple[str, dict, list[str]]:
    """A quest sent to Pip and Bo: (dm, the DM's copy, [Pip's key, Bo's key])."""
    dm = f"dm140_{uuid.uuid4().hex[:8]}@example.com"
    with Session(api_engine) as db:
        campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
        keys, ids = [], []
        for name in ("Pip", "Bo"):
            pc = char_svc.create_character(
                db,
                campaign_id=campaign.id,
                dm_email=dm,
                player_name="P",
                character_name=name,
                race="Human",
                character_class=CharacterClass.ROGUE,
                level=1,
                score_str=10,
                score_dex=10,
                score_con=10,
                score_int=10,
                score_wis=10,
                score_cha=10,
                hp_max=10,
                hp_current=10,
                ac=12,
            )
            ids.append(str(pc.id))
            keys.append(CharacterRepo.get_by_id(db, pc.id).play_token)
        campaign_id = str(campaign.id)
    head = {_AUTH: dm}
    quest = client.post(f"/api/campaigns/{campaign_id}/side-quests", json=_QUEST, headers=head)
    assert quest.status_code == 201, quest.text
    assert quest.json()["steps"][0]["party_sees"] is True
    sent = client.post(
        f"/api/side-quests/{quest.json()['id']}/send", json={"character_ids": ids}, headers=head
    )
    assert sent.status_code == 200, sent.text
    return dm, sent.json()["quest"], keys


def _step(client, key: str) -> dict:
    """The step this link's character is on."""
    run = client.get(f"/api/play/{key}/side-quests").json()[0]["run_id"]
    return client.get(f"/api/play/{key}/side-quests/{run}").json()["step"]


def test_party_picks_routes(client, api_engine):
    """Pip's pick shows on Bo's phone; the DM can switch it off after sending."""
    dm, quest, (pip, bo) = _setup(client, api_engine)
    assert _step(client, bo)["party_sees_pick"] is True

    run = client.get(f"/api/play/{pip}/side-quests").json()[0]["run_id"]
    moved = client.post(
        f"/api/play/{pip}/side-quests/{run}/advance", json={"step_id": "ch", "option": 1}
    )
    assert moved.status_code == 200 and moved.json()["status"] == "done"
    assert [o["taken_by"] for o in _step(client, bo)["options"]] == [[], ["Pip"]]

    steps = quest["steps"]
    steps[0]["party_sees"] = False
    off = client.patch(
        f"/api/side-quests/{quest['id']}", json={"steps": steps}, headers={_AUTH: dm}
    )
    assert off.status_code == 200, off.text
    assert off.json()["steps"][0]["party_sees"] is False
    step = _step(client, bo)
    assert step["party_sees_pick"] is False
    assert [o["taken_by"] for o in step["options"]] == [[], []]
