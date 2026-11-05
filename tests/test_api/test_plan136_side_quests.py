"""Plan 136 — the side quest routes, on the real DM identity and the real play link.

Checks the status codes, that the phone's JSON holds no DC or link, that one play link can't reach
another character's run, and migration 0065.
"""

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
    "title": "Title",
    "teaser": "Teaser",
    "steps": [
        {"id": "a", "kind": "read", "text": "Opening words.", "next": "b"},
        {
            "id": "b",
            "kind": "check",
            "text": "A locked door.",
            "skills": ["Stealth"],
            "dc": 1,
            "pass_next": "c",
            "fail_next": "c",
        },
        {"id": "c", "kind": "end", "text": "Well done.", "gp": 25},
    ],
}


def _h(email: str) -> dict:
    """The trusted identity header for ``email``."""
    return {_AUTH: email}


def _setup(api_engine) -> tuple[str, str, str, str]:
    """A DM, their campaign, and two characters with play links."""
    dm = f"dm136_{uuid.uuid4().hex[:8]}@example.com"
    with Session(api_engine) as db:
        campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
        ids = []
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
                score_dex=16,
                score_con=12,
                score_int=10,
                score_wis=10,
                score_cha=10,
                hp_max=10,
                hp_current=10,
                ac=14,
            )
            ids.append(str(pc.id))
        return dm, str(campaign.id), ids[0], ids[1]


def _key(api_engine, pc_id: str) -> str:
    """The character's player-link secret (SEC-002: a new PC's id doesn't open its link)."""
    with Session(api_engine) as db:
        return CharacterRepo.get_by_id(db, uuid.UUID(pc_id)).play_token


def _sent(client, api_engine) -> tuple[str, str, str, str, str]:
    """A quest sent to the first character: (dm, quest id, pc, other pc, run id)."""
    dm, campaign, pc, other = _setup(api_engine)
    made = client.post(f"/api/campaigns/{campaign}/side-quests", json=_QUEST, headers=_h(dm))
    assert made.status_code == 201, made.text
    quest = made.json()["id"]
    sent = client.post(
        f"/api/side-quests/{quest}/send", json={"character_ids": [pc]}, headers=_h(dm)
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["new_runs"] == 1 and sent.json()["ping_error"] is None
    return dm, quest, pc, other, sent.json()["quest"]["runs"][0]["run_id"]


def test_dm_routes(client, api_engine):
    """List, get, patch and delete for the DM; 403 for others; 404 for a missing quest."""
    dm, quest, _pc, _other, _run = _sent(client, api_engine)
    stranger = _h(f"x{uuid.uuid4().hex[:6]}@example.com")
    url = f"/api/side-quests/{quest}"
    got = client.get(url, headers=_h(dm))
    assert got.status_code == 200 and got.json()["steps"][1]["dc"] == 1
    assert client.get(url, headers=stranger).status_code == 403
    assert client.get(url).status_code == 401
    assert client.get(f"/api/side-quests/{uuid.uuid4()}", headers=_h(dm)).status_code == 404
    assert client.patch(url, json={"title": "N"}, headers=stranger).status_code == 403
    assert client.delete(url, headers=stranger).status_code == 403
    assert client.get(f"{url}/runs", headers=stranger).status_code == 403
    assert client.patch(url, json={"title": "New"}, headers=_h(dm)).json()["title"] == "New"
    assert client.get(f"{url}/runs", headers=_h(dm)).json()[0]["character_name"] == "Pip"
    assert client.delete(url, headers=_h(dm)).status_code == 204
    assert client.get(url, headers=_h(dm)).status_code == 404


def test_refusals_are_409_and_422(client, api_engine):
    """A broken quest can't be sent, a sent quest can't be restructured, bad fields are 422s."""
    dm, campaign, pc, _other = _setup(api_engine)
    draft = client.post(
        f"/api/campaigns/{campaign}/side-quests",
        json={"title": "T", "steps": [{"id": "a", "kind": "read", "text": "x"}]},
        headers=_h(dm),
    ).json()
    assert draft["problems"]
    broken = client.post(
        f"/api/side-quests/{draft['id']}/send", json={"character_ids": [pc]}, headers=_h(dm)
    )
    assert broken.status_code == 409 and "what comes next" in broken.json()["detail"]
    bad = client.post(
        f"/api/campaigns/{campaign}/side-quests",
        json={"title": "T", "steps": [{"id": "a", "kind": "read", "image_url": "javascript:x"}]},
        headers=_h(dm),
    )
    assert bad.status_code == 422

    dm, quest, *_ = _sent(client, api_engine)
    steps = [dict(s) for s in _QUEST["steps"]]
    steps[2]["gp"] = 999
    moved = client.patch(f"/api/side-quests/{quest}", json={"steps": steps}, headers=_h(dm))
    assert moved.status_code == 409 and "words and pictures" in moved.json()["detail"]


def test_a_character_outside_the_campaign_is_422(client, api_engine):
    """A send only reaches this campaign's characters."""
    dm, quest, *_ = _sent(client, api_engine)
    _dm2, _c2, outsider, _o2 = _setup(api_engine)
    got = client.post(
        f"/api/side-quests/{quest}/send", json={"character_ids": [outsider]}, headers=_h(dm)
    )
    assert got.status_code == 422


def test_playing_a_quest_on_the_play_link(client, api_engine):
    """Card, open, read, check, ending: gold lands, once, and no secret reaches the JSON."""
    dm, _quest, pc, _other, run = _sent(client, api_engine)
    base = f"/api/play/{_key(api_engine, pc)}/side-quests"
    [card] = client.get(base).json()
    assert (card["run_id"], card["title"], card["status"]) == (run, "Title", "new")

    opened = client.post(f"{base}/{run}/open")
    assert opened.status_code == 200 and opened.json()["status"] == "active"
    at_check = client.post(f"{base}/{run}/advance", json={"step_id": "a"})
    assert at_check.status_code == 200
    body = at_check.text
    assert at_check.json()["step"]["skills"] == [{"name": "Stealth", "bonus": 3}]
    for secret in ('"dc"', "pass_next", "fail_next", '"next"', "Well done"):
        assert secret not in body

    bad = client.post(f"{base}/{run}/advance", json={"step_id": "b", "skill": "Arcana"})
    assert bad.status_code == 422
    done = client.post(f"{base}/{run}/advance", json={"step_id": "b", "skill": "Stealth"})
    assert done.status_code == 200 and done.json()["status"] == "done"
    assert done.json()["outcome"]["gp"] == 25

    again = client.post(f"{base}/{run}/advance", json={"step_id": "b", "skill": "Stealth"})
    assert again.status_code == 200
    assert client.get(f"/api/characters/{pc}", headers=_h(dm)).json()["gp"] == 25


def test_another_play_link_gets_a_404(client, api_engine):
    """One character's link can't reach another's run, and their list stays empty."""
    _dm_email, _quest, _pc, other, run = _sent(client, api_engine)
    base = f"/api/play/{_key(api_engine, other)}/side-quests"
    assert client.get(base).json() == []
    assert client.get(f"{base}/{run}").status_code == 404
    assert client.post(f"{base}/{run}/open").status_code == 404
    assert client.post(f"{base}/{run}/advance", json={"step_id": "a"}).status_code == 404


def test_migration_0065(monkeypatch):
    """Both tables, their indexes and the one-run-per-character rule."""
    path = Path(__file__).resolve().parents[2] / "alembic" / "versions"
    spec = importlib.util.spec_from_file_location("m0065", path / "0065_side_quests.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    calls: list[tuple] = []
    recorder = SimpleNamespace(
        create_table=lambda name, *cols, **kw: calls.append(("table", name, cols)),
        create_index=lambda name, table, cols, **kw: calls.append(("index", table, tuple(cols))),
    )
    monkeypatch.setattr(module, "op", recorder)
    module.upgrade()

    assert module.revision == "0065" and module.down_revision == "0064"
    assert {c[1] for c in calls if c[0] == "table"} == {"side_quests", "side_quest_runs"}
    assert ("index", "side_quests", ("campaign_id",)) in calls
    assert ("index", "side_quest_runs", ("quest_id",)) in calls
    assert ("index", "side_quest_runs", ("character_id",)) in calls
    runs = next(c[2] for c in calls if c[0] == "table" and c[1] == "side_quest_runs")
    assert any(getattr(c, "name", "") == "uq_side_quest_runs_quest_character" for c in runs)
