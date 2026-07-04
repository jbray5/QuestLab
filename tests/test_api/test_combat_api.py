"""API-layer tests for the combat endpoints (Plan 41).

Covers the new incremental roster endpoints (POST/DELETE combatants) and the
identity/ownership guard on the combat surface — the api/ layer that had no
HTTP-level tests before.
"""

from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.session_service as sess_svc

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"


def auth(email: str) -> dict:
    """Trusted identity header dict for a given DM email."""
    return {_AUTH_HEADER: email}


def _seed_session(engine, dm: str) -> str:
    """Create DM → campaign → adventure → session; return the session id (str)."""
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


def _combatant_body(sort_index: int, name: str, initiative: int, ctype: str = "monster") -> dict:
    return {
        "sort_index": sort_index,
        "name": name,
        "dex_score": 14,
        "initiative_roll": initiative,
        "hp_current": 20,
        "hp_max": 20,
        "type": ctype,
    }


def test_get_combat_requires_identity(client, api_engine):
    """No identity header → 401 fail-closed."""
    sid = _seed_session(api_engine, "owner@example.com")
    resp = client.get(f"/api/sessions/{sid}/combat")  # no auth header
    assert resp.status_code == 401


def test_get_combat_rejects_non_owner(client, api_engine):
    """A DM who does not own the campaign → 403."""
    sid = _seed_session(api_engine, "owner@example.com")
    resp = client.get(f"/api/sessions/{sid}/combat", headers=auth("intruder@example.com"))
    assert resp.status_code == 403


def test_add_combatant_preserves_round(client, api_engine):
    """POST /combat/combatants adds without resetting the round, ordered by initiative."""
    dm = "dm_b@example.com"
    sid = _seed_session(api_engine, dm)

    put = client.put(
        f"/api/sessions/{sid}/combat",
        headers=auth(dm),
        json={
            "round": 3,
            "combat_state": "running",
            "combatants": [_combatant_body(0, "Alpha", 20)],
        },
    )
    assert put.status_code == 200
    assert put.json()["round"] == 3

    add = client.post(
        f"/api/sessions/{sid}/combat/combatants",
        headers=auth(dm),
        json=_combatant_body(1, "Beta", 25),
    )
    assert add.status_code == 201
    body = add.json()
    assert body["round"] == 3  # NOT reset to 1
    assert [c["name"] for c in body["combatants"]] == ["Beta", "Alpha"]  # 25 > 20


def test_remove_combatant_returns_reduced_state(client, api_engine):
    """DELETE /combat/combatants/{id} removes one and returns the remaining roster."""
    dm = "dm_c@example.com"
    sid = _seed_session(api_engine, dm)
    put = client.put(
        f"/api/sessions/{sid}/combat",
        headers=auth(dm),
        json={
            "round": 1,
            "combat_state": "running",
            "combatants": [_combatant_body(0, "Alpha", 20), _combatant_body(1, "Beta", 10)],
        },
    )
    beta_id = next(c["id"] for c in put.json()["combatants"] if c["name"] == "Beta")

    rem = client.delete(f"/api/sessions/{sid}/combat/combatants/{beta_id}", headers=auth(dm))
    assert rem.status_code == 200
    assert [c["name"] for c in rem.json()["combatants"]] == ["Alpha"]
