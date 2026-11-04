"""Plan 133 — battle maps for James's chase map (25 × 75 squares, a tall strip).

The editor now sets the grid in squares and stores pixels per square as before
(``grid_size = round(width / squares across)``), and the table can hide a
revealed fog area again. No schema change: these tests pin the API contract
the new editor and table controls rely on.
"""

from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.session_service as sess_svc

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
DM = "james.p133@example.com"


def auth(email: str) -> dict:
    """Trusted identity header dict for a given DM email."""
    return {_AUTH_HEADER: email}


def _seed(engine, dm: str) -> tuple[str, str]:
    """Create campaign + session; return (campaign_id, session_id) as strings."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Hyrule", setting="R", tone="T", dm_email=dm)
        adventure = adv_svc.create_adventure(
            s,
            campaign_id=campaign.id,
            title="The Chase",
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


def _chase_map(client, cid: str, **extra) -> dict:
    """Create the 25 × 75 chase strip (1750 × 5250 at 70 px)."""
    body = {
        "name": "Chase Map",
        "image_url": "https://blob.example/chase.jpg",
        "width": 1750,
        "height": 5250,
        "regions": [
            {"id": "r1", "name": "Market", "points": [[0, 0], [700, 0], [700, 700], [0, 700]]},
            {"id": "r2", "name": "Docks", "points": [[0, 4200], [1750, 4200], [1750, 5250]]},
        ],
        **extra,
    }
    resp = client.post(f"/api/campaigns/{cid}/battle-maps", headers=auth(DM), json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_tall_strip_keeps_its_size_and_grid(client, api_engine):
    """A 25 × 75 strip round-trips whole: no dimension or grid is trimmed."""
    cid, _sid = _seed(api_engine, DM)
    created = _chase_map(client, cid, grid_size=70)
    listed = client.get(f"/api/campaigns/{cid}/battle-maps", headers=auth(DM)).json()
    got = next(m for m in listed if m["id"] == created["id"])
    assert (got["width"], got["height"], got["grid_size"]) == (1750, 5250, 70)
    assert got["width"] // got["grid_size"] == 25
    assert got["height"] // got["grid_size"] == 75


def test_grid_set_from_squares_across_then_cleared(client, api_engine):
    """The editor stores round(width / across); clearing the squares stores no grid."""
    cid, _sid = _seed(api_engine, DM)
    created = _chase_map(client, cid)  # imported with no guess: the editor asks
    assert created["grid_size"] is None

    # "25 squares across" on an Inkarnate-style 2048-wide export: 81.92 → 82.
    wide = client.patch(
        f"/api/battle-maps/{created['id']}",
        headers=auth(DM),
        json={"width": 2048, "height": 6144, "grid_size": round(2048 / 25)},
    )
    assert wide.status_code == 200
    assert wide.json()["grid_size"] == 82

    cleared = client.patch(
        f"/api/battle-maps/{created['id']}", headers=auth(DM), json={"grid_size": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["grid_size"] is None


def test_saving_other_fields_leaves_the_grid_alone(client, api_engine):
    """A save that doesn't send grid_size keeps the stored size exactly."""
    cid, _sid = _seed(api_engine, DM)
    created = _chase_map(client, cid, grid_size=70)
    renamed = client.patch(
        f"/api/battle-maps/{created['id']}",
        headers=auth(DM),
        json={"name": "Chase through Castle Town"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["grid_size"] == 70
    assert len(renamed.json()["regions"]) == 2


def test_too_many_squares_is_refused(client, api_engine):
    """Squares under 8 px (e.g. 300 across a 1750 px image) are refused, as the editor says."""
    cid, _sid = _seed(api_engine, DM)
    created = _chase_map(client, cid)
    resp = client.patch(
        f"/api/battle-maps/{created['id']}",
        headers=auth(DM),
        json={"grid_size": round(1750 / 300)},
    )
    assert resp.status_code == 422


def test_revealed_area_can_be_hidden_again(client, api_engine):
    """Reveal the Market, then hide it again: the players' projection follows both ways."""
    cid, sid = _seed(api_engine, DM)
    created = _chase_map(client, cid, grid_size=70)
    staged = client.patch(
        f"/api/sessions/{sid}/table",
        headers=auth(DM),
        json={
            "active_map_id": created["id"],
            "fog_on": True,
            "revealed_region_ids": ["r1"],
            "brush_reveals": [{"x": 875, "y": 2600, "r": 210}],
        },
    )
    assert staged.status_code == 200
    proj = client.get(f"/api/table/{sid}").json()
    assert proj["revealed_regions"] == [[[0, 0], [700, 0], [700, 700], [0, 700]]]
    assert len(proj["brush_reveals"]) == 1

    # The table's Hide tool: tapping inside the Market and the circle drops both.
    hidden = client.patch(
        f"/api/sessions/{sid}/table",
        headers=auth(DM),
        json={"revealed_region_ids": [], "brush_reveals": []},
    )
    assert hidden.status_code == 200
    proj = client.get(f"/api/table/{sid}").json()
    assert proj["fog_on"] is True
    assert proj["revealed_regions"] == []
    assert proj["brush_reveals"] == []


def test_another_dm_cannot_regrid(client, api_engine):
    """Only the campaign's DM changes a map's grid."""
    cid, _sid = _seed(api_engine, DM)
    created = _chase_map(client, cid, grid_size=70)
    resp = client.patch(
        f"/api/battle-maps/{created['id']}",
        headers=auth("someone.else@example.com"),
        json={"grid_size": 56},
    )
    assert resp.status_code == 403
