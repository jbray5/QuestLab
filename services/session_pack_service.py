"""AI Session Packs (Plan 70 / Field Guide #5).

One premise in, a PLAYABLE session out — not just prose. The pack call
generates a full session plan and then LINKS it into the HUD: real
Encounter rows with catalog monsters resolved to stat blocks, real NPC
rows on the campaign roster, loot resolved against the item catalog,
and the runbook (scenes, dialog, encounter flows) saved on the session.
Scene entries carry a ``stage_map`` name matched to the campaign's
battle-map library so the DM knows what to stage per scene.

Claude picks monsters and maps from lists we hand it — generation is
constrained to what actually exists, so linking is resolution, not
guesswork.
"""

import logging
import uuid
from typing import Any, Optional

from pydantic import BaseModel, Field
from sqlmodel import Session as DBSession

from db.repos.adventure_repo import AdventureRepo
from db.repos.battle_map_repo import BattleMapRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.item_repo import ItemRepo
from db.repos.monster_repo import MonsterRepo
from db.repos.npc_repo import NpcRepo
from db.repos.session_repo import SessionRepo
from domain.npc import NpcCreate
from domain.session import SessionRunbookCreate
from integrations.claude_client import complete_json
from services import encounter_service, npc_service, session_service

logger = logging.getLogger(__name__)

_MODEL = "claude-sonnet-5"

# CR ceilings per adventure tier — keeps the picker honest for the party.
_TIER_CR_CAP = {"Tier1": 5.0, "Tier2": 11.0, "Tier3": 17.0, "Tier4": 30.0}


class _PackMonster(BaseModel):
    """One monster line in a generated encounter (catalog name + count)."""

    name: str
    count: int = Field(ge=1, le=12)


class _PackEncounter(BaseModel):
    """A generated encounter, ready to link."""

    name: str
    description: str = ""
    read_aloud: str = ""
    terrain_notes: str = ""
    tactics: str = ""
    round_by_round: list[str] = Field(default_factory=list)
    monsters: list[_PackMonster] = Field(default_factory=list)


class _PackNpc(BaseModel):
    """A generated NPC, ready for the campaign roster."""

    name: str
    role: str = ""
    race: str = ""
    appearance: str = ""
    personality: str = ""
    motivation: str = ""
    voice: str = ""
    quick_who: str = ""
    want_now: str = ""
    secret_short: str = ""
    dialog_lines: list[str] = Field(default_factory=list)
    improv_hooks: list[str] = Field(default_factory=list)


class _PackScene(BaseModel):
    """A runbook scene with an optional map to stage."""

    title: str
    read_aloud: str
    dm_notes: str = ""
    estimated_minutes: int = 20
    stage_map: Optional[str] = None


class _PackLoot(BaseModel):
    """One loot line: a catalog item name or a custom description."""

    item_name: str
    note: str = ""


class _PackOutput(BaseModel):
    """The full structured pack from Claude."""

    opening_scene: str
    scenes: list[_PackScene]
    encounters: list[_PackEncounter]
    npcs: list[_PackNpc]
    loot: list[_PackLoot] = Field(default_factory=list)
    closing_hooks: str = ""
    xp_awards: dict[str, int] = Field(default_factory=dict)


def _cr_value(cr: str) -> float:
    """Numeric CR from the string form ('1/4' → 0.25)."""
    try:
        if "/" in cr:
            a, b = cr.split("/")
            return float(a) / float(b)
        return float(cr)
    except (ValueError, ZeroDivisionError):
        return 30.0


def generate_session_pack(
    db: DBSession, session_id: uuid.UUID, dm_email: str, premise: str
) -> dict[str, Any]:
    """Generate a fully linked session pack from a one-paragraph premise.

    Args:
        db: Active database session.
        session_id: UUID of the session to pack.
        dm_email: Requesting DM (ownership enforced).
        premise: The DM's premise / notes for tonight.

    Returns:
        Summary dict: created encounter/NPC descriptors, runbook scene
        count, loot lines, and any resolution warnings.

    Raises:
        ValueError: If the session/adventure/campaign is missing.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = SessionRepo.get_by_id(db, session_id)
    if game_session is None:
        raise ValueError(f"Session {session_id} not found.")
    adventure = AdventureRepo.get_by_id(db, game_session.adventure_id)
    if adventure is None:
        raise ValueError("Adventure not found.")
    campaign = CampaignRepo.get_by_id(db, adventure.campaign_id)
    if campaign is None:
        raise ValueError("Campaign not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to access this session.")

    pcs = CharacterRepo.list_by_campaign(db, campaign.id)
    pc_ids = {str(p) for p in (game_session.attending_pc_ids or [])}
    attending = [p for p in pcs if str(p.id) in pc_ids] or pcs
    pc_levels = [p.level for p in attending]

    # Constrain generation to what exists: monsters in the tier's CR band,
    # the campaign's map library, and the magic-item catalog.
    tier = getattr(adventure.tier, "value", str(adventure.tier))
    cr_cap = _TIER_CR_CAP.get(tier, 5.0)
    monsters = [m for m in MonsterRepo.list_all(db) if _cr_value(m.challenge_rating) <= cr_cap]

    def _ctype(m: Any) -> str:
        return str(getattr(m.creature_type, "value", m.creature_type))

    monster_lines = "\n".join(
        f"- {m.name} (CR {m.challenge_rating}, {_ctype(m)})" for m in monsters[:150]
    )
    monster_by_name = {m.name.lower(): m for m in monsters}

    maps = BattleMapRepo.list_for_campaign(db, campaign.id)
    map_names = [m.name for m in maps]
    items = ItemRepo.list_all(db)
    item_names = [i.name for i in items][:90]

    existing_npcs = {n.name.lower() for n in NpcRepo.list_by_campaign(db, campaign.id)}

    pc_lines = "\n".join(
        f"- {p.character_name}, level {p.level} {p.race} "
        f"{getattr(p.character_class, 'value', p.character_class)}"
        for p in attending
    )

    system = f"""You are an expert D&D 5e (2024 rules) session designer.
You build complete, playable session packs a DM runs directly from their table HUD.

## Campaign
{campaign.name} — {campaign.setting or ''} — tone: {campaign.tone or 'classic fantasy'}
World notes: {campaign.world_notes or 'None'}

## Adventure
{adventure.title} ({tier}) — {adventure.synopsis or ''}

## Party (attending)
{pc_lines}

## HARD CONSTRAINTS
- Encounter monsters MUST be chosen from this catalog, by EXACT name:
{monster_lines}
- Scene "stage_map" values MUST be an EXACT name from this battle-map
  library (or null if nothing fits): {map_names or '[]'}
- Prefer loot item_name values from this catalog (invent sparingly):
  {item_names}
- Respect the campaign's established lore. Invent scene detail freely,
  but never contradict the premise or world notes."""

    user = f"""Tonight's premise from the DM:

\"\"\"{premise.strip()[:4000]}\"\"\"

Build the full session pack for Session {game_session.session_number}:
\"{game_session.title}\". Return JSON with EXACTLY these fields:
{{
  "opening_scene": "2-3 sentence read-aloud that opens the night",
  "scenes": [{{"title": str, "read_aloud": str, "dm_notes": str,
               "estimated_minutes": int, "stage_map": str|null}}],
  "encounters": [{{"name": str, "description": str, "read_aloud": str,
                   "terrain_notes": str, "tactics": str,
                   "round_by_round": [str, ...],
                   "monsters": [{{"name": EXACT catalog name, "count": int}}]}}],
  "npcs": [{{"name": str, "role": str, "race": str, "appearance": str,
             "personality": str, "motivation": str, "voice": str,
             "quick_who": str, "want_now": str, "secret_short": str,
             "dialog_lines": [str], "improv_hooks": [str]}}],
  "loot": [{{"item_name": str, "note": str}}],
  "closing_hooks": str,
  "xp_awards": {{"base_award": int, "bonus_award": int}}
}}

3-4 scenes, 1-2 encounters balanced for the party, 2-3 NEW NPCs (do not
reuse these existing names: {sorted(existing_npcs) or 'none'}), 2-4 loot
lines. Make read-alouds atmospheric and the tactics concrete."""

    pack: _PackOutput = complete_json(
        system=system, user=user, schema=_PackOutput, max_tokens=16384
    )

    warnings: list[str] = []

    # ── Link encounters: resolve monsters → catalog rows, create rows. ──
    created_encounters: list[dict[str, Any]] = []
    for enc in pack.encounters:
        roster: list[dict[str, Any]] = []
        for pm in enc.monsters:
            match = monster_by_name.get(pm.name.lower())
            if match is None:
                # Loose fallback: substring either way.
                match = next(
                    (
                        m
                        for k, m in monster_by_name.items()
                        if pm.name.lower() in k or k in pm.name.lower()
                    ),
                    None,
                )
            if match is None:
                warnings.append(f"Monster not in catalog, dropped: {pm.name}")
                continue
            roster.append({"monster_id": str(match.id), "count": pm.count})
        row = encounter_service.create_encounter(
            db,
            adventure_id=adventure.id,
            name=enc.name,
            dm_email=dm_email,
            description=enc.description or None,
            monster_roster=roster,
            terrain_notes=enc.terrain_notes or None,
            read_aloud_text=enc.read_aloud or None,
            dm_notes=enc.tactics or None,
            pc_levels=pc_levels,
        )
        created_encounters.append(
            {
                "id": str(row.id),
                "name": row.name,
                "difficulty": getattr(row.difficulty, "value", str(row.difficulty)),
                "monsters": [
                    {"name": monster_by_name.get(pm.name.lower()) and pm.name, "count": pm.count}
                    for pm in enc.monsters
                ],
            }
        )

    # ── Link NPCs onto the campaign roster (skip name collisions). ──
    created_npcs: list[dict[str, str]] = []
    for n in pack.npcs:
        if n.name.lower() in existing_npcs:
            warnings.append(f"NPC name already exists, skipped: {n.name}")
            continue
        npc_service.create_npc(
            db,
            campaign_id=campaign.id,
            dm_email=dm_email,
            payload=NpcCreate(
                name=n.name,
                role=n.role[:120] or None,
                race=n.race[:80] or None,
                appearance=n.appearance or None,
                personality=n.personality or None,
                motivation=n.motivation or None,
                voice=n.voice[:200] or None,
                quick_who=n.quick_who[:120] or None,
                want_now=n.want_now[:200] or None,
                secret_short=n.secret_short[:200] or None,
                dialog_hooks=n.improv_hooks or None,
                # Unmet by definition: players see an NPC only once the DM reveals them.
                is_revealed=False,
            ),
        )
        created_npcs.append({"name": n.name, "role": n.role})

    # ── Loot: resolve against the item catalog. ──
    item_by_name = {i.name.lower(): i for i in items}
    loot_lines: list[str] = []
    for entry in pack.loot:
        match = item_by_name.get(entry.item_name.lower())
        tag = "catalog" if match else "custom"
        loot_lines.append(f"{entry.item_name} ({tag})" + (f" — {entry.note}" if entry.note else ""))

    # ── Runbook: scenes carry stage_map; dialog + flows from the pack. ──
    runbook = SessionRunbookCreate(
        session_id=session_id,
        model_used=_MODEL,
        opening_scene=pack.opening_scene,
        scenes=[s.model_dump() for s in pack.scenes],
        npc_dialog=[
            {
                "npc_name": n.name,
                "lines": n.dialog_lines,
                "improv_hooks": n.improv_hooks,
            }
            for n in pack.npcs
        ],
        encounter_flows=[
            {
                "encounter_name": e.name,
                "round_by_round": e.round_by_round,
                "tactics": e.tactics,
                "terrain_notes": e.terrain_notes,
            }
            for e in pack.encounters
        ],
        closing_hooks=pack.closing_hooks or None,
        xp_awards=dict(pack.xp_awards) or None,
        loot_awards=loot_lines or None,
    )
    session_service.save_runbook(db, session_id, dm_email, runbook)

    return {
        "encounters": created_encounters,
        "npcs": created_npcs,
        "scenes": len(pack.scenes),
        "loot": loot_lines,
        "warnings": warnings,
    }
