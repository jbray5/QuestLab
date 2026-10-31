"""Plan 128 — the runbook is written on prep: scenes are added, renamed, reordered,
deleted and linked to a fight through the existing runbook PATCH.

Lena (a phone-only DM) found "Start a blank runbook" gave her one read-only scene.
The prep page now edits the scenes list and sends it back whole; these tests pin
that the API keeps every change in order, keeps a scene's link to an encounter in
the same arc, and clears links that point anywhere else.
"""

import uuid

from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.encounter_service as enc_svc
import services.session_service as sess_svc

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"


def auth(email: str) -> dict:
    """Trusted identity header dict for a given DM email."""
    return {_AUTH_HEADER: email}


def _seed(engine, dm: str) -> dict[str, str]:
    """Campaign with two arcs, a session in the first, and one encounter in each arc."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Reeds", setting="R", tone="T", dm_email=dm)
        arcs = [
            adv_svc.create_adventure(
                s,
                campaign_id=campaign.id,
                title=title,
                synopsis="s",
                tier="Tier1",
                act_count=3,
                dm_email=dm,
            )
            for title in ("The Drowned Bell", "Another arc")
        ]
        gs = sess_svc.create_session(
            s,
            adventure_id=arcs[0].id,
            session_number=1,
            title="S1",
            dm_email=dm,
            date_planned=None,
            attending_pc_ids=[],
        )
        here = enc_svc.create_encounter(s, adventure_id=arcs[0].id, name="Mill road", dm_email=dm)
        there = enc_svc.create_encounter(s, adventure_id=arcs[1].id, name="Elsewhere", dm_email=dm)
        return {"session": str(gs.id), "here": str(here.id), "there": str(there.id)}


def _scene(title: str, **extra) -> dict:
    """One scene as the prep editor sends it."""
    return {"title": title, "read_aloud": "", "dm_notes": "", "estimated_minutes": 20, **extra}


def test_blank_runbook_scenes_can_be_added_renamed_reordered_and_deleted(client, api_engine):
    """Every scene edit is a PATCH of the whole list, and the list comes back as sent."""
    dm = "lena@example.com"
    ids = _seed(api_engine, dm)
    h = auth(dm)
    url = f"/api/sessions/{ids['session']}/runbook"
    assert client.put(f"{url}/blank", headers=h).status_code == 200

    # Add a second scene and rename the first, with read-aloud and notes.
    r = client.patch(
        url,
        json={
            "scenes": [
                _scene("The miller's plea", read_aloud="Rain on the awnings.", dm_notes="Purse."),
                _scene("The mill road"),
            ]
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert [s["title"] for s in r.json()["scenes"]] == ["The miller's plea", "The mill road"]

    # Reorder, then delete one; the text travels with its scene.
    client.patch(
        url,
        json={
            "scenes": [
                _scene("The mill road"),
                _scene("The miller's plea", read_aloud="Rain on the awnings.", dm_notes="Purse."),
                _scene("Under the mill"),
            ]
        },
        headers=h,
    )
    client.patch(
        url,
        json={
            "scenes": [
                _scene("The miller's plea", read_aloud="Rain on the awnings.", dm_notes="Purse."),
                _scene("Under the mill"),
            ]
        },
        headers=h,
    )
    scenes = client.get(url, headers=h).json()["scenes"]
    assert [s["title"] for s in scenes] == ["The miller's plea", "Under the mill"]
    assert scenes[0]["read_aloud"] == "Rain on the awnings."
    assert scenes[0]["dm_notes"] == "Purse."


def test_scene_keeps_a_fight_from_its_own_arc_and_drops_any_other(client, api_engine):
    """encounter_id survives only when it names an encounter in the session's arc."""
    dm = "marco@example.com"
    ids = _seed(api_engine, dm)
    h = auth(dm)
    url = f"/api/sessions/{ids['session']}/runbook"
    client.put(f"{url}/blank", headers=h)

    r = client.patch(
        url,
        json={
            "scenes": [
                _scene("Ours", encounter_id=ids["here"]),
                _scene("Another arc's", encounter_id=ids["there"]),
                _scene("Gone", encounter_id=str(uuid.uuid4())),
                _scene("Nonsense", encounter_id="not-a-uuid"),
                _scene("None picked", encounter_id=None),
                _scene("Never asked"),
            ]
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    scenes = client.get(url, headers=h).json()["scenes"]
    assert [s.get("encounter_id") for s in scenes] == [ids["here"], None, None, None, None, None]
    assert "encounter_id" not in scenes[-1]


def test_another_dm_cannot_patch_the_scenes(client, api_engine):
    """The runbook belongs to the session's DM; a stranger is refused."""
    dm = "owner@example.com"
    ids = _seed(api_engine, dm)
    url = f"/api/sessions/{ids['session']}/runbook"
    client.put(f"{url}/blank", headers=auth(dm))
    r = client.patch(url, json={"scenes": [_scene("Mine now")]}, headers=auth("thief@example.com"))
    assert r.status_code in (403, 404)
    scenes = client.get(url, headers=auth(dm)).json()["scenes"]
    assert [s["title"] for s in scenes] == ["Scene 1"]
