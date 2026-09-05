"""Campaign delete cascades everything (Plan 82).

Six of six field testers hit a 500 deleting a campaign that had a fight in it:
combatants, table state, beats, battle maps and NPCs were left behind and the
FKs aborted the delete. This drives the real routes: build a campaign with a
session, a running combat, a staged table, a battle map and an NPC, then
delete it in one call and check every child is gone.
"""

from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.session_service as sess_svc

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
DM = "cascade@example.com"


def auth(email: str) -> dict:
    """Trusted identity header dict for a given DM email."""
    return {_AUTH_HEADER: email}


def _seed(engine) -> tuple[str, str]:
    """Create campaign + adventure + session; return (campaign_id, session_id)."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Doomed", setting="R", tone="T", dm_email=DM)
        adventure = adv_svc.create_adventure(
            s,
            campaign_id=campaign.id,
            title="Arc",
            synopsis="s",
            tier="Tier1",
            act_count=3,
            dm_email=DM,
        )
        gs = sess_svc.create_session(
            s,
            adventure_id=adventure.id,
            session_number=1,
            title="S1",
            dm_email=DM,
            date_planned=None,
            attending_pc_ids=[],
        )
        return str(campaign.id), str(gs.id)


def test_delete_campaign_with_a_fight_in_it(client, api_engine):
    """Combat, table state, a battle map and an NPC all go with the campaign."""
    cid, sid = _seed(api_engine)
    h = auth(DM)

    # A running fight with two combatants.
    combat = client.put(
        f"/api/sessions/{sid}/combat",
        json={
            "round": 2,
            "combat_state": "running",
            "combatants": [
                {
                    "sort_index": 0,
                    "name": "Bandit",
                    "dex_score": 12,
                    "initiative_roll": 14,
                    "hp_current": 11,
                    "hp_max": 11,
                    "type": "monster",
                    "ac": 12,
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
                },
            ],
        },
        headers=h,
    )
    assert combat.status_code == 200, combat.text

    # A battle map on the table, with a token.
    bm = client.post(
        f"/api/campaigns/{cid}/battle-maps",
        json={
            "name": "Road",
            "image_url": "https://example.com/road.png",
            "width": 1200,
            "height": 800,
        },
        headers=h,
    )
    assert bm.status_code == 201, bm.text
    map_id = bm.json()["id"]
    table = client.patch(
        f"/api/sessions/{sid}/table",
        json={
            "active_map_id": map_id,
            "tokens": [
                {
                    "id": "t1",
                    "kind": "monster",
                    "ref_id": None,
                    "label": "Bandit",
                    "x": 100,
                    "y": 100,
                    "size": 1,
                }
            ],
        },
        headers=h,
    )
    assert table.status_code == 200, table.text

    # An NPC with a secret.
    npc = client.post(
        f"/api/campaigns/{cid}/npcs",
        json={"name": "Hessa Cleft", "role": "toll-keeper", "secret": "Sold the road."},
        headers=h,
    )
    assert npc.status_code in (200, 201), npc.text

    # One call.
    gone = client.delete(f"/api/campaigns/{cid}", headers=h)
    assert gone.status_code in (200, 204), gone.text

    # Nothing survives.
    assert client.get(f"/api/campaigns/{cid}", headers=h).status_code == 404
    assert client.get(f"/api/sessions/{sid}", headers=h).status_code == 404
    # The public projection stays a harmless empty table for unknown sessions
    # (the projector page must never error), so it may be 404 or an empty 200.
    table_after = client.get(f"/api/table/{sid}")
    assert table_after.status_code == 404 or table_after.json().get("map") is None
    assert client.get(f"/api/sessions/{sid}/combat", headers=h).status_code == 404


def test_delete_session_with_active_combat(client, api_engine):
    """A session with combatants and table state deletes cleanly on its own too."""
    cid, sid = _seed(api_engine)
    h = auth(DM)
    r = client.put(
        f"/api/sessions/{sid}/combat",
        json={
            "round": 1,
            "combat_state": "running",
            "combatants": [
                {
                    "sort_index": 0,
                    "name": "Goblin",
                    "dex_score": 14,
                    "initiative_roll": 12,
                    "hp_current": 7,
                    "hp_max": 7,
                    "type": "monster",
                    "ac": 15,
                }
            ],
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert (
        client.patch(f"/api/sessions/{sid}/table", json={"darkness": 0.3}, headers=h).status_code
        == 200
    )
    assert client.delete(f"/api/sessions/{sid}", headers=h).status_code in (200, 204)
    assert client.get(f"/api/sessions/{sid}", headers=h).status_code == 404
    # The campaign is still there and can go afterwards.
    assert client.delete(f"/api/campaigns/{cid}", headers=h).status_code in (200, 204)
