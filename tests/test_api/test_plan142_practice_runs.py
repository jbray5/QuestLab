"""Plan 142: practice routes on the real links, and migration 0068."""

import importlib.util
import uuid
from pathlib import Path
from types import SimpleNamespace

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.character_repo import CharacterRepo
from domain.enums import CharacterClass

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"
_QUEST = {
    "title": "Q",
    "steps": [
        {
            "id": "ch",
            "kind": "choice",
            "text": "Pick.",
            "options": [{"label": "A", "next": "e"}, {"label": "B", "next": "e"}],
        },
        {"id": "e", "kind": "end", "text": "Done."},
    ],
}


def test_practice_routes(client, api_engine):
    """Practise as Steven, play, start over from the phone, remove; others can't do any of it."""
    dm = f"dm142_{uuid.uuid4().hex[:8]}@example.com"
    with Session(api_engine) as db:
        campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
        pc = char_svc.create_character(
            db,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name="P",
            character_name="Steven",
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
        key = CharacterRepo.get_by_id(db, pc.id).play_token
        campaign_id, pc_id = str(campaign.id), str(pc.id)
    head = {_AUTH: dm}
    quest = client.post(f"/api/campaigns/{campaign_id}/side-quests", json=_QUEST, headers=head)
    quest_id = quest.json()["id"]

    stranger = {_AUTH: "someone-else@example.com"}
    url = f"/api/side-quests/{quest_id}/practice"
    assert client.post(url, json={"character_id": pc_id}, headers=stranger).status_code == 403
    made = client.post(url, json={"character_id": pc_id}, headers=head)
    assert made.status_code == 200 and made.json()["practice"] is True
    run = made.json()["run_id"]

    play = f"/api/play/{key}/side-quests/{run}"
    assert client.get(f"/api/play/{key}/side-quests").json()[0]["practice"] is True
    done = client.post(f"{play}/advance", json={"step_id": "ch", "option": 0})
    assert done.json()["status"] == "done" and done.json()["practice"] is True
    again = client.post(f"{play}/start-over")
    assert again.status_code == 200 and again.json()["step"]["id"] == "ch"

    gone = client.delete(f"/api/side-quests/{quest_id}/practice/{run}", headers=head)
    assert gone.status_code == 204
    assert client.get(f"/api/play/{key}/side-quests").json() == []


def test_migration_0068(monkeypatch):
    """One NOT NULL boolean on side_quest_runs, default false, on top of 0067."""
    path = Path(__file__).resolve().parents[2] / "alembic" / "versions"
    spec = importlib.util.spec_from_file_location(
        "m0068", path / "0068_side_quest_practice_runs.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    calls: list[tuple] = []
    monkeypatch.setattr(
        module, "op", SimpleNamespace(add_column=lambda table, col: calls.append((table, col)))
    )
    module.upgrade()
    assert module.revision == "0068" and module.down_revision == "0067"
    [(table, col)] = calls
    assert (table, col.name, col.nullable) == ("side_quest_runs", "practice", False)
    assert col.server_default is not None
