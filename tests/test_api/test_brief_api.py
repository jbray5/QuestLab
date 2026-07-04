"""API-layer tests for the DM brief endpoints (Plan 43).

The AI call is mocked at services.ai_service.complete_structured, so generation
touches no network. Focus: the auth boundary and the generate/read round-trip.
"""

from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.session_service as sess_svc
from domain.session_brief import Beat, NpcFace, Spotlight
from services.ai_service import _BriefOutput

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"


def auth(email: str) -> dict:
    """Trusted identity header dict for a given DM email."""
    return {_AUTH_HEADER: email}


def _fake_brief(*_args, **_kwargs) -> _BriefOutput:
    return _BriefOutput(
        cold_open="Dawn.",
        premise="Win, then complicate.",
        danger_dial="Scary, not a TPK.",
        fallback="Print it.",
        beats=[
            Beat(
                title="Flicker",
                cue="bark stills",
                kind="combat",
                trigger_kind="hp_lte",
                trigger_value=25,
            )
        ],
        npc_faces=[NpcFace(name="Belva", quick_who="warm innkeeper")],
        spotlight=[Spotlight(pc_name="Creed", flag="You held the breach.")],
        roads=[],
    )


def _seed(engine, dm: str) -> str:
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="C", setting="R", tone="T", dm_email=dm)
        adventure = adv_svc.create_adventure(
            s,
            campaign_id=campaign.id,
            title="Adv",
            synopsis="s",
            tier="Tier1",
            act_count=3,
            dm_email=dm,
        )
        gs = sess_svc.create_session(
            s,
            adventure_id=adventure.id,
            session_number=1,
            title="S1",
            dm_email=dm,
            date_planned=None,
            attending_pc_ids=[],
        )
        return str(gs.id)


def test_get_brief_requires_identity(client, api_engine):
    """No identity header → 401."""
    sid = _seed(api_engine, "owner@example.com")
    resp = client.get(f"/api/sessions/{sid}/brief")
    assert resp.status_code == 401


def test_get_brief_null_when_none(client, api_engine):
    """Owner with no brief yet → 200 null."""
    dm = "owner@example.com"
    sid = _seed(api_engine, dm)
    resp = client.get(f"/api/sessions/{sid}/brief", headers=auth(dm))
    assert resp.status_code == 200
    assert resp.json() is None


def test_generate_rejects_non_owner(client, api_engine):
    """A non-owning DM cannot generate a brief → 403."""
    sid = _seed(api_engine, "owner@example.com")
    resp = client.post(
        f"/api/sessions/{sid}/brief", headers=auth("intruder@example.com"), json={"notes": ""}
    )
    assert resp.status_code == 403


def test_generate_and_read_flow(client, api_engine, monkeypatch):
    """Generate a brief (AI mocked), then read it back with beats + play-faces."""
    monkeypatch.setattr("services.ai_service.complete_structured", _fake_brief)
    dm = "owner@example.com"
    sid = _seed(api_engine, dm)

    gen = client.post(
        f"/api/sessions/{sid}/brief", headers=auth(dm), json={"notes": "morning after"}
    )
    assert gen.status_code == 201
    body = gen.json()
    assert body["beats"][0]["trigger_kind"] == "hp_lte"
    assert body["npc_faces"][0]["quick_who"] == "warm innkeeper"
    assert "read_aloud" not in gen.text

    read = client.get(f"/api/sessions/{sid}/brief", headers=auth(dm))
    assert read.status_code == 200
    assert read.json()["cold_open"] == "Dawn."
