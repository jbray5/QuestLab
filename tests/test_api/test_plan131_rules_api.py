"""Plan 131 — the campaign's rules over the API: chosen at creation, locked by the first PC."""

import uuid


def _dm() -> str:
    return f"dm131_{uuid.uuid4().hex[:8]}@example.com"


def test_api_create_and_lock(client):
    """POST takes a ruleset; PATCH answers 409 with a plain reason once characters exist."""
    headers = {"X-MS-CLIENT-PRINCIPAL-NAME": _dm()}
    made = client.post(
        "/api/campaigns", json={"name": "API 2014", "ruleset": "2014"}, headers=headers
    )
    assert made.status_code == 201, made.text
    assert made.json()["ruleset"] == "2014"
    cid = made.json()["id"]
    bad = client.patch(f"/api/campaigns/{cid}", json={"ruleset": "1999"}, headers=headers)
    assert bad.status_code == 422
    pc = client.post(
        f"/api/campaigns/{cid}/characters",
        json={
            "player_name": "P",
            "character_name": "Hero",
            "race": "Human",
            "character_class": "Fighter",
            "level": 1,
            "score_str": 15,
            "score_dex": 12,
            "score_con": 14,
            "score_int": 10,
            "score_wis": 10,
            "score_cha": 8,
            "hp_max": 12,
            "hp_current": 12,
            "ac": 16,
        },
        headers=headers,
    )
    assert pc.status_code == 201, pc.text
    assert pc.json()["ruleset"] == "2014"
    locked = client.patch(f"/api/campaigns/{cid}", json={"ruleset": "2024"}, headers=headers)
    assert locked.status_code == 409
    assert "locked" in locked.json()["detail"]
