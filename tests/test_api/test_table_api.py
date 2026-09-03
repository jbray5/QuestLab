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


def test_projection_tokens_carry_conditions(client, api_engine):
    """Plan 65 — projection tokens are enriched with combatant conditions."""
    dm = "dm_fx@example.com"
    _cid, sid = _seed(api_engine, dm)

    put = client.put(
        f"/api/sessions/{sid}/combat",
        headers=auth(dm),
        json={
            "round": 1,
            "combat_state": "running",
            "combatants": [
                {
                    "sort_index": 0,
                    "name": "Hag",
                    "dex_score": 12,
                    "initiative_roll": 15,
                    "hp_current": 40,
                    "hp_max": 40,
                    "type": "monster",
                    "conditions": ["poisoned", "prone"],
                }
            ],
        },
    )
    assert put.status_code == 200
    hag_id = put.json()["combatants"][0]["id"]

    patch = client.patch(
        f"/api/sessions/{sid}/table",
        headers=auth(dm),
        json={"tokens": [{"id": "tok-hag", "kind": "monster", "ref_id": hag_id, "label": "Hag"}]},
    )
    assert patch.status_code == 200

    proj = client.get(f"/api/table/{sid}")
    assert proj.status_code == 200
    tokens = proj.json()["tokens"]
    assert len(tokens) == 1
    assert sorted(tokens[0]["conditions"]) == ["poisoned", "prone"]
    assert tokens[0]["concentrating"] is None  # not a PC token


def test_delete_session_cascades_table_and_combat(client, api_engine):
    """DELETE /sessions/{id} succeeds even with combat + table state attached."""
    dm = "dm_del@example.com"
    _cid, sid = _seed(api_engine, dm)

    put = client.put(
        f"/api/sessions/{sid}/combat",
        headers=auth(dm),
        json={
            "round": 1,
            "combat_state": "running",
            "combatants": [
                {
                    "sort_index": 0,
                    "name": "Ghoul",
                    "dex_score": 14,
                    "initiative_roll": 12,
                    "hp_current": 22,
                    "hp_max": 22,
                    "type": "monster",
                }
            ],
        },
    )
    assert put.status_code == 200
    patch = client.patch(
        f"/api/sessions/{sid}/table",
        headers=auth(dm),
        json={"darkness": 0.4},
    )
    assert patch.status_code == 200

    resp = client.delete(f"/api/sessions/{sid}", headers=auth(dm))
    assert resp.status_code == 204
    assert client.get(f"/api/table/{sid}").json()["map"] is None  # empty projection


def test_join_qr_toggle_reaches_projection(client, api_engine):
    """Plan 69 — DM toggles join_qr_on; the public projection carries it."""
    dm = "dm_qr@example.com"
    _cid, sid = _seed(api_engine, dm)
    assert client.get(f"/api/table/{sid}").json()["join_qr_on"] is False
    patch = client.patch(f"/api/sessions/{sid}/table", headers=auth(dm), json={"join_qr_on": True})
    assert patch.status_code == 200
    assert client.get(f"/api/table/{sid}").json()["join_qr_on"] is True


def test_conditions_flow_without_running_combat(client, api_engine):
    """Plan 69 — conditions enrich tokens even when combat isn't running."""
    dm = "dm_c2@example.com"
    _cid, sid = _seed(api_engine, dm)
    put = client.put(
        f"/api/sessions/{sid}/combat",
        headers=auth(dm),
        json={
            "round": 1,
            "combat_state": "setup",
            "combatants": [
                {
                    "sort_index": 0,
                    "name": "Wretch",
                    "dex_score": 10,
                    "initiative_roll": 10,
                    "hp_current": 10,
                    "hp_max": 10,
                    "type": "monster",
                    "conditions": ["poisoned"],
                }
            ],
        },
    )
    assert put.status_code == 200
    wid = put.json()["combatants"][0]["id"]
    client.patch(
        f"/api/sessions/{sid}/table",
        headers=auth(dm),
        json={"tokens": [{"id": "t1", "kind": "monster", "ref_id": wid, "label": "W"}]},
    )
    proj = client.get(f"/api/table/{sid}").json()
    assert proj["tokens"][0]["conditions"] == ["poisoned"]
    assert proj["active_token_ref"] is None  # turn glow still gated on running


def test_video_map_flows_to_projection(client, api_engine):
    """Plan 71 — an animated map's video_url reaches the public projection."""
    dm = "dm_video@example.com"
    cid, sid = _seed(api_engine, dm)
    created = client.post(
        f"/api/campaigns/{cid}/battle-maps",
        headers=auth(dm),
        json={
            "name": "Harpy Cove — Night",
            "image_url": "https://example.test/poster.jpg",
            "video_url": "https://example.test/loop.mp4",
            "width": 3840,
            "height": 2160,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["video_url"] == "https://example.test/loop.mp4"
    patch = client.patch(
        f"/api/sessions/{sid}/table",
        headers=auth(dm),
        json={"active_map_id": created.json()["id"]},
    )
    assert patch.status_code == 200
    proj = client.get(f"/api/table/{sid}").json()
    assert proj["map"]["video_url"] == "https://example.test/loop.mp4"
    assert proj["map"]["image_url"] == "https://example.test/poster.jpg"


def test_map_upload_accepts_video(client):
    """Plan 71 — /uploads/map takes MP4 loops (local-dir fallback in tests)."""
    resp = client.post(
        "/api/uploads/map",
        headers=auth("dm_upl@example.com"),
        files={"file": ("loop.mp4", b"\x00\x00\x00\x18ftypmp42", "video/mp4")},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["url"].endswith(".mp4")


def test_stand_down_flips_group_to_neutral(client, api_engine):
    """Plan 72 — one call turns every hostile token in a group neutral; others untouched."""
    dm = "dm_sd@example.com"
    _cid, sid = _seed(api_engine, dm)
    tokens = [
        {"id": "a1", "kind": "monster", "label": "Attendant", "group": "house"},
        {"id": "d1", "kind": "monster", "label": "Dryad", "group": "house"},
        {"id": "boss", "kind": "monster", "label": "Auntie Sorrel"},
        {"id": "pc1", "kind": "pc", "label": "Creed", "group": "house"},
    ]
    assert (
        client.patch(
            f"/api/sessions/{sid}/table", headers=auth(dm), json={"tokens": tokens}
        ).status_code
        == 200
    )
    resp = client.post(
        f"/api/sessions/{sid}/table/stand-down", headers=auth(dm), json={"group": "house"}
    )
    assert resp.status_code == 200, resp.text
    kinds = {t["id"]: t["kind"] for t in resp.json()["tokens"]}
    assert kinds == {"a1": "custom", "d1": "custom", "boss": "monster", "pc1": "pc"}
    # Unauthenticated callers can't stand anyone down.
    assert client.post(
        f"/api/sessions/{sid}/table/stand-down", json={"group": "house"}
    ).status_code in (401, 403)
