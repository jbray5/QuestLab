"""Session pack linking tests (Plan 70) — Claude stubbed, linking real.

The AI call is faked; what's under test is the LINK phase: catalog
monster resolution into encounter rows, NPC creation with collision
skips, loot tagging, and the runbook save.
"""

import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.session_pack_service as pack_svc
import services.session_service as sess_svc
from db.repos.monster_repo import MonsterRepo
from db.repos.npc_repo import NpcRepo
from domain.enums import CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate
from domain.npc import NpcCreate
from services import npc_service


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _world(db):
    dm = _dm()
    campaign = camp_svc.create_campaign(db, name="C", setting="R", tone="grim", dm_email=dm)
    adventure = adv_svc.create_adventure(
        db,
        campaign_id=campaign.id,
        title="Adv",
        synopsis="s",
        tier="Tier1",
        act_count=3,
        dm_email=dm,
    )
    game_session = sess_svc.create_session(
        db,
        adventure_id=adventure.id,
        session_number=1,
        title="Night One",
        dm_email=dm,
        date_planned=None,
        attending_pc_ids=[],
    )
    return dm, campaign, adventure, game_session


def _fake_pack(monster_name: str) -> pack_svc._PackOutput:
    return pack_svc._PackOutput(
        opening_scene="The fog parts.",
        scenes=[
            pack_svc._PackScene(
                title="Arrival", read_aloud="You arrive.", dm_notes="x", stage_map=None
            )
        ],
        encounters=[
            pack_svc._PackEncounter(
                name="Ambush at the Ford",
                tactics="Focus the healer.",
                round_by_round=["R1: charge"],
                monsters=[
                    pack_svc._PackMonster(name=monster_name, count=2),
                    pack_svc._PackMonster(name="Definitely Not Real", count=1),
                ],
            )
        ],
        npcs=[
            pack_svc._PackNpc(name="Maro the Ferryman", role="guide"),
            pack_svc._PackNpc(name="Existing Ned", role="dupe"),
        ],
        loot=[pack_svc._PackLoot(item_name="Potion of Healing", note="on the hag")],
        closing_hooks="A bell tolls.",
        xp_awards={"base_award": 300},
    )


class TestSessionPackLinking:
    """Link phase: rows created, dupes skipped, warnings surfaced."""

    def test_pack_links_everything(self, duckdb_session: Session, monkeypatch):
        dm, campaign, adventure, game_session = _world(duckdb_session)
        monster = MonsterRepo.create(
            duckdb_session,
            MonsterStatBlockCreate(
                name="Bog Wretch",
                size=CreatureSize.MEDIUM,
                creature_type=CreatureType.MONSTROSITY,
                ac=12,
                hp_average=22,
                hp_formula="4d8+4",
                score_str=14,
                score_dex=10,
                score_con=12,
                score_int=5,
                score_wis=10,
                score_cha=5,
                challenge_rating="1/2",
                xp=100,
                proficiency_bonus=2,
                is_custom=True,
            ),
        )
        npc_service.create_npc(
            duckdb_session,
            campaign_id=campaign.id,
            dm_email=dm,
            payload=NpcCreate(name="Existing Ned"),
        )
        monkeypatch.setattr(pack_svc, "complete_json", lambda **kw: _fake_pack(monster.name))

        result = pack_svc.generate_session_pack(
            duckdb_session, game_session.id, dm, premise="A foggy ambush."
        )

        assert result["scenes"] == 1
        assert len(result["encounters"]) == 1
        assert result["encounters"][0]["name"] == "Ambush at the Ford"
        assert any("Definitely Not Real" in w for w in result["warnings"])
        assert any("Existing Ned" in w for w in result["warnings"])
        assert [n["name"] for n in result["npcs"]] == ["Maro the Ferryman"]
        # NPC actually landed on the roster.
        rows = {n.name: n for n in NpcRepo.list_by_campaign(duckdb_session, campaign.id)}
        assert "Maro the Ferryman" in rows
        # Unmet by definition — never on a player sheet until the DM reveals them.
        assert rows["Maro the Ferryman"].is_revealed is False
        # Runbook saved with the pack's scenes.
        runbook = sess_svc.get_runbook(duckdb_session, game_session.id, dm)
        assert runbook is not None and runbook.opening_scene == "The fog parts."

    def test_pack_requires_ownership(self, duckdb_session: Session, monkeypatch):
        _dm_email, _c, _a, game_session = _world(duckdb_session)
        monkeypatch.setattr(pack_svc, "complete_json", lambda **kw: _fake_pack("x"))
        with pytest.raises(PermissionError):
            pack_svc.generate_session_pack(
                duckdb_session, game_session.id, "intruder@example.com", premise="p"
            )
