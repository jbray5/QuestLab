"""Plan 139: a player's answers stay with the DM, and the party's list can't open another phone.

Written from the snooper's side: what can one player get by going looking? Players do nothing new,
so every link that opened a character before still opens it.
"""

import importlib.util
import uuid
from pathlib import Path
from types import SimpleNamespace

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"
_SECRET = "My grandmother's letters."
_QUEST = {
    "title": "The First Night",
    "teaser": "It's cold.",
    "start_step": "a",
    "steps": [
        {"id": "a", "kind": "reply", "text": "What would you never burn?", "next": "b"},
        {"id": "b", "kind": "end", "text": "You don't sleep much."},
    ],
}


def _h(email: str) -> dict:
    """The trusted identity header for ``email``."""
    return {_AUTH: email}


def _character(name: str) -> dict:
    """A character body for the DM's create route."""
    return {
        "player_name": f"{name}'s player",
        "character_name": name,
        "race": "Human",
        "character_class": "Rogue",
        "level": 1,
        "score_str": 10,
        "score_dex": 14,
        "score_con": 10,
        "score_int": 10,
        "score_wis": 10,
        "score_cha": 10,
        "hp_max": 10,
        "hp_current": 10,
        "ac": 12,
    }


def _party(client) -> tuple[str, str, dict, dict]:
    """A DM, their campaign, and two characters: (dm, campaign id, Pip, Bo)."""
    dm = f"dm139_{uuid.uuid4().hex[:8]}@example.com"
    made = client.post(
        "/api/campaigns", json={"name": "C", "setting": "S", "tone": "T"}, headers=_h(dm)
    )
    assert made.status_code == 201, made.text
    cid = made.json()["id"]
    pcs = []
    for name in ("Pip", "Bo"):
        pc = client.post(f"/api/campaigns/{cid}/characters", json=_character(name), headers=_h(dm))
        assert pc.status_code == 201, pc.text
        pcs.append(pc.json())
    return dm, cid, pcs[0], pcs[1]


def _roster(client, cid: str) -> dict[str, dict]:
    """The party's list as a stranger gets it, by character name."""
    resp = client.get(f"/api/play/join/{cid}")
    assert resp.status_code == 200, resp.text
    return {row["character_name"]: row for row in resp.json()}


def _claim(client, pc: dict) -> None:
    """A phone starts using this character."""
    assert client.post(f"/api/play/{pc['play_token']}/claim").status_code == 200


def test_the_list_opens_a_character_nobody_has(client):
    """A character the DM just made can still be picked: that's how a player first gets in."""
    _dm, cid, pip, _bo = _party(client)
    row = _roster(client, cid)["Pip"]
    assert row["key"] == pip["play_token"] and row["claimed"] is False


def test_the_list_cant_open_a_character_a_player_has(client):
    """The key is nowhere in the response. Their own link still opens, and others are untouched."""
    _dm, cid, pip, bo = _party(client)
    _claim(client, pip)

    assert pip["play_token"] not in client.get(f"/api/play/join/{cid}").text
    rows = _roster(client, cid)
    assert rows["Pip"]["key"] is None and rows["Pip"]["claimed"] is True
    assert rows["Bo"]["key"] == bo["play_token"] and rows["Bo"]["claimed"] is False
    assert client.get(f"/api/play/{pip['play_token']}").status_code == 200


def test_claiming_again_keeps_the_first_time(client):
    """Every open of the phone says so, and only the first one counts."""
    dm, _cid, pip, _bo = _party(client)
    _claim(client, pip)
    first = client.get(f"/api/characters/{pip['id']}", headers=_h(dm)).json()["claimed_at"]
    assert first
    _claim(client, pip)
    assert client.get(f"/api/characters/{pip['id']}", headers=_h(dm)).json()["claimed_at"] == first


def test_the_phone_is_not_told_about_claims(client):
    """The player's copy of the sheet holds neither the claim nor the secret."""
    _dm, _cid, pip, _bo = _party(client)
    _claim(client, pip)
    body = client.get(f"/api/play/{pip['play_token']}").json()
    assert "claimed_at" not in body and "play_token" not in body


def test_a_dead_link_cant_claim_anything(client):
    """A key that opens nothing gets a 404."""
    assert client.post("/api/play/not-a-real-key/claim").status_code == 404


def test_a_character_built_on_the_join_page_starts_claimed(client, api_engine):
    """Whoever built it has it. Their key comes back to them, and not to the list."""
    dm, cid, _pip, _bo = _party(client)
    with Session(api_engine) as db:
        row = CampaignRepo.get_by_id(db, uuid.UUID(cid))
        row.allow_player_signup = True
        db.add(row)
        db.commit()
    build = {
        "character_name": "Sable",
        "player_name": "Not assigned yet",
        "species": "Dwarf",
        "character_class": "Fighter",
        "background": "Soldier",
        "level": 1,
        "scores": {"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10},
        "score_method": "standard",
        "background_bonus": {"STR": 2, "CON": 1},
        "skills": ["Athletics", "Perception"],
        "kit": "Chain mail, longsword & shield",
    }
    made = client.post(f"/api/play/join/{cid}/characters", json=build)
    assert made.status_code == 201, made.text
    assert made.json()["play_key"]
    assert client.get(f"/api/play/{made.json()['play_key']}").status_code == 200
    assert made.json()["play_key"] not in client.get(f"/api/play/join/{cid}").text
    assert _roster(client, cid)["Sable"]["key"] is None


def test_a_character_the_dm_builds_stays_open_for_its_player(client):
    """The DM's own builder isn't a phone: the player still picks it from the list."""
    dm, cid, _pip, _bo = _party(client)
    body = _character("Wren")
    made = client.post(f"/api/campaigns/{cid}/characters", json=body, headers=_h(dm))
    assert made.status_code == 201, made.text
    assert _roster(client, cid)["Wren"]["key"] == made.json()["play_token"]


def test_only_the_owner_can_reopen_a_character(client):
    """Another DM gets 403, no identity gets 401, a missing character 404. Then the owner can."""
    dm, cid, pip, _bo = _party(client)
    _claim(client, pip)
    url = f"/api/characters/{pip['id']}/play-link/release"

    assert client.post(url, headers=_h("someone-else@example.com")).status_code == 403
    assert client.post(url).status_code == 401
    missing = f"/api/characters/{uuid.uuid4()}/play-link/release"
    assert client.post(missing, headers=_h(dm)).status_code == 404
    assert _roster(client, cid)["Pip"]["key"] is None

    assert client.post(url, headers=_h(dm)).status_code == 200
    row = _roster(client, cid)["Pip"]
    assert row["key"] == pip["play_token"] and row["claimed"] is False
    assert client.get(f"/api/play/{pip['play_token']}").status_code == 200


def test_a_reset_doesnt_reopen_the_list(client):
    """Whoever just lost the link can't pick the character again, and the new key isn't listed."""
    dm, cid, pip, _bo = _party(client)
    _claim(client, pip)
    reset = client.post(f"/api/characters/{pip['id']}/play-link/reset", headers=_h(dm))
    assert reset.status_code == 200, reset.text
    new = reset.json()["play_key"]

    listed = client.get(f"/api/play/join/{cid}").text
    assert new not in listed and pip["play_token"] not in listed
    assert _roster(client, cid)["Pip"]["key"] is None
    assert client.get(f"/api/play/{new}").status_code == 200


def _sent(client) -> tuple[str, str, str, dict, str]:
    """A one-question quest, sent to Pip: (dm, quest id, run id, Pip, the phone's base URL)."""
    dm, cid, pip, _bo = _party(client)
    quest = client.post(f"/api/campaigns/{cid}/side-quests", json=_QUEST, headers=_h(dm))
    assert quest.status_code == 201, quest.text
    qid = quest.json()["id"]
    sent = client.post(
        f"/api/side-quests/{qid}/send", json={"character_ids": [pip["id"]]}, headers=_h(dm)
    )
    assert sent.status_code == 200, sent.text
    run = sent.json()["quest"]["runs"][0]["run_id"]
    return dm, qid, run, pip, f"/api/play/{pip['play_token']}/side-quests"


def test_a_sent_answer_never_comes_back_through_a_link(client):
    """Not from the move, the rereading, the list or the recaps. The DM still reads it."""
    dm, qid, run, _pip, base = _sent(client)
    assert client.post(f"{base}/{run}/open").status_code == 200
    moved = client.post(f"{base}/{run}/advance", json={"step_id": "a", "reply": _SECRET})
    assert moved.status_code == 200, moved.text
    assert _SECRET not in moved.text

    read = client.get(f"{base}/{run}")
    assert read.status_code == 200 and _SECRET not in read.text
    assert _SECRET not in client.get(base).text
    assert _SECRET not in client.get(f"{base}/recaps").text

    [answered] = [h for h in read.json()["history"] if h["step_id"] == "a"]
    assert answered["replied"] is True and "reply" not in answered

    [dm_run] = client.get(f"/api/side-quests/{qid}/runs", headers=_h(dm)).json()
    assert any(entry["reply"] == _SECRET for entry in dm_run["log"])


def test_an_unanswered_step_doesnt_say_it_was(client):
    """A step they only read has no answer on it."""
    dm, cid, pip, _bo = _party(client)
    quest = dict(_QUEST)
    quest["start_step"] = "r"
    quest["steps"] = [
        {"id": "r", "kind": "read", "text": "It's cold.", "next": "a"},
        *_QUEST["steps"],
    ]
    made = client.post(f"/api/campaigns/{cid}/side-quests", json=quest, headers=_h(dm))
    assert made.status_code == 201, made.text
    sent = client.post(
        f"/api/side-quests/{made.json()['id']}/send",
        json={"character_ids": [pip["id"]]},
        headers=_h(dm),
    )
    run = sent.json()["quest"]["runs"][0]["run_id"]
    base = f"/api/play/{pip['play_token']}/side-quests"
    client.post(f"{base}/{run}/open")
    view = client.post(f"{base}/{run}/advance", json={"step_id": "r"}).json()
    [passed] = [h for h in view["history"] if h["step_id"] == "r"]
    assert passed["replied"] is False


def test_migration_0067(monkeypatch):
    """Adds the column, then claims only characters with a real player name."""
    path = Path(__file__).resolve().parents[2] / "alembic" / "versions"
    spec = importlib.util.spec_from_file_location("m0067", path / "0067_character_claims.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    calls: list[tuple] = []
    recorder = SimpleNamespace(
        add_column=lambda table, col: calls.append(("add", table, col.name, col.nullable)),
        execute=lambda sql: calls.append(("sql", sql)),
    )
    monkeypatch.setattr(module, "op", recorder)
    module.upgrade()

    assert module.revision == "0067" and module.down_revision == "0066"
    assert calls[0] == ("add", "player_characters", "claimed_at", True)
    sql = calls[1][1].lower()
    assert sql.startswith("update player_characters set claimed_at")
    assert "player_name is not null" in sql and "not assigned yet" in sql
