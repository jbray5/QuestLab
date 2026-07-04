"""API-layer tests for the Table View endpoints (Plan 42).

Focus: the projection endpoint is unauthenticated by design (capability URL),
while the DM console endpoints must fail closed for anonymous / non-owner
callers.
"""

from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.session_service as sess_svc

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"


def auth(email: str) -> dict:
    """Trusted identity header dict for a given DM email."""
    return {_AUTH_HEADER: email}


def _seed(engine, dm: str) -> tuple[str, str]:
    """Create campaign + session; return (campaign_id, session_id) as strings."""
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
        return str(campaign.id), str(gs.id)


def test_projection_is_public(client, api_engine):
    """GET /table/{id} needs no identity (capability URL) and returns safe shape."""
    _cid, sid = _seed(api_engine, "dm@example.com")
    resp = client.get(f"/api/table/{sid}")  # no auth header
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == sid
    assert body["map"] is None
    assert "hp" not in resp.text.lower()


def test_table_console_requires_identity(client, api_engine):
    """PATCH /sessions/{id}/table with no identity → 401."""
    _cid, sid = _seed(api_engine, "dm@example.com")
    resp = client.patch(f"/api/sessions/{sid}/table", json={"darkness": 0.5})
    assert resp.status_code == 401


def test_table_console_rejects_non_owner(client, api_engine):
    """PATCH /sessions/{id}/table by a non-owner → 403."""
    _cid, sid = _seed(api_engine, "owner@example.com")
    resp = client.patch(
        f"/api/sessions/{sid}/table",
        headers=auth("intruder@example.com"),
        json={"darkness": 0.5},
    )
    assert resp.status_code == 403


def test_map_upload_and_project_flow(client, api_engine):
    """Create a map via API, set it active, and see it in the projection."""
    dm = "dm@example.com"
    cid, sid = _seed(api_engine, dm)

    created = client.post(
        f"/api/campaigns/{cid}/battle-maps",
        headers=auth(dm),
        json={
            "name": "Hollow Drum",
            "image_url": "https://blob.example/hollow.jpg",
            "width": 2560,
            "height": 1440,
            "grid_size": 150,
            "regions": [{"id": "r1", "name": "Bar", "points": [[0, 0], [10, 0], [10, 10]]}],
        },
    )
    assert created.status_code == 201
    map_id = created.json()["id"]

    patched = client.patch(
        f"/api/sessions/{sid}/table",
        headers=auth(dm),
        json={"active_map_id": map_id, "fog_on": True, "revealed_region_ids": ["r1"]},
    )
    assert patched.status_code == 200

    proj = client.get(f"/api/table/{sid}").json()
    assert proj["map"]["width"] == 2560
    assert proj["revealed_regions"] == [[[0, 0], [10, 0], [10, 10]]]
    assert "Bar" not in client.get(f"/api/table/{sid}").text  # region name never sent
