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
from db.repos.character_repo import CharacterRepo
from db.repos.monster_repo import MonsterRepo
from db.repos.session_repo import SessionRunbookRepo
from domain.battle_map import BattleMapCreate
from domain.character_builder import CharacterBuild
from domain.npc import NpcCreate
from domain.session import SessionRunbookCreate
from domain.table_state import TableStateUpdate
from services import (
    adventure_service,
    battle_map_service,
    campaign_service,
    character_builder_service,
    encounter_service,
    npc_service,
    session_service,
    table_service,
)

STARTER_NAME = "Your First Campaign (sample)"

# Plan 83 — two people to talk to, so the People tab and the brief aren't empty.
_STARTER_NPCS: list[dict[str, Any]] = [
    {
        "name": "Aldous Fenwright",
        "role": "the miller",
        "quick_who": "Grey, wet-eyed, hasn't slept in three days",
        "want_now": "His daughter Wren home before the bells ring again",
        "appearance": "Flour in his beard, mud to the knees, hat crushed in both hands.",
        "personality": "Talks in half-sentences. Keeps looking at the pond.",
        "motivation": "Get Wren back, and keep the town from blaming him.",
        "secret": (
            "He heard the bells the night Wren vanished and bolted his door instead of going "
            "out. He will never say so."
        ),
        "dialog_hooks": [
            "She went to the pond. She always went to the pond.",
            "The bells — you heard them too? Then I'm not mad.",
            "Take the road, not the reeds. The reeds aren't safe after dark.",
        ],
        "location": "The mill",
        "is_revealed": True,
    },
    {
        "name": "Tansy Quill",
        "role": "Wren's friend",
        "quick_who": "Fourteen, freckled, braver than she looks",
        "want_now": "Someone to believe her about the goblins",
        "appearance": "A borrowed cloak, a sling in her belt, a scab on one knuckle.",
        "personality": "Blunt. Tests you before she trusts you.",
        "motivation": "Find Wren, and prove she wasn't lying.",
        "secret": (
            "She was at the pond with Wren that night. She ran when the goblins came, and she "
            "hasn't forgiven herself."
        ),
        "dialog_hooks": [
            "I saw them. Small, quick, with bells on their belts. Nobody listens.",
            "If you're going down the mill road, I'm coming. Don't argue.",
            "Wren can swim. Whatever's in that pond, she isn't drowned.",
        ],
        "location": "The market square",
        "is_revealed": True,
    },
]

# Plan 83 — a ready runbook: the HUD's 🎬 Script opens straight onto read-aloud
# text, so "run tonight" means exactly that.
_STARTER_RUNBOOK: dict[str, Any] = {
    "opening_scene": (
        "Rain on the market awnings. The miller stands under the eaves with his hat in both "
        "hands, and behind him, faint under the rain, you hear it: a bell, ringing from "
        "somewhere under the millpond."
    ),
    "scenes": [
        {
            "title": "The miller's plea",
            "read_aloud": (
                "Aldous Fenwright grips your sleeve. 'Wren went to the pond three nights ago. "
                "She hasn't come home. The bells started that same night.' He presses a purse "
                "into your hand. 'Forty silver. All I have. Bring her back.'"
            ),
            "dm_notes": (
                "Let the players ask questions; answer with Aldous's lines. Tansy Quill pushes "
                "through the crowd and insists on coming. The purse is real. Everyone in town "
                "heard the bells; nobody went out."
            ),
            "estimated_minutes": 15,
        },
        {
            "title": "The mill road",
            "read_aloud": (
                "The road narrows between a low stone wall and the black water of the pond. "
                "Reeds lean over the verge. The bells are louder here — then they stop."
            ),
            "dm_notes": (
                "This is the fight: run 'Ambush at the mill road'. Passive Perception 12+ hears "
                "the goblins' belt-bells before they jump. The wall is half cover. Goblins flee "
                "at half strength; a captured one says Wren is 'with the singer, under the mill'."
            ),
            "estimated_minutes": 40,
        },
        {
            "title": "Under the mill",
            "read_aloud": (
                "Below the millwheel, a flooded cellar. Wren sits on a dry ledge with a goblin's "
                "brass bell in her lap, ringing it slowly, eyes far away. In the water beside "
                "her, something with too many teeth listens."
            ),
            "dm_notes": (
                "Not a second fight unless they force one. The 'singer' is a drowned spirit "
                "keeping Wren charmed; DC 12 Persuasion or Religion, or Tansy calling her name, "
                "breaks it. Cutting the bell's rope ends the ringing for good. Leave the thing "
                "in the water for a later night."
            ),
            "estimated_minutes": 25,
        },
    ],
    "npc_dialog": [
        {
            "npc_name": "Aldous Fenwright",
            "lines": [
                "She went to the pond. She always went to the pond.",
                "The bells — you heard them too? Then I'm not mad.",
                "Take the road, not the reeds. The reeds aren't safe after dark.",
            ],
            "improv_hooks": [
                "He knows more about the bells than he says.",
                "Won't step within ten feet of the water.",
            ],
        },
        {
            "npc_name": "Tansy Quill",
            "lines": [
                "I saw them. Small, quick, with bells on their belts. Nobody listens.",
                "If you're going down the mill road, I'm coming. Don't argue.",
                "Wren can swim. Whatever's in that pond, she isn't drowned.",
            ],
            "improv_hooks": [
                "Goes quiet if anyone mentions running away.",
                "Knows a dry path along the wall.",
            ],
        },
    ],
    "encounter_flows": [
        {
            "encounter_name": "Ambush at the mill road",
            "round_by_round": [
                "Goblins come over the wall, with advantage if unseen; the wolf circles wide.",
                "Goblins target whoever holds a light; the wolf tries to knock a straggler prone.",
                "At two goblins down the rest break and run for the reeds.",
            ],
            "tactics": (
                "Hit and run. The goblins want the party strung out on the road; the wolf wants "
                "someone alone."
            ),
            "terrain_notes": (
                "Low wall (half cover), muddy verge (difficult terrain), the pond (deep, cold)."
            ),
        }
    ],
    "closing_hooks": (
        "Wren is home and the bell is quiet. But the thing under the mill knows the party's "
        "faces now, and next market day someone else's child hears singing."
    ),
    "xp_awards": {"Ambush at the mill road": 200, "Breaking the charm": 100},
    "loot_awards": [{"name": "Goblin belt-bell (brass)", "note": "Rings on its own near water"}],
}

# AI-generated map from the demo world — ours to ship.
_STARTER_MAP_URL = (
    "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/"
    "c708579c-70e1-4811-8f58-d92504868d0c-kDyq5ThugnkcHPxSHyt9aegBQgCHcG.png"
)

# Plan 85 — the pregens go through the real character builder, so they have
# gear, spells, features and the same math as a player-built character.
_PREGENS: list[dict[str, Any]] = [
    dict(
        character_name="Bram Oakhelm",
        species="Human",
        character_class="Fighter",
        background="Soldier",
        scores={"STR": 15, "DEX": 13, "CON": 14, "INT": 10, "WIS": 12, "CHA": 8},
        background_bonus={"STR": 2, "CON": 1},
        skills=["Athletics", "Intimidation", "Perception", "Survival", "Insight"],
        origin_feat="Tough",
        kit="Chain mail, longsword & shield",
        appearance="Broad, sunburnt, a soldier's stillness.",
    ),
    dict(
        character_name="Lira Vell",
        species="Elf",
        character_class="Wizard",
        background="Sage",
        scores={"STR": 8, "DEX": 14, "CON": 13, "INT": 15, "WIS": 12, "CHA": 10},
        background_bonus={"INT": 2, "CON": 1},
        skills=["Arcana", "History", "Investigation", "Insight", "Perception"],
        cantrips=["Fire Bolt", "Mage Hand", "Light"],
        spells=["Magic Missile", "Shield", "Sleep", "Burning Hands"],
        kit="Quarterstaff & dagger",
        appearance="Ink on her fingers, a satchel heavier than she is.",
    ),
    dict(
        character_name="Tessa Quickfoot",
        species="Halfling",
        character_class="Rogue",
        background="Criminal",
        scores={"STR": 8, "DEX": 15, "CON": 14, "INT": 13, "WIS": 10, "CHA": 12},
        background_bonus={"DEX": 2, "CON": 1},
        skills=[
            "Sleight of Hand",
            "Stealth",
            "Acrobatics",
            "Deception",
            "Perception",
            "Investigation",
        ],
        kit="Leather, shortsword, shortbow, daggers",
        appearance="Small, quick, always near a door.",
    ),
    dict(
        character_name="Brother Aldous",
        species="Dwarf",
        character_class="Cleric",
        background="Acolyte",
        scores={"STR": 13, "DEX": 8, "CON": 14, "INT": 10, "WIS": 15, "CHA": 12},
        background_bonus={"WIS": 2, "CHA": 1},
        skills=["Insight", "Religion", "Medicine", "Persuasion"],
        cantrips=["Sacred Flame", "Guidance", "Thaumaturgy"],
        spells=["Cure Wounds", "Bless", "Guiding Bolt", "Healing Word"],
        kit="Chain shirt, shield, mace",
        appearance="A beard braided with prayer beads, a mace that has seen use.",
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


def find_starter(db: DBSession, dm_email: str) -> dict[str, Any] | None:
    """Ids of this DM's existing sample campaign, in the shape ``seed_starter`` returns.

    Plan 83 — the dashboard button opens the sample night straight into the HUD
    whether it was just built or already existed.

    Args:
        db: Active database session.
        dm_email: The DM's email.

    Returns:
        ``{"campaign_id", "adventure_id", "session_id"}`` or None if there is no sample.
    """
    from db.repos.adventure_repo import AdventureRepo
    from db.repos.session_repo import SessionRepo

    campaign = next(
        (c for c in CampaignRepo.list_by_dm(db, dm_email) if c.name == STARTER_NAME), None
    )
    if campaign is None:
        return None
    adventures = AdventureRepo.list_by_campaign(db, campaign.id)
    adventure = adventures[0] if adventures else None
    sessions = SessionRepo.list_by_adventure(db, adventure.id) if adventure else []
    game_session = min(sessions, key=lambda g: g.session_number) if sessions else None
    if game_session is not None:
        _refresh_starter(db, campaign.id, game_session, dm_email)
    return {
        "campaign_id": str(campaign.id),
        "adventure_id": str(adventure.id) if adventure else None,
        "session_id": str(game_session.id) if game_session else None,
    }


def _refresh_starter(
    db: DBSession, campaign_id: uuid.UUID, game_session: Any, dm_email: str
) -> None:
    """Bring a sample built before Plan 83 up to date, without touching play state.

    Adds the two NPCs and the runbook if they're missing and drops the doubled
    "Session 1 —" from the title. Anything the DM changed themselves is left.

    Args:
        db: Active database session.
        campaign_id: The sample campaign.
        game_session: Its first session (a GameSession row).
        dm_email: The owning DM.
    """
    from db.repos.npc_repo import NpcRepo

    have = {n.name for n in NpcRepo.list_by_campaign(db, campaign_id)}
    for npc in _STARTER_NPCS:
        if npc["name"] not in have:
            npc_service.create_npc(db, campaign_id, dm_email, NpcCreate(**npc))
    if SessionRunbookRepo.get_by_session(db, game_session.id) is None:
        SessionRunbookRepo.create(
            db,
            SessionRunbookCreate(
                session_id=game_session.id, model_used="starter", **_STARTER_RUNBOOK
            ),
        )
    if game_session.title == "Session 1 — The Millpond Bells":
        game_session.title = "The Millpond Bells"
        db.add(game_session)
        db.commit()


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
        built = character_builder_service.create(
            db, campaign.id, CharacterBuild(player_name=f"Player {i + 1}", level=1, **pre)
        )
        row = CharacterRepo.get_by_id(db, uuid.UUID(str(built.pc_id)))
        if row is not None:
            pcs.append(row)
    for npc in _STARTER_NPCS:
        npc_service.create_npc(db, campaign.id, dm_email, NpcCreate(**npc))
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
        title="The Millpond Bells",
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
    SessionRunbookRepo.create(
        db,
        SessionRunbookCreate(session_id=game_session.id, model_used="starter", **_STARTER_RUNBOOK),
    )
    return {
        "campaign_id": str(campaign.id),
        "adventure_id": str(adventure.id),
        "session_id": str(game_session.id),
        "id": str(uuid.uuid4()),
    }
