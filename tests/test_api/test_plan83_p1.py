"""Plan 83 — the P1 list from the six-DM field test, driven through the API.

Join codes gate the join page; players move their own token; the projection
carries initiative and party HP but never foe HP; the sample campaign opens
twice; combat_state synonyms land on real states and nonsense is a 422; export
is a complete bundle the owner alone can pull.
"""

import uuid

from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.session_service as sess_svc
from domain.enums import CharacterClass

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"


def auth(email: str) -> dict:
    """Trusted identity header dict for a given DM email."""
    return {_AUTH_HEADER: email}


def _seed(engine, dm: str) -> tuple[str, str, str]:
    """Campaign + arc + session + one PC; return (campaign_id, session_id, pc_id)."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Reeds", setting="R", tone="T", dm_email=dm)
        adventure = adv_svc.create_adventure(
            s,
            campaign_id=campaign.id,
            title="Arc",
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
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name="Cory",
            character_name="Creed",
            race="Human",
            character_class=CharacterClass.FIGHTER,
            level=3,
            score_str=16,
            score_dex=12,
            score_con=14,
            score_int=8,
            score_wis=10,
            score_cha=10,
            hp_max=28,
            hp_current=20,
            ac=16,
            speed=30,
        )
        return str(campaign.id), str(gs.id), str(pc.id)


def test_join_code_gates_the_join_page(client, api_engine):
    """No code → 403 with a machine-readable detail; the right code → 200; "" clears it."""
    dm = "code@example.com"
    cid, _sid, _pc = _seed(api_engine, dm)
    h = auth(dm)
    assert client.get(f"/api/play/join/{cid}").status_code == 200  # open by default
    r = client.patch(f"/api/campaigns/{cid}", json={"join_code": " reed-7 "}, headers=h)
    assert r.status_code == 200 and r.json()["join_code"] == "REED7"
    denied = client.get(f"/api/play/join/{cid}")
    assert denied.status_code == 403 and denied.json()["detail"] == "join_code_required"
    assert client.get(f"/api/play/join/{cid}/options").status_code == 403
    assert client.get(f"/api/play/join/{cid}", params={"code": "reed7"}).status_code == 200
    assert client.get(f"/api/play/join/{cid}", params={"code": "nope"}).status_code == 403
    r = client.patch(f"/api/campaigns/{cid}", json={"join_code": ""}, headers=h)
    assert r.status_code == 200 and r.json()["join_code"] is None
    assert client.get(f"/api/play/join/{cid}").status_code == 200


def test_projection_carries_initiative_and_party_hp_only(client, api_engine):
    """Running combat: order + whose turn + PC HP; foe HP is absent. Idle: nothing."""
    dm = "init@example.com"
    _cid, sid, pc = _seed(api_engine, dm)
    h = auth(dm)
    body = {
        "round": 3,
        "combat_state": "running",
        "combatants": [
            {
                "sort_index": 0,
                "name": "Creed",
                "dex_score": 12,
                "initiative_roll": 15,
                "hp_current": 20,
                "hp_max": 28,
                "type": "pc",
                "character_id": pc,
                "ac": 16,
            },
            {
                "sort_index": 1,
                "name": "Wolf",
                "dex_score": 15,
                "initiative_roll": 9,
                "hp_current": 11,
                "hp_max": 11,
                "type": "monster",
                "ac": 13,
                "conditions": ["prone"],
            },
        ],
    }
    r = client.put(f"/api/sessions/{sid}/combat", json=body, headers=h)
    assert r.status_code == 200, r.text
    proj = client.get(f"/api/table/{sid}").json()
    assert proj["combat_running"] is True and proj["round"] == 3
    names = [e["name"] for e in proj["initiative"]]
    assert names == ["Creed", "Wolf"]
    creed, wolf = proj["initiative"]
    assert creed["kind"] == "pc" and creed["hp_current"] == 20 and creed["hp_max"] == 28
    assert wolf["hp_current"] is None and wolf["hp_max"] is None
    assert wolf["conditions"] == ["prone"]
    assert "11" not in str(wolf)
    # A synonym lands on the real state; nonsense is rejected.
    body["combat_state"] = "active"
    assert (
        client.put(f"/api/sessions/{sid}/combat", json=body, headers=h).json()["combat_state"]
        == "running"
    )
    body["combat_state"] = "brawling"
    assert client.put(f"/api/sessions/{sid}/combat", json=body, headers=h).status_code == 422
    body["combat_state"] = "ended"
    client.put(f"/api/sessions/{sid}/combat", json=body, headers=h)
    proj = client.get(f"/api/table/{sid}").json()
    assert proj["combat_running"] is False and proj["initiative"] == []


def test_player_moves_only_their_own_token(client, api_engine):
    """The PC's token moves; a table in another campaign is 403; no token is 422."""
    dm = "move@example.com"
    cid, sid, pc = _seed(api_engine, dm)
    h = auth(dm)
    bm = client.post(
        f"/api/campaigns/{cid}/battle-maps",
        json={
            "name": "Road",
            "image_url": "https://example.com/r.png",
            "width": 1000,
            "height": 800,
        },
        headers=h,
    ).json()
    empty = client.post(f"/api/play/{pc}/table/move", json={"session_id": sid, "x": 5, "y": 5})
    assert empty.status_code == 422
    client.patch(
        f"/api/sessions/{sid}/table",
        json={
            "active_map_id": bm["id"],
            "tokens": [
                {
                    "id": "pc-1",
                    "kind": "pc",
                    "ref_id": pc,
                    "label": "Creed",
                    "x": 10,
                    "y": 10,
                    "size": 1,
                },
                {
                    "id": "foe-1",
                    "kind": "monster",
                    "ref_id": None,
                    "label": "Wolf",
                    "x": 90,
                    "y": 90,
                    "size": 1,
                },
            ],
        },
        headers=h,
    )
    moved = client.post(f"/api/play/{pc}/table/move", json={"session_id": sid, "x": 300, "y": 240})
    assert moved.status_code == 200 and moved.json()["id"] == "pc-1"
    tokens = {t["id"]: t for t in client.get(f"/api/table/{sid}").json()["tokens"]}
    assert (tokens["pc-1"]["x"], tokens["pc-1"]["y"]) == (300, 240)
    assert (tokens["foe-1"]["x"], tokens["foe-1"]["y"]) == (90, 90)
    # Someone else's campaign.
    _cid2, sid2, _pc2 = _seed(api_engine, "other@example.com")
    assert (
        client.post(
            f"/api/play/{pc}/table/move", json={"session_id": sid2, "x": 1, "y": 1}
        ).status_code
        == 403
    )


def test_phone_finds_the_live_session(client, api_engine):
    """The phone asks where the table is; the newest session answers."""
    _cid, sid, pc = _seed(api_engine, "live@example.com")
    r = client.get(f"/api/play/{pc}/live-session")
    assert r.status_code == 200 and r.json()["session_id"] == sid
    assert client.get(f"/api/play/{uuid.uuid4()}/live-session").status_code == 404


def test_sample_campaign_opens_twice_and_is_runnable(client):
    """First call builds it (201); the second hands back the same ids (200)."""
    h = auth("starter@example.com")
    first = client.post("/api/onboarding/starter", headers=h)
    assert first.status_code == 201, first.text
    ids = first.json()
    again = client.post("/api/onboarding/starter", headers=h)
    assert again.status_code == 200 and again.json()["session_id"] == ids["session_id"]
    gs = client.get(f"/api/sessions/{ids['session_id']}", headers=h).json()
    assert gs["title"] == "The Millpond Bells"
    npcs = client.get(f"/api/campaigns/{ids['campaign_id']}/npcs", headers=h).json()
    assert {n["name"] for n in npcs} >= {"Aldous Fenwright", "Tansy Quill"}
    rb = client.get(f"/api/sessions/{ids['session_id']}/runbook", headers=h)
    assert rb.status_code == 200 and len(rb.json()["scenes"]) == 3


def test_export_is_owner_only_and_complete(client, api_engine):
    """The bundle carries the campaign and its children; a stranger gets 403."""
    dm = "export@example.com"
    cid, sid, _pc = _seed(api_engine, dm)
    h = auth(dm)
    client.post(f"/api/campaigns/{cid}/npcs", json={"name": "Hessa", "secret": "x"}, headers=h)
    r = client.get(f"/api/campaigns/{cid}/export", headers=h)
    assert r.status_code == 200, r.text
    assert r.headers["content-disposition"].startswith("attachment;")
    bundle = r.json()
    assert bundle["format"] == "questlab-campaign/1"
    assert bundle["campaign"]["id"] == cid
    assert len(bundle["characters"]) == 1 and bundle["npcs"][0]["secret"] == "x"
    assert bundle["adventures"][0]["sessions"][0]["id"] == sid
    assert client.get(
        f"/api/campaigns/{cid}/export", headers=auth("thief@example.com")
    ).status_code in (
        403,
        404,
    )


def test_arc_tier_is_inferred_from_the_party(client, api_engine):
    """No tier in the body → the party's average level picks it."""
    dm = "tier@example.com"
    cid, _sid, pc = _seed(api_engine, dm)
    h = auth(dm)
    client.patch(f"/api/characters/{pc}", json={"level": 7}, headers=h)
    r = client.post(
        f"/api/campaigns/{cid}/adventures", json={"title": "Deep", "act_count": 3}, headers=h
    )
    assert r.status_code == 201, r.text
    assert r.json()["tier"] == "Tier2"
    assert uuid.UUID(r.json()["id"])
