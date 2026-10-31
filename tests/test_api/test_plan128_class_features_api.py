"""Every class feature at a PC's level, for the DM's sheet and the player's phone (Plan 128)."""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from domain.enums import CharacterClass
from services import feature_service

# These suites address players by UUID (pre-token links); see conftest.uuid_play_links.
pytestmark = pytest.mark.usefixtures("uuid_play_links")

DM = "classfeatures@example.com"
H = {"X-MS-CLIENT-PRINCIPAL-NAME": DM}


def _paladin(engine, level=5, subclass=None) -> str:
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Thursday", dm_email=DM)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=DM,
            player_name="Marco",
            character_name=f"Ser Corwin {uuid.uuid4().hex[:4]}",
            race="Dwarf",
            character_class=CharacterClass.PALADIN,
            subclass=subclass,
            level=level,
            score_str=17,
            score_dex=10,
            score_con=14,
            score_int=8,
            score_wis=12,
            score_cha=14,
            hp_max=49,
            hp_current=49,
            ac=18,
            speed=30,
        )
        return str(pc.id)


def test_dm_gets_every_feature_at_the_level(client, api_engine):
    pc = _paladin(api_engine)
    r = client.get(f"/api/characters/{pc}/class-features", headers=H)
    assert r.status_code == 200, r.text
    rows = r.json()
    names = [row["name"] for row in rows]
    assert {"Lay on Hands", "Extra Attack", "Weapon Mastery", "Paladin's Smite"} <= set(names)
    assert all(row["source"] in ("class", "subclass") and row["note"] for row in rows)
    aura = client.get(
        f"/api/characters/{_paladin(api_engine, level=6)}/class-features", headers=H
    ).json()
    assert any(row["name"] == "Aura of Protection" and "(+2)" in row["note"] for row in aura)


def test_other_dms_and_missing_pcs_are_refused(client, api_engine):
    pc = _paladin(api_engine)
    other = {"X-MS-CLIENT-PRINCIPAL-NAME": "someone-else@example.com"}
    assert client.get(f"/api/characters/{pc}/class-features", headers=other).status_code == 403
    missing = client.get(f"/api/characters/{uuid.uuid4()}/class-features", headers=H)
    assert missing.status_code == 404
    assert client.get(f"/api/characters/{pc}/class-features").status_code == 401


def test_the_phone_gets_the_same_list(client, api_engine):
    pc = _paladin(api_engine, level=7, subclass="Oath of Devotion")
    phone = client.get(f"/api/play/{pc}/class-features")
    assert phone.status_code == 200, phone.text
    dm = client.get(f"/api/characters/{pc}/class-features", headers=H).json()
    assert phone.json() == dm
    subs = {row["name"] for row in phone.json() if row["source"] == "subclass"}
    assert "Sacred Weapon" in subs and "Aura of Devotion" in subs


def test_tracked_features_reach_the_phone_after_sync(client, api_engine):
    """Builder and level-up both call sync_for_level; the phone then lists Lay on Hands."""
    pc = _paladin(api_engine)
    with Session(api_engine) as s:
        feature_service.sync_for_level(s, uuid.UUID(pc), DM)
    rows = client.get(f"/api/play/{pc}/features").json()
    loh = next(r for r in rows if r["feature_name"] == "Lay on Hands")
    assert loh["max_uses"] == 25
    kit = client.get(f"/api/play/{pc}/turn-kit").json()
    loh_opt = next(o for o in kit["bonus"] if o["key"] == "lay_on_hands")
    assert loh_opt["uses_left"] == 25
