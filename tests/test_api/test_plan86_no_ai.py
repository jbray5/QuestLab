"""Plans 86 and 124 — QuestLab has no generative AI: the generation routes are gone.

Plan 86 hid them behind ``AI_FEATURES``; Plan 124 deleted them. These tests pin
that every former generation endpoint is absent from the app (no route, so a
404 or 405), while the non-AI neighbours that share their paths still work.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
from api.main import app

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"

# (method, path template) for every generation route Plan 124 removed.
_REMOVED = [
    ("POST", "/api/sessions/{session_id}/runbook"),
    ("POST", "/api/sessions/{session_id}/pack"),
    ("GET", "/api/sessions/{session_id}/brief"),
    ("POST", "/api/sessions/{session_id}/brief"),
    ("PATCH", "/api/sessions/{session_id}/brief"),
    ("POST", "/api/campaigns/{campaign_id}/npcs/generate"),
    ("POST", "/api/npcs/{npc_id}/portrait"),
    ("POST", "/api/npcs/{npc_id}/figure"),
    ("POST", "/api/characters/{character_id}/figure"),
    ("POST", "/api/characters/{character_id}/portrait"),
    ("POST", "/api/monsters/{monster_id}/figure"),
    ("POST", "/api/monsters/{monster_id}/portrait"),
    ("POST", "/api/battle-maps/{map_id}/backdrop"),
    ("POST", "/api/battle-maps/{map_id}/props"),
    ("POST", "/api/battle-maps/{map_id}/terrain"),
    ("POST", "/api/sessions/{session_id}/table/figure"),
    ("POST", "/api/maps/{map_id}/generate"),
    ("POST", "/api/items/{item_id}/lore"),
    ("POST", "/api/adventures/{adventure_id}/encounters/suggest-monsters"),
    ("POST", "/api/shops/{shop_id}/stock"),
    ("POST", "/api/shops/{shop_id}/banner"),
    ("POST", "/api/shops/{shop_id}/items/{shop_item_id}/image"),
    ("POST", "/api/play/{pc_id}/hero"),
    ("POST", "/api/play/{pc_id}/identity"),
    ("POST", "/api/play/{pc_id}/loadout"),
    ("POST", "/api/play/{pc_id}/identity/lock"),
    ("POST", "/api/notebook-pages/{page_id}/riff"),
    ("GET", "/api/auth/plans"),
    ("GET", "/api/auth/patreon/link"),
]


def _route_table() -> set[tuple[str, str]]:
    """Every (method, path) the app publishes in its OpenAPI schema."""
    out: set[tuple[str, str]] = set()
    for path, ops in app.openapi()["paths"].items():
        for method in ops:
            out.add((method.upper(), path))
    return out


@pytest.mark.parametrize("method,path", _REMOVED)
def test_generation_route_is_not_registered(method, path):
    """No generation endpoint is left in the app's route table."""
    assert (method, path) not in _route_table()


def test_generation_routes_answer_404_or_405(client, api_engine):
    """Calling a former generation route finds nothing to run."""
    dm = "noai@example.com"
    with Session(api_engine) as s:
        campaign = camp_svc.create_campaign(s, name="Quiet", setting="R", tone="T", dm_email=dm)
        cid = str(campaign.id)
    h = {_AUTH_HEADER: dm}
    some = str(uuid.uuid4())
    for method, path in _REMOVED:
        url = (
            path.replace("{campaign_id}", cid)
            .replace("{session_id}", some)
            .replace("{npc_id}", some)
            .replace("{character_id}", some)
            .replace("{monster_id}", some)
            .replace("{map_id}", some)
            .replace("{item_id}", some)
            .replace("{adventure_id}", some)
            .replace("{shop_id}", some)
            .replace("{shop_item_id}", some)
            .replace("{pc_id}", some)
            .replace("{page_id}", some)
        )
        resp = client.request(method, url, json={}, headers=h)
        assert resp.status_code in (404, 405), (method, url, resp.status_code, resp.text)
        if resp.status_code == 404 and "json" in resp.headers.get("content-type", ""):
            # The router's own "no such route" answer, not a handler's "not found".
            assert resp.json().get("detail") == "Not Found", (method, url, resp.text)


def test_the_non_ai_neighbours_stay():
    """The hand-written runbook, paper-doll gear and difficulty meter are not AI."""
    routes = _route_table()
    for kept in [
        ("GET", "/api/sessions/{session_id}/runbook"),
        ("PATCH", "/api/sessions/{session_id}/runbook"),
        ("PUT", "/api/sessions/{session_id}/runbook/blank"),
        ("GET", "/api/play/{pc_id}/gear"),
        ("PATCH", "/api/play/{pc_id}/appearance"),
        ("POST", "/api/play/{pc_id}/gear/{character_item_id}/equip"),
        ("POST", "/api/adventures/{adventure_id}/encounters/preview-difficulty"),
        ("GET", "/api/auth/providers"),
        ("GET", "/api/auth/me"),
    ]:
        assert kept in routes, kept


def test_profile_and_providers_carry_no_ai_fields(client, api_engine):
    """``/auth/me`` and ``/auth/providers`` no longer speak of AI quotas or tiers."""
    dm = "noai@example.com"
    h = {_AUTH_HEADER: dm}
    me = client.get("/api/auth/me", headers=h).json()
    assert me["email"] == dm
    for gone in ("ai_allowed", "ai_reason", "ai_remaining_today", "ai_daily_limit", "tier"):
        assert gone not in me
    assert "patron_active" not in me
    providers = client.get("/api/auth/providers").json()
    assert "ai_gate" not in providers
