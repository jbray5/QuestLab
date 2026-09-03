"""Onboarding (Plan 73): a starter campaign for a brand-new DM.

One click gives a newcomer a campaign with an adventure, four pregens they
can hand to players, a battle map already staged with tokens, and an
encounter — a table they can run tonight, and a template for their own.
Every asset here is shippable: SRD monsters and AI-generated art only.
"""

import uuid
from typing import Any

from sqlmodel import Session as DBSession

from db.repos.campaign_repo import CampaignRepo
from db.repos.monster_repo import MonsterRepo
from domain.battle_map import BattleMapCreate
from domain.enums import CharacterClass
from domain.table_state import TableStateUpdate
from services import (
    adventure_service,
    battle_map_service,
    campaign_service,
    character_service,
    encounter_service,
    session_service,
    table_service,
)

STARTER_NAME = "Your First Campaign (sample)"

# AI-generated map from the demo world — ours to ship.
_STARTER_MAP_URL = (
    "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/"
    "c708579c-70e1-4811-8f58-d92504868d0c-kDyq5ThugnkcHPxSHyt9aegBQgCHcG.png"
)

_PREGENS: list[dict[str, Any]] = [
    dict(
        character_name="Bram Oakhelm",
        race="Human",
        character_class=CharacterClass.FIGHTER,
        score_str=16,
        score_dex=12,
        score_con=15,
        score_int=10,
        score_wis=13,
        score_cha=8,
        hp_max=12,
        ac=16,
    ),
    dict(
        character_name="Lira Vell",
        race="Elf",
        character_class=CharacterClass.WIZARD,
        score_str=8,
        score_dex=14,
        score_con=13,
        score_int=16,
        score_wis=12,
        score_cha=10,
        hp_max=8,
        ac=12,
    ),
    dict(
        character_name="Tessa Quickfoot",
        race="Halfling",
        character_class=CharacterClass.ROGUE,
        score_str=10,
        score_dex=16,
        score_con=12,
        score_int=13,
        score_wis=10,
        score_cha=14,
        hp_max=10,
        ac=14,
    ),
    dict(
        character_name="Brother Aldous",
        race="Dwarf",
        character_class=CharacterClass.CLERIC,
        score_str=13,
        score_dex=10,
        score_con=14,
        score_int=10,
        score_wis=16,
        score_cha=12,
        hp_max=11,
        ac=16,
    ),
]


def has_starter(db: DBSession, dm_email: str) -> bool:
    """Whether this DM already has the sample campaign.

    Args:
        db: Active database session.
        dm_email: The DM's email.

    Returns:
        True if a campaign named like the starter exists.
    """
    return any(c.name == STARTER_NAME for c in CampaignRepo.list_by_dm(db, dm_email))


def seed_starter(db: DBSession, dm_email: str) -> dict[str, Any]:
    """Create the sample campaign for ``dm_email`` and stage its first table.

    Args:
        db: Active database session.
        dm_email: The signed-in DM.

    Returns:
        ``{"campaign_id", "adventure_id", "session_id"}``.
    """
    campaign = campaign_service.create_campaign(
        db,
        name=STARTER_NAME,
        setting="A rain-soaked market town on the edge of an old forest",
        tone="Classic heroic fantasy — warm, a little spooky",
        dm_email=dm_email,
    )
    adventure = adventure_service.create_adventure(
        db,
        campaign_id=campaign.id,
        title="The Millpond Bells",
        synopsis=(
            "Bells ring under the millpond at night. The miller's daughter is missing, and the "
            "town will pay whoever brings her home. A one-night adventure to learn the table."
        ),
        tier="Tier1",
        act_count=1,
        dm_email=dm_email,
    )
    pcs = []
    for i, pre in enumerate(_PREGENS):
        pcs.append(
            character_service.create_character(
                db,
                campaign_id=campaign.id,
                dm_email=dm_email,
                player_name=f"Player {i + 1}",
                level=1,
                hp_current=pre["hp_max"],
                speed=25 if pre["race"] in ("Dwarf", "Halfling") else 30,
                **pre,
            )
        )
    monsters = {m.name: m for m in MonsterRepo.list_all(db)}
    roster = []
    for name, count in (("Goblin", 4), ("Wolf", 1)):
        if name in monsters:
            roster.append({"monster_id": str(monsters[name].id), "count": count})
    encounter_service.create_encounter(
        db,
        adventure_id=adventure.id,
        name="Ambush at the mill road",
        dm_email=dm_email,
        description="Goblins and a wolf hit the party where the road narrows by the millpond.",
        monster_roster=roster,
        terrain_notes="Muddy road, a low stone wall for cover, the pond on the east side.",
        read_aloud_text=(
            "The bells stop. In the silence you hear the reeds move — and then the goblins come "
            "over the wall."
        ),
        pc_levels=[1, 1, 1, 1],
    )
    battle_map = battle_map_service.create_map(
        db,
        campaign.id,
        dm_email,
        BattleMapCreate(
            name="The Mill Road", image_url=_STARTER_MAP_URL, width=1536, height=1024, grid_size=64
        ),
    )
    game_session = session_service.create_session(
        db,
        adventure_id=adventure.id,
        session_number=1,
        title="Session 1 — The Millpond Bells",
        dm_email=dm_email,
        date_planned=None,
        attending_pc_ids=[pc.id for pc in pcs],
    )
    tokens = [
        {
            "id": f"pc-{pc.id}",
            "kind": "pc",
            "ref_id": str(pc.id),
            "label": pc.character_name,
            "image_url": None,
            "x": 1536 * (0.28 + 0.11 * i),
            "y": 1024 * 0.72,
            "size": 1,
        }
        for i, pc in enumerate(pcs)
    ]
    table_service.update_table_state(
        db,
        game_session.id,
        dm_email,
        TableStateUpdate(active_map_id=battle_map.id, title="The Mill Road", tokens=tokens),
    )
    return {
        "campaign_id": str(campaign.id),
        "adventure_id": str(adventure.id),
        "session_id": str(game_session.id),
        "id": str(uuid.uuid4()),
    }
