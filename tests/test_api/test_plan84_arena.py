"""Practice Arena routes (Plan 84): capability URL, no auth, nothing written."""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.monster_repo import MonsterRepo
from domain.enums import CharacterClass, CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate


def _seed(engine) -> tuple[str, str]:
    """A campaign with one PC and one catalog goblin; return (pc_id, monster_id)."""
    dm = "arena-api@example.com"
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Ring", setting="R", tone="T", dm_email=dm)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name="Cory",
            character_name="Creed",
            race="Human",
            character_class=CharacterClass.FIGHTER,
            level=2,
            score_str=16,
            score_dex=12,
            score_con=14,
            score_int=8,
            score_wis=10,
            score_cha=10,
            hp_max=20,
            hp_current=20,
            ac=16,
            speed=30,
        )
        monster = MonsterRepo.create(
            s,
            MonsterStatBlockCreate(
                name=f"Goblin {uuid.uuid4().hex[:4]}",
                size=CreatureSize.SMALL,
                creature_type=CreatureType.HUMANOID,
                ac=15,
                hp_average=7,
                hp_formula="2d6",
                score_str=8,
                score_dex=14,
                score_con=10,
                score_int=10,
                score_wis=8,
                score_cha=8,
                challenge_rating="1/4",
                xp=50,
                proficiency_bonus=2,
                actions=[{"name": "Scimitar", "desc": "+4 to hit, 1d6+2 slashing"}],
            ),
        )
        return str(pc.id), str(monster.id)


def test_arena_flow_over_the_api(client, api_engine):
    """Foes list → start → act → the state round-trips; another PC's state is refused."""
    pc, mid = _seed(api_engine)
    foes = client.get(f"/api/play/{pc}/arena/foes")
    assert foes.status_code == 200 and any(f["id"] == mid for f in foes.json())

    started = client.post(f"/api/play/{pc}/arena/start", json={"monster_id": mid})
    assert started.status_code == 200, started.text
    state = started.json()
    assert state["pc"]["name"] == "Creed" and state["foe"]["hp_max"] == 7
    assert state["pc"]["attacks"][0]["key"] == "unarmed"

    acted = client.post(
        f"/api/play/{pc}/arena/act",
        json={"state": state, "action": {"kind": "attack", "key": "unarmed"}},
    )
    assert acted.status_code == 200, acted.text
    state = acted.json()
    assert state["action_used"] is True or state["phase"] == "over"
    assert len(state["log"]) >= 3

    bad = client.post(
        f"/api/play/{pc}/arena/act",
        json={"state": state, "action": {"kind": "attack", "key": "nope"}},
    )
    assert bad.status_code == 422 or state["phase"] == "over"

    other = client.post(
        f"/api/play/{uuid.uuid4()}/arena/act",
        json={"state": state, "action": {"kind": "end_turn"}},
    )
    assert other.status_code == 403

    # Nothing touched the real sheet.
    sheet = client.get(f"/api/play/{pc}")
    assert sheet.status_code == 200 and sheet.json()["hp_current"] == 20
