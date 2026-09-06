"""Plan 86 — generative AI is not part of the product by default."""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"


def test_ai_routes_are_404_and_plans_empty_by_default(client, api_engine, monkeypatch):
    """With AI_FEATURES unset every generation route is a 404 and no tiers are offered."""
    monkeypatch.delenv("AI_FEATURES", raising=False)
    dm = "noai@example.com"
    with Session(api_engine) as s:
        campaign = camp_svc.create_campaign(s, name="Quiet", setting="R", tone="T", dm_email=dm)
        cid = str(campaign.id)
    h = {_AUTH_HEADER: dm}
    gen = client.post(f"/api/campaigns/{cid}/npcs/generate", json={"role": "innkeeper"}, headers=h)
    assert gen.status_code == 404 and "not part of QuestLab" in gen.json()["detail"]
    banner = client.post(f"/api/shops/{uuid.uuid4()}/banner", headers=h)
    assert banner.status_code == 404 and "not part of QuestLab" in banner.json()["detail"]
    plans = client.get("/api/auth/plans").json()
    assert plans["plans"] == [] and plans["gate"] == "off"
    me = client.get("/api/auth/me", headers=h).json()
    assert me["ai_allowed"] is False
    # Everything that isn't generation still works.
    assert client.get(f"/api/campaigns/{cid}", headers=h).status_code == 200


def test_ai_routes_work_when_a_private_deployment_opts_in(client, api_engine, monkeypatch):
    """AI_FEATURES=on restores the gate (here: the paywall's own answer, not a 404)."""
    monkeypatch.setenv("AI_FEATURES", "on")
    plans = client.get("/api/auth/plans").json()
    assert plans["gate"] in ("off", "patreon")
