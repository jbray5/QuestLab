"""AI service — all Claude-powered generation functions for QuestLab.

All raw API calls go through integrations.claude_client. No direct anthropic
imports allowed here. All public functions return typed Python objects.

Available generators:
- generate_session_runbook   — full session plan from campaign + session context
- generate_npc_dialog        — quotable lines + improv hooks for an NPC
- generate_loot_table        — tier-appropriate loot entries
- generate_monster_flavor    — read-aloud flavor for a monster appearance
- generate_npc               — complete NPC with personality + dialog hooks
- generate_adventure_hook    — opening hook paragraph for a new adventure
"""

import uuid
from typing import Any, Optional

from pydantic import BaseModel
from sqlmodel import Session as DBSession

from db.repos.adventure_repo import AdventureRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.encounter_repo import EncounterRepo
from db.repos.session_repo import SessionRepo
from domain.enums import AdventureTier
from domain.session import SessionRunbookCreate
from integrations.claude_client import complete, complete_json

_MODEL = "claude-opus-4-6"

# ---------------------------------------------------------------------------
# Internal Pydantic schemas — shape of Claude's JSON output
# ---------------------------------------------------------------------------


class _Scene(BaseModel):
    """A single scene in the session runbook."""

    title: str
    read_aloud: str
    dm_notes: str
    estimated_minutes: int = 20


class _NPCDialog(BaseModel):
    """Quotable dialog block for one NPC."""

    npc_name: str
    lines: list[str]
    improv_hooks: list[str]


class _EncounterFlow(BaseModel):
    """Round-by-round tactical guide for one encounter."""

    encounter_name: str
    round_by_round: list[str]
    tactics: str
    terrain_notes: str = ""


class _RunbookOutput(BaseModel):
    """Full structured runbook from Claude."""

    opening_scene: str
    scenes: list[_Scene]
    npc_dialog: list[_NPCDialog]
    encounter_flows: list[_EncounterFlow]
    closing_hooks: str
    xp_awards: dict[str, int]
    loot_notes: str = ""


class _LootEntry(BaseModel):
    """A single loot table entry."""

    name: str
    rarity: str
    description: str
    value_gp: int = 0
    quantity: int = 1


class _LootOutput(BaseModel):
    """Loot table output from Claude."""

    entries: list[_LootEntry]


class _NPCOutput(BaseModel):
    """Full NPC profile from Claude."""

    name: str
    appearance: str
    personality: str
    secret: str
    dialog_hooks: list[str]


# ---------------------------------------------------------------------------
# Session runbook
# ---------------------------------------------------------------------------


def generate_session_runbook(
    db: DBSession,
    session_id: uuid.UUID,
    dm_email: str,
    extra_notes: Optional[str] = None,
) -> SessionRunbookCreate:
    """Generate a full AI session runbook for a game session.

    Loads all context from the DB (campaign, adventure, PCs, encounters)
    and calls Claude to produce a structured session plan.

    Args:
        db: Active database session.
        session_id: UUID of the game session to generate for.
        dm_email: Email of the requesting DM (for ownership verification).
        extra_notes: Optional free-text DM notes to include in the prompt.

    Returns:
        SessionRunbookCreate payload ready to persist via session_service.save_runbook().

    Raises:
        ValueError: If the session, adventure, or campaign is not found.
        PermissionError: If the DM does not own the campaign.
        anthropic.APIError: On Claude API failures.
    """
    # Load all context
    game_session = SessionRepo.get_by_id(db, session_id)
    if game_session is None:
        raise ValueError(f"Session {session_id} not found.")

    adventure = AdventureRepo.get_by_id(db, game_session.adventure_id)
    if adventure is None:
        raise ValueError(f"Adventure {game_session.adventure_id} not found.")

    campaign = CampaignRepo.get_by_id(db, adventure.campaign_id)
    if campaign is None:
        raise ValueError("Campaign not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to access this session.")

    # Load attending PCs
    pc_ids = [uuid.UUID(str(pid)) for pid in (game_session.attending_pc_ids or [])]
    all_pcs = CharacterRepo.list_by_campaign(db, campaign.id)
    attending_pcs = [pc for pc in all_pcs if pc.id in pc_ids] if pc_ids else all_pcs[:4]

    # Load encounters for the adventure
    encounters = EncounterRepo.list_by_adventure(db, adventure.id)

    # Build NPC roster text
    npcs = adventure.npc_roster or []
    npc_lines = (
        "\n".join(
            f"  - {n.get('name')} ({n.get('role')}): {n.get('description', '')}" for n in npcs
        )
        or "  None listed"
    )

    # Build PC roster text
    pc_lines = (
        "\n".join(
            f"  - {pc.character_name}, {pc.character_class.value} {pc.level} "
            f"(HP {pc.hp_max}, AC {pc.ac})"
            + (f" — Backstory: {pc.backstory[:80]}..." if pc.backstory else "")
            for pc in attending_pcs
        )
        or "  No PCs specified"
    )

    # Build encounter text
    enc_lines = (
        "\n".join(
            f"  - {enc.name} ({enc.difficulty.value}, {enc.xp_budget:,} XP budget): "
            f"{len(enc.monster_roster or [])} monster type(s). "
            + (f"Notes: {enc.dm_notes[:80]}" if enc.dm_notes else "")
            for enc in encounters
        )
        or "  No encounters planned"
    )

    tier_labels = {
        AdventureTier.TIER1: "Tier 1 (Levels 1–4)",
        AdventureTier.TIER2: "Tier 2 (Levels 5–10)",
        AdventureTier.TIER3: "Tier 3 (Levels 11–16)",
        AdventureTier.TIER4: "Tier 4 (Levels 17–20)",
    }

    system = f"""You are an expert D&D 5e (2024 rules) Dungeon Master assistant.
You write vivid, practical session runbooks that DMs can use at the table.

## Campaign Context
- Campaign: {campaign.name}
- Setting: {campaign.setting}
- Tone: {campaign.tone}
- World Notes: {campaign.world_notes or 'None'}

## Adventure Context
- Adventure: {adventure.title}
- Tier: {tier_labels.get(adventure.tier, str(adventure.tier))}
- Synopsis: {adventure.synopsis or 'Not provided'}
- Location Notes: {adventure.location_notes or 'None'}
- Acts: {adventure.act_count}

## Session {game_session.session_number}: {game_session.title}

### Player Characters (Attending)
{pc_lines}

### NPC Roster
{npc_lines}

### Encounters
{enc_lines}

{('### DM Notes\\n' + extra_notes) if extra_notes else ''}
"""

    session_ref = f'Session {game_session.session_number}: "{game_session.title}"'
    user = f"""Generate a complete session runbook for {session_ref}.

Return a JSON object with these exact fields:
{{
  "opening_scene": "Vivid read-aloud text to start the session (2-3 sentences)",
  "scenes": [
    {{
      "title": "Scene title",
      "read_aloud": "Descriptive text the DM reads aloud",
      "dm_notes": "Private DM tactics, NPC motivations, secret info, contingencies",
      "estimated_minutes": 20
    }}
  ],
  "npc_dialog": [
    {{
      "npc_name": "NPC Name",
      "lines": ["Quotable line 1", "Quotable line 2", "..."],
      "improv_hooks": ["What to do if PCs ask X", "What to do if PCs ignore this NPC"]
    }}
  ],
  "encounter_flows": [
    {{
      "encounter_name": "Encounter name",
      "round_by_round": ["Round 1: ...", "Round 2: ...", "Round 3: ..."],
      "tactics": "Monster AI and tactics guide",
      "terrain_notes": "Terrain features PCs can use"
    }}
  ],
  "closing_hooks": "How to end the session and what hooks lead to next session",
  "xp_awards": {{"base_award": 500, "bonus_award": 100}},
  "loot_notes": "Any special loot or treasure notes"
}}

Generate 2-3 scenes. Include NPC dialog for key NPCs. Include encounter flows for each encounter.
Make read-aloud text atmospheric and suited to the {campaign.tone} tone."""

    result: _RunbookOutput = complete_json(system=system, user=user, schema=_RunbookOutput)

    # Convert internal schema → domain model
    return SessionRunbookCreate(
        session_id=session_id,
        model_used=_MODEL,
        opening_scene=result.opening_scene,
        scenes=[s.model_dump() for s in result.scenes],
        npc_dialog=[n.model_dump() for n in result.npc_dialog],
        encounter_flows=[e.model_dump() for e in result.encounter_flows],
        closing_hooks=result.closing_hooks,
        xp_awards=dict(result.xp_awards),
        loot_awards=[{"notes": result.loot_notes}] if result.loot_notes else None,
    )


# ---------------------------------------------------------------------------
# NPC dialog
# ---------------------------------------------------------------------------


def generate_npc_dialog(
    npc_name: str,
    personality: str,
    context: str,
    tone: str = "dark fantasy",
) -> list[str]:
    """Generate quotable dialog lines and improv hooks for an NPC.

    Args:
        npc_name: Name of the NPC.
        personality: Brief personality description.
        context: Scene or campaign context the NPC appears in.
        tone: Campaign tone (e.g. 'dark fantasy', 'high adventure').

    Returns:
        List of dialog lines (5-8 quotable lines followed by improv hooks).
    """
    system = (
        f"You are an expert D&D 5e DM writing dialog for a {tone} campaign. "
        "Write vivid, in-character dialog that DMs can quote directly at the table."
    )
    user = (
        f"Write dialog for {npc_name}, described as: {personality}.\n"
        f"Context: {context}\n\n"
        "Return a JSON object: "
        '{"lines": ["line1", ...], "improv_hooks": ["hook1", ...]}\n'
        "Include 5-8 quotable lines and 3-5 improv hooks."
    )

    class _DialogOutput(BaseModel):
        lines: list[str]
        improv_hooks: list[str]

    result: _DialogOutput = complete_json(system=system, user=user, schema=_DialogOutput)
    return result.lines + [f"[Hook] {h}" for h in result.improv_hooks]


# ---------------------------------------------------------------------------
# Loot table
# ---------------------------------------------------------------------------


def generate_loot_table(
    adventure_tier: str,
    avg_cr: float = 5.0,
    num_entries: int = 6,
) -> list[dict[str, Any]]:
    """Generate a randomisable loot table appropriate to tier and CR.

    Args:
        adventure_tier: Tier string ('Tier1', 'Tier2', 'Tier3', 'Tier4').
        avg_cr: Average CR of encounters in the adventure.
        num_entries: Number of loot entries to generate.

    Returns:
        List of loot entry dicts with keys: name, rarity, description, value_gp, quantity.
    """
    system = (
        "You are an expert D&D 5e DM creating loot tables following 2024 DMG guidelines. "
        "Include a mix of gold, mundane items, and magic items appropriate to the tier."
    )
    user = (
        f"Generate {num_entries} loot table entries for {adventure_tier} "
        f"(average encounter CR {avg_cr:.1f}).\n"
        "Return JSON: "
        '{"entries": [{"name": "...", "rarity": "Common/Uncommon/Rare/Very Rare/Legendary", '
        '"description": "...", "value_gp": 0, "quantity": 1}, ...]}'
    )

    result: _LootOutput = complete_json(system=system, user=user, schema=_LootOutput)
    return [e.model_dump() for e in result.entries]


# ---------------------------------------------------------------------------
# Monster flavor
# ---------------------------------------------------------------------------


def generate_monster_flavor(
    monster_name: str,
    setting_context: str,
    tone: str = "dark fantasy",
) -> str:
    """Generate a read-aloud flavor description for a monster's appearance.

    Args:
        monster_name: Name of the monster (e.g. 'Adult Red Dragon').
        setting_context: Where and how the monster appears.
        tone: Campaign tone.

    Returns:
        2-3 sentence read-aloud text.
    """
    system = (
        f"You are an expert D&D 5e DM writing atmospheric read-aloud text "
        f"for a {tone} campaign. Be vivid, concise, and evocative."
    )
    user = (
        f"Write 2-3 sentences of read-aloud flavor text for when the players "
        f"first encounter a {monster_name}. Context: {setting_context}. "
        "Do not name the creature — describe what the players see, hear, and feel."
    )
    return complete(system=system, user=user, max_tokens=300)


# ---------------------------------------------------------------------------
# NPC generator
# ---------------------------------------------------------------------------


def generate_npc(
    role: str,
    setting: str,
    tone: str = "dark fantasy",
) -> dict[str, Any]:
    """Generate a complete NPC with name, personality, secret, and dialog hooks.

    Args:
        role: NPC role (e.g. 'innkeeper', 'corrupt guard captain').
        setting: Campaign setting context.
        tone: Campaign tone.

    Returns:
        Dict with keys: name, appearance, personality, secret, dialog_hooks.
    """
    system = (
        f"You are an expert D&D 5e DM creating memorable NPCs for a "
        f"{tone} campaign set in {setting}."
    )
    user = (
        f"Create a {role} NPC. Return JSON:\n"
        '{"name": "...", "appearance": "...", "personality": "...", '
        '"secret": "...", "dialog_hooks": ["hook1", "hook2", "hook3", "hook4", "hook5"]}'
    )

    result: _NPCOutput = complete_json(system=system, user=user, schema=_NPCOutput)
    return result.model_dump()


# ---------------------------------------------------------------------------
# Adventure hook
# ---------------------------------------------------------------------------


def generate_adventure_hook(
    campaign_setting: str,
    tier: str,
    tone: str,
    campaign_name: Optional[str] = None,
) -> str:
    """Generate a one-paragraph adventure hook for a new adventure.

    Args:
        campaign_setting: Campaign setting (e.g. 'Forgotten Realms').
        tier: Adventure tier string.
        tone: Campaign tone.
        campaign_name: Optional campaign name for extra context.

    Returns:
        A single paragraph the DM can read aloud to hook the party.
    """
    campaign_ref = f" in the {campaign_name} campaign" if campaign_name else ""
    system = (
        f"You are an expert D&D 5e DM writing adventure hooks for a {tone} campaign "
        f"set in {campaign_setting}{campaign_ref}."
    )
    user = (
        f"Write a single engaging paragraph (4-6 sentences) that a DM can read aloud "
        f"to hook players into a new {tier} adventure. "
        "Include a mysterious event, an urgent call to action, and a hint of danger. "
        "Match the tone: {tone}."
    )
    return complete(system=system, user=user, max_tokens=400)
