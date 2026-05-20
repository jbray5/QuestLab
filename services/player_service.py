"""Player-scope service (Plan 00025).

Thin authz-and-shape layer between ``api/routers/play.py`` and the
existing services. The model:

    Player URL = /play/{pcId}
    The UUID is the implicit secret. DM shares each URL out of band to
    the player who owns the character.

The player_service:
1. Looks up the PC by ID (raises NotFound if missing).
2. Resolves the DM email from the campaign (so the existing services'
   authz model still works — we impersonate the DM under the hood).
3. Dispatches to the existing service.

This preserves all business logic in one place (the existing services),
and confines the player-side "you can only see/touch this one PC" rule
to the player_service.

Player write scope:
- HP damage / heal (temp-HP waterfall)
- Death saves
- Hit dice spend
- Spell slot expend (per level)
- Class feature use spend
- Inspiration toggle, concentration drop, exhaustion adjust, currency
  set (via PATCH /state)

Forbidden in player scope (DM only):
- Create / delete / edit identity of any PC
- Equip / unequip / attune (DM-managed in this iteration)
- Spell knowledge changes (DM-managed)
- Anything touching other PCs or campaigns
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from domain.character import PlayerCharacter
from services import character_service, feature_service, spellcasting_service


def _get_pc_or_raise(db: Session, pc_id: uuid.UUID) -> PlayerCharacter:
    """Return the PC row by ID or raise ValueError."""
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise ValueError(f"Character {pc_id} not found.")
    return pc


def _dm_email_for(db: Session, pc_id: uuid.UUID) -> str:
    """Look up the owning DM's email for a PC.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        Email of the DM that owns the campaign this PC belongs to.

    Raises:
        ValueError: If the PC or its campaign is not found.
    """
    pc = _get_pc_or_raise(db, pc_id)
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {pc.campaign_id} not found.")
    return campaign.dm_email


# ── Reads ──────────────────────────────────────────────────────────────────────


def get_character(db: Session, pc_id: uuid.UUID):
    """Read a PC (player-scope)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.get_character(db, pc_id, dm)


def spellcasting_stats(db: Session, pc_id: uuid.UUID) -> dict[str, Any]:
    """Computed spell DC / attack bonus for a PC."""
    pc = _get_pc_or_raise(db, pc_id)
    return character_service.spellcasting_stats(pc)


def skill_bonuses(db: Session, pc_id: uuid.UUID) -> dict[str, int]:
    """Computed skill bonuses for a PC."""
    dm = _dm_email_for(db, pc_id)
    pc = character_service.get_character(db, pc_id, dm)
    return character_service.compute_skill_bonuses(pc)


def saving_throws(db: Session, pc_id: uuid.UUID) -> dict[str, int]:
    """Computed saving-throw bonuses for a PC."""
    dm = _dm_email_for(db, pc_id)
    pc = character_service.get_character(db, pc_id, dm)
    return character_service.compute_saving_throws(pc)


def slot_state(db: Session, pc_id: uuid.UUID):
    """Read this PC's spell slot state."""
    dm = _dm_email_for(db, pc_id)
    return spellcasting_service.slot_state(db, pc_id, dm)


def list_spells(db: Session, pc_id: uuid.UUID):
    """List this PC's known/prepared spells."""
    dm = _dm_email_for(db, pc_id)
    return spellcasting_service.list_known_for_character(db, pc_id, dm)


def list_features(db: Session, pc_id: uuid.UUID):
    """List this PC's class features with current usage."""
    dm = _dm_email_for(db, pc_id)
    return feature_service.list_for_character(db, pc_id, dm)


def list_inventory(db: Session, pc_id: uuid.UUID):
    """List this PC's inventory."""
    from services import inventory_service

    dm = _dm_email_for(db, pc_id)
    return inventory_service.list_for_character(db, pc_id, dm)


def list_visible_npcs(db: Session, pc_id: uuid.UUID) -> list[dict[str, Any]]:
    """Return campaign NPCs as a player-safe projection (Plan 38 P3-3).

    Strips DM-facing fields (secret, motivation, dialog_hooks, notes,
    tags, monster_stat_block_id) and returns only what a player would
    plausibly know after meeting the NPC: portrait, name, role, race,
    appearance, location, status.

    No DM-controlled "revealed" toggle yet — for the MVP we trust that
    the DM only seeds NPCs the players have met. Future enhancement:
    add an ``is_revealed`` flag on the Npc model and filter here.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        List of NPC dicts (sorted by name), safe to expose on /play/.
    """
    pc = _get_pc_or_raise(db, pc_id)
    from db.repos.npc_repo import NpcRepo

    npcs = NpcRepo.list_for_campaign(db, pc.campaign_id)
    # Plan 38 P3-3 — DM-controlled visibility. Filter hidden NPCs server
    # side so even a curious player hitting /api/play/{id}/npcs can't see
    # the names/portraits of NPCs the DM hasn't revealed yet.
    visible = [n for n in npcs if getattr(n, "is_revealed", True)]
    return [
        {
            "id": str(npc.id),
            "name": npc.name,
            "role": npc.role,
            "race": npc.race,
            "appearance": npc.appearance,
            "location": npc.location,
            "status": npc.status.value if hasattr(npc.status, "value") else npc.status,
            "portrait_url": npc.portrait_url,
        }
        for npc in sorted(visible, key=lambda n: n.name)
    ]


def combat_state(db: Session, pc_id: uuid.UUID) -> dict[str, Any]:
    """Return the PC's active-combat conditions and temp HP (Plan 00037).

    If any session is currently in active combat and this PC has a
    ``SessionCombatant`` row in it, returns
    ``{in_combat: True, conditions, defeated}``. Otherwise returns
    ``{in_combat: False, conditions: [], defeated: False}``.

    temp_hp is NOT included here — it lives on the PlayerCharacter row and
    is already exposed via the main GET /play/{pc_id} payload.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        Combat-state dict suitable for JSON serialization.
    """
    _get_pc_or_raise(db, pc_id)
    from db.repos.session_repo import SessionCombatantRepo

    found = SessionCombatantRepo.find_combatant_in_active_combat(db, pc_id)
    if found is None:
        return {"in_combat": False, "conditions": [], "defeated": False}
    _, combatant = found
    return {
        "in_combat": True,
        "conditions": list(combatant.conditions or []),
        "defeated": bool(combatant.defeated),
    }


def turn_state(db: Session, pc_id: uuid.UUID) -> dict[str, Any]:
    """Return whether it's currently this PC's turn (Plan 00028).

    If any session currently has this PC as the active combatant, returns
    ``{active: True, session_id, round, active_combatant_name}``. Otherwise
    returns ``{active: False}``.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        Turn-state dict suitable for direct JSON serialization.
    """
    # Confirm the PC exists; ignore the result.
    _get_pc_or_raise(db, pc_id)
    from db.repos.session_repo import SessionCombatantRepo

    found = SessionCombatantRepo.find_active_for_character(db, pc_id)
    if found is None:
        return {"active": False}
    game_session, combatant = found
    return {
        "active": True,
        "session_id": str(game_session.id),
        "round": game_session.combat_round,
        "active_combatant_name": combatant.name,
    }


# ── Writes (table-state actions) ──────────────────────────────────────────────


def apply_damage(db: Session, pc_id: uuid.UUID, amount: int) -> PlayerCharacter:
    """Player applies damage to themselves (temp-HP waterfall)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.apply_damage(db, pc_id, amount, dm)


def apply_healing(db: Session, pc_id: uuid.UUID, amount: int) -> PlayerCharacter:
    """Player heals themselves (clamped to hp_max)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.apply_healing(db, pc_id, amount, dm)


def resolve_death_save(db: Session, pc_id: uuid.UUID, d20: int) -> PlayerCharacter:
    """Player resolves a death save (2024 RAW)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.resolve_death_save(db, pc_id, d20, dm)


def spend_hit_dice(db: Session, pc_id: uuid.UUID, count: int) -> PlayerCharacter:
    """Player spends N hit dice (short-rest healing)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.spend_hit_dice(db, pc_id, count, dm)


def expend_spell_slot(db: Session, pc_id: uuid.UUID, level: int):
    """Player expends one slot of the given level."""
    dm = _dm_email_for(db, pc_id)
    return spellcasting_service.expend_slot(db, pc_id, level, dm)


def restore_spell_slot(db: Session, pc_id: uuid.UUID, level: int):
    """Player restores one slot of the given level (rarely used)."""
    dm = _dm_email_for(db, pc_id)
    return spellcasting_service.restore_slot(db, pc_id, level, dm)


def spend_feature(db: Session, pc_id: uuid.UUID, character_feature_id: uuid.UUID):
    """Player spends one use of a class feature they own."""
    dm = _dm_email_for(db, pc_id)
    return feature_service.spend_use(db, character_feature_id, dm)


# ── Bounded player-state PATCH ────────────────────────────────────────────────


# Only these fields can be set via the player /state endpoint. Everything
# else (level, class, scores, identity, etc.) is DM-only.
_PLAYER_PATCHABLE = {
    "heroic_inspiration",
    "concentration_on",
    "exhaustion",
    "cp",
    "sp",
    "ep",
    "gp",
    "pp",
}


def patch_state(db: Session, pc_id: uuid.UUID, fields: dict[str, Any]) -> PlayerCharacter:
    """Apply a bounded player-side PATCH to a PC.

    Only fields the player legitimately controls at the table are
    accepted. Anything else (level, scores, class, etc.) raises
    PermissionError so a tampered request can't escalate.

    Args:
        db: Active database session.
        pc_id: UUID of the PC.
        fields: Partial state dict.

    Returns:
        Updated PlayerCharacter row.

    Raises:
        PermissionError: If the dict contains a field not in the
            player-allowed set.
        ValueError: If the PC is not found.
    """
    rejected = set(fields) - _PLAYER_PATCHABLE
    if rejected:
        raise PermissionError(f"Player scope cannot modify: {sorted(rejected)}. Ask the DM.")
    dm = _dm_email_for(db, pc_id)
    from domain.character import PlayerCharacterUpdate

    update = PlayerCharacterUpdate.model_validate(fields)
    character_service.update_character(db, pc_id, dm, update)
    return _get_pc_or_raise(db, pc_id)
