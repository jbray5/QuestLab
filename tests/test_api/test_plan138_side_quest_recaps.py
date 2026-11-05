"""Plan 138: the recap routes, on the real play link, and migration 0066."""

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
    "title": "Hidden Title",
    "teaser": "Teaser",
    "steps": [
        {"id": "a", "kind": "read", "text": "Words.", "next": "b"},
        {"id": "b", "kind": "end", "text": "Done."},
    ],
}


def _setup(client, api_engine) -> tuple[str, str, str, str]:
    """A quest sent to one of two characters: (dm, quest id, its link key, the other's link key)."""
    dm = f"dm138_{uuid.uuid4().hex[:8]}@example.com"
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
    quest_id = quest.json()["id"]
    sent = client.post(
        f"/api/side-quests/{quest_id}/send", json={"character_ids": [ids[0]]}, headers=head
    )
    assert sent.status_code == 200, sent.text
    return dm, quest_id, keys[0], keys[1]


def test_recap_routes(client, api_engine):
    """Too soon is a 409; a share reaches the other link; another link can't write; empty clears."""
    dm, quest_id, key, other = _setup(client, api_engine)
    run = client.get(f"/api/play/{key}/side-quests").json()[0]["run_id"]
    url = f"/api/play/{key}/side-quests/{run}/recap"

    assert client.get(f"/api/play/{other}/side-quests/recaps").json() == []
    assert client.put(url, json={"text": "Too soon"}).status_code == 409

    client.post(f"/api/play/{key}/side-quests/{run}/open")
    done = client.post(f"/api/play/{key}/side-quests/{run}/advance", json={"step_id": "a"})
    assert done.json()["status"] == "done"

    shared = client.put(url, json={"text": "A bat scared me off."})
    assert shared.status_code == 200 and shared.json()["recap"] == "A bat scared me off."
    assert (
        client.get(f"/api/play/{key}/side-quests/{run}").json()["recap"] == "A bat scared me off."
    )

    seen = client.get(f"/api/play/{other}/side-quests/recaps")
    assert seen.status_code == 200
    assert [(r["character_name"], r["text"], r["mine"]) for r in seen.json()] == [
        ("Pip", "A bat scared me off.", False)
    ]
    assert "Hidden Title" not in seen.text and run not in seen.text

    results = client.get(f"/api/side-quests/{quest_id}/runs", headers={_AUTH: dm})
    assert results.json()[0]["recap"] == "A bat scared me off."

    theirs = f"/api/play/{other}/side-quests/{run}/recap"
    assert client.put(theirs, json={"text": "Not mine"}).status_code == 404
    assert client.put(url, json={"text": "x" * 1501}).status_code == 422
    assert client.put(url, json={"text": ""}).json()["recap"] is None
    assert client.get(f"/api/play/{other}/side-quests/recaps").json() == []


def test_a_bad_link_gets_nothing(client):
    """An unknown link is a 404, for the list and for a write."""
    bad = uuid.uuid4().hex
    assert client.get(f"/api/play/{bad}/side-quests/recaps").status_code == 404
    url = f"/api/play/{bad}/side-quests/{uuid.uuid4()}/recap"
    assert client.put(url, json={"text": "x"}).status_code == 404


def test_migration_0066(monkeypatch):
    """Two nullable columns on side_quest_runs, on top of 0065."""
    path = Path(__file__).resolve().parents[2] / "alembic" / "versions"
    spec = importlib.util.spec_from_file_location("m0066", path / "0066_side_quest_recaps.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    calls: list[tuple] = []
    monkeypatch.setattr(
        module, "op", SimpleNamespace(add_column=lambda table, col: calls.append((table, col)))
    )
    module.upgrade()
    assert module.revision == "0066" and module.down_revision == "0065"
    assert [(table, col.name, col.nullable) for table, col in calls] == [
        ("side_quest_runs", "recap", True),
        ("side_quest_runs", "recap_at", True),
    ]
