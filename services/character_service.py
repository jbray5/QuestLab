"""Character service — business logic and authorization for PlayerCharacter operations.

Rules enforced here:
- Only the owning DM (via campaign ownership) can create/read/update/delete characters.
- Max 8 player characters per campaign (standard party limit for a DM tool).
- Spell slots are auto-computed from class and level per 2024 D&D rules.
- Ability score modifiers and skill bonuses are computed server-side.
"""

import uuid
from typing import Any, Optional

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from domain.campaign import Campaign
from domain.character import (
    PlayerCharacter,
    PlayerCharacterCreate,
    PlayerCharacterRead,
    PlayerCharacterUpdate,
    proficiency_bonus,
)
from domain.enums import CharacterClass
from integrations.event_bus import publish_pc_updated

MAX_CHARACTERS_PER_CAMPAIGN = 8

# ── Ability modifier helpers ───────────────────────────────────────────────────

SKILLS: dict[str, str] = {
    "Athletics": "str",
    "Acrobatics": "dex",
    "Sleight of Hand": "dex",
    "Stealth": "dex",
    "Arcana": "int",
    "History": "int",
    "Investigation": "int",
    "Nature": "int",
    "Religion": "int",
    "Animal Handling": "wis",
    "Insight": "wis",
    "Medicine": "wis",
    "Perception": "wis",
    "Survival": "wis",
    "Deception": "cha",
    "Intimidation": "cha",
    "Performance": "cha",
    "Persuasion": "cha",
}


def ability_modifier(score: int) -> int:
    """Return the ability modifier for a given ability score per 2024 rules.

    Args:
        score: Ability score (1–30).

    Returns:
        Integer modifier: floor((score - 10) / 2).
    """
    return (score - 10) // 2


# ── Spell slot tables ──────────────────────────────────────────────────────────
# Indexed by [level - 1], value is dict of spell_level -> slot_count.
# Non-casters return an empty dict. Warlock uses pact magic (separate key).

_FULL_CASTER_SLOTS: list[dict[str, int]] = [
    {"1": 2},
    {"1": 3},
    {"1": 4, "2": 2},
    {"1": 4, "2": 3},
    {"1": 4, "2": 3, "3": 2},
    {"1": 4, "2": 3, "3": 3},
    {"1": 4, "2": 3, "3": 3, "4": 1},
    {"1": 4, "2": 3, "3": 3, "4": 2},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1, "8": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1, "8": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1, "8": 1, "9": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 3, "6": 1, "7": 1, "8": 1, "9": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 3, "6": 2, "7": 1, "8": 1, "9": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 3, "6": 2, "7": 2, "8": 1, "9": 1},
]

# Half-casters (Paladin, Ranger): no slots at level 1, start at level 2.
_HALF_CASTER_SLOTS: list[dict[str, int]] = [
    {},
    {"1": 2},
    {"1": 3},
    {"1": 3},
    {"1": 4, "2": 2},
    {"1": 4, "2": 2},
    {"1": 4, "2": 3},
    {"1": 4, "2": 3},
    {"1": 4, "2": 3, "3": 2},
    {"1": 4, "2": 3, "3": 2},
    {"1": 4, "2": 3, "3": 3},
    {"1": 4, "2": 3, "3": 3},
    {"1": 4, "2": 3, "3": 3, "4": 1},
    {"1": 4, "2": 3, "3": 3, "4": 1},
    {"1": 4, "2": 3, "3": 3, "4": 2},
    {"1": 4, "2": 3, "3": 3, "4": 2},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2},
]

# Artificer: half-caster rounding up, starts at level 1.
_ARTIFICER_SLOTS: list[dict[str, int]] = [
    {"1": 2},
    {"1": 2},
    {"1": 3},
    {"1": 3},
    {"1": 4, "2": 2},
    {"1": 4, "2": 2},
    {"1": 4, "2": 3},
    {"1": 4, "2": 3},
    {"1": 4, "2": 3, "3": 2},
    {"1": 4, "2": 3, "3": 2},
    {"1": 4, "2": 3, "3": 3},
    {"1": 4, "2": 3, "3": 3},
    {"1": 4, "2": 3, "3": 3, "4": 1},
    {"1": 4, "2": 3, "3": 3, "4": 1},
    {"1": 4, "2": 3, "3": 3, "4": 2},
    {"1": 4, "2": 3, "3": 3, "4": 2},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 1},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2},
    {"1": 4, "2": 3, "3": 3, "4": 3, "5": 2},
]

# Warlock: pact magic — all slots are the same level, stored as {"pact": count, "level": n}.
_WARLOCK_PACT_SLOTS: list[dict[str, int]] = [
    {"pact": 1, "level": 1},
    {"pact": 2, "level": 1},
    {"pact": 2, "level": 2},
    {"pact": 2, "level": 2},
    {"pact": 2, "level": 3},
    {"pact": 2, "level": 3},
    {"pact": 2, "level": 4},
    {"pact": 2, "level": 4},
    {"pact": 2, "level": 5},
    {"pact": 2, "level": 5},
    {"pact": 3, "level": 5},
    {"pact": 3, "level": 5},
    {"pact": 3, "level": 5},
    {"pact": 3, "level": 5},
    {"pact": 3, "level": 5},
    {"pact": 3, "level": 5},
    {"pact": 4, "level": 5},
    {"pact": 4, "level": 5},
    {"pact": 4, "level": 5},
    {"pact": 4, "level": 5},
]

_FULL_CASTERS = {
    CharacterClass.BARD,
    CharacterClass.CLERIC,
    CharacterClass.DRUID,
    CharacterClass.SORCERER,
    CharacterClass.WIZARD,
}
_HALF_CASTERS = {CharacterClass.PALADIN, CharacterClass.RANGER}
_NON_CASTERS = {CharacterClass.BARBARIAN, CharacterClass.FIGHTER, CharacterClass.MONK}


def compute_spell_slots(character_class: CharacterClass, level: int) -> dict[str, int]:
    """Return the standard spell slot dict for a class/level per 2024 rules.

    For non-casters returns an empty dict. Warlock returns pact magic slots.

    Args:
        character_class: The character's class.
        level: Character level (1–20).

    Returns:
        Dict mapping spell level string to slot count. Warlock uses keys "pact"
        and "level". Empty dict for non-casters.
    """
    idx = level - 1
    if character_class in _FULL_CASTERS:
        return dict(_FULL_CASTER_SLOTS[idx])
    if character_class in _HALF_CASTERS:
        return dict(_HALF_CASTER_SLOTS[idx])
    if character_class == CharacterClass.WARLOCK:
        return dict(_WARLOCK_PACT_SLOTS[idx])
    if character_class == CharacterClass.ARTIFICER:
        return dict(_ARTIFICER_SLOTS[idx])
    # Barbarian, Fighter, Monk, Rogue — no innate spell slots
    return {}


def compute_skill_bonuses(character: PlayerCharacter) -> dict[str, int]:
    """Compute all 18 skill bonuses including proficiency and expertise.

    Args:
        character: PlayerCharacter ORM object with ability scores set.

    Returns:
        Dict of skill name -> total bonus.
    """
    pb = proficiency_bonus(character.level)
    scores = {
        "str": character.score_str,
        "dex": character.score_dex,
        "con": character.score_con,
        "int": character.score_int,
        "wis": character.score_wis,
        "cha": character.score_cha,
    }
    profs = character.skill_proficiencies or {}
    bonuses: dict[str, int] = {}
    for skill, ability in SKILLS.items():
        mod = ability_modifier(scores[ability])
        level = profs.get(skill, 0)  # 0=none, 1=proficient, 2=expertise
        if level == 2:
            bonuses[skill] = mod + pb * 2
        elif level == 1:
            bonuses[skill] = mod + pb
        else:
            bonuses[skill] = mod
    return bonuses


def compute_saving_throws(character: PlayerCharacter) -> dict[str, int]:
    """Compute the six saving-throw bonuses for a PC.

    A save is the ability modifier, plus proficiency bonus when the PC has
    that ability listed in ``saving_throw_proficiencies`` (set by class).

    Args:
        character: PlayerCharacter ORM object.

    Returns:
        Dict keyed by uppercase ability label ("STR", "DEX", ...) to bonus.
    """
    pb = proficiency_bonus(character.level)
    profs = {
        p.value if hasattr(p, "value") else p for p in (character.saving_throw_proficiencies or [])
    }
    return {
        "STR": ability_modifier(character.score_str) + (pb if "STR" in profs else 0),
        "DEX": ability_modifier(character.score_dex) + (pb if "DEX" in profs else 0),
        "CON": ability_modifier(character.score_con) + (pb if "CON" in profs else 0),
        "INT": ability_modifier(character.score_int) + (pb if "INT" in profs else 0),
        "WIS": ability_modifier(character.score_wis) + (pb if "WIS" in profs else 0),
        "CHA": ability_modifier(character.score_cha) + (pb if "CHA" in profs else 0),
    }


# ── Authorization helpers ──────────────────────────────────────────────────────


def _get_campaign_or_raise(session: Session, campaign_id: uuid.UUID) -> Campaign:
    """Fetch a Campaign or raise ValueError.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.

    Returns:
        The Campaign ORM object.

    Raises:
        ValueError: If campaign not found.
    """
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    return campaign


def _assert_campaign_owner(campaign: Campaign, dm_email: str) -> None:
    """Raise PermissionError if dm_email does not own the campaign.

    Args:
        campaign: The campaign object.
        dm_email: Email of the requesting DM.

    Raises:
        PermissionError: If the DM does not own the campaign.
    """
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to access this campaign.")


def _get_character_or_raise(session: Session, character_id: uuid.UUID) -> PlayerCharacter:
    """Fetch a PlayerCharacter or raise ValueError.

    Args:
        session: Active database session.
        character_id: UUID of the character.

    Returns:
        The PlayerCharacter ORM object.

    Raises:
        ValueError: If character not found.
    """
    character = CharacterRepo.get_by_id(session, character_id)
    if character is None:
        raise ValueError(f"Character {character_id} not found.")
    return character


# ── Public service functions ───────────────────────────────────────────────────


def list_characters(
    session: Session, campaign_id: uuid.UUID, dm_email: str
) -> list[PlayerCharacterRead]:
    """Return all characters in a campaign, enforcing DM ownership.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        List of PlayerCharacterRead schemas ordered by character_name.

    Raises:
        ValueError: If campaign not found.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = _get_campaign_or_raise(session, campaign_id)
    _assert_campaign_owner(campaign, dm_email)
    characters = CharacterRepo.list_by_campaign(session, campaign_id)
    return [PlayerCharacterRead.model_validate(c) for c in characters]


def get_character(session: Session, character_id: uuid.UUID, dm_email: str) -> PlayerCharacterRead:
    """Fetch a single character by ID, enforcing DM ownership via campaign.

    Args:
        session: Active database session.
        character_id: UUID of the character.
        dm_email: Email of the requesting DM.

    Returns:
        PlayerCharacterRead schema.

    Raises:
        ValueError: If character or campaign not found.
        PermissionError: If the DM does not own the campaign.
    """
    character = _get_character_or_raise(session, character_id)
    campaign = _get_campaign_or_raise(session, character.campaign_id)
    _assert_campaign_owner(campaign, dm_email)
    return PlayerCharacterRead.model_validate(character)


def create_character(
    session: Session,
    campaign_id: uuid.UUID,
    dm_email: str,
    player_name: str,
    character_name: str,
    race: str,
    character_class: CharacterClass,
    level: int,
    score_str: int,
    score_dex: int,
    score_con: int,
    score_int: int,
    score_wis: int,
    score_cha: int,
    hp_max: int,
    hp_current: int,
    ac: int,
    speed: int = 30,
    subclass: Optional[str] = None,
    background: Optional[str] = None,
    alignment: Optional[str] = None,
    saving_throw_proficiencies: Optional[list] = None,
    skill_proficiencies: Optional[dict[str, Any]] = None,
    feats: Optional[list[str]] = None,
    equipment: Optional[list[dict[str, Any]]] = None,
    spells_known: Optional[list[dict[str, Any]]] = None,
    spell_slots: Optional[dict[str, Any]] = None,
    backstory: Optional[str] = None,
    notes: Optional[str] = None,
    portrait_url: Optional[str] = None,
) -> PlayerCharacterRead:
    """Create a new player character in a campaign.

    Spell slots are auto-populated from class/level if not provided.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the owning DM (must own the campaign).
        player_name: Name of the player.
        character_name: Name of the character.
        race: Character's race/species.
        character_class: Character class enum.
        level: Character level (1–20).
        score_str: Strength score.
        score_dex: Dexterity score.
        score_con: Constitution score.
        score_int: Intelligence score.
        score_wis: Wisdom score.
        score_cha: Charisma score.
        hp_max: Maximum hit points.
        hp_current: Current hit points.
        ac: Armor class.
        speed: Movement speed in feet.
        subclass: Optional subclass name.
        background: Optional background name.
        alignment: Optional alignment string.
        saving_throw_proficiencies: List of AbilityScore enums.
        skill_proficiencies: Dict of skill -> proficiency level (0/1/2).
        feats: List of feat names.
        equipment: List of equipment dicts.
        spells_known: List of spell dicts.
        spell_slots: Override auto-computed spell slots if provided.
        backstory: Optional character backstory text.
        notes: Optional DM notes.
        portrait_url: Optional portrait URL.

    Returns:
        The newly created PlayerCharacterRead.

    Raises:
        ValueError: If campaign not found or character limit reached.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = _get_campaign_or_raise(session, campaign_id)
    _assert_campaign_owner(campaign, dm_email)
    existing = CharacterRepo.list_by_campaign(session, campaign_id)
    if len(existing) >= MAX_CHARACTERS_PER_CAMPAIGN:
        raise ValueError(
            f"Campaign already has {MAX_CHARACTERS_PER_CAMPAIGN} characters (maximum)."
        )
    resolved_slots = (
        spell_slots if spell_slots is not None else compute_spell_slots(character_class, level)
    )
    data = PlayerCharacterCreate(
        campaign_id=campaign_id,
        player_name=player_name,
        character_name=character_name,
        race=race,
        character_class=character_class,
        subclass=subclass,
        level=level,
        background=background,
        alignment=alignment,
        score_str=score_str,
        score_dex=score_dex,
        score_con=score_con,
        score_int=score_int,
        score_wis=score_wis,
        score_cha=score_cha,
        hp_max=hp_max,
        hp_current=hp_current,
        ac=ac,
        speed=speed,
        saving_throw_proficiencies=saving_throw_proficiencies or [],
        skill_proficiencies=skill_proficiencies,
        feats=feats,
        equipment=equipment,
        spells_known=spells_known,
        spell_slots=resolved_slots if resolved_slots else None,
        backstory=backstory,
        notes=notes,
        portrait_url=portrait_url,
    )
    character = CharacterRepo.create(session, data)
    return PlayerCharacterRead.model_validate(character)


def update_character(
    session: Session,
    character_id: uuid.UUID,
    dm_email: str,
    update: PlayerCharacterUpdate,
) -> PlayerCharacterRead:
    """Apply a partial update to a character, enforcing DM ownership.

    If level or class is updated and spell_slots is not explicitly provided,
    spell slots are recomputed from the new class/level.

    Args:
        session: Active database session.
        character_id: UUID of the character.
        dm_email: Email of the requesting DM.
        update: Partial update payload.

    Returns:
        Updated PlayerCharacterRead.

    Raises:
        ValueError: If character or campaign not found.
        PermissionError: If the DM does not own the campaign.
    """
    character = _get_character_or_raise(session, character_id)
    campaign = _get_campaign_or_raise(session, character.campaign_id)
    _assert_campaign_owner(campaign, dm_email)
    patch = update.model_dump(exclude_unset=True)
    # Recompute spell slots if class or level changed and slots not explicitly set
    if ("level" in patch or "character_class" in patch) and "spell_slots" not in patch:
        new_level = patch.get("level", character.level)
        new_class = patch.get("character_class", character.character_class)
        patch["spell_slots"] = compute_spell_slots(new_class, new_level) or None
    # Plan 37 — if the DM PATCHes hp_current up from 0, clear the
    # death-save tracker too (matches apply_healing's revive behavior).
    prev_hp = character.hp_current
    new_hp = patch.get("hp_current")
    if new_hp is not None and new_hp > 0 and prev_hp <= 0:
        patch.setdefault("death_save_successes", 0)
        patch.setdefault("death_save_failures", 0)
    recompute_update = PlayerCharacterUpdate.model_validate(patch)
    updated = CharacterRepo.update(session, character, recompute_update)
    # Plan 37 — sync the combat tracker so the HUD doesn't keep showing the
    # PC greyed-out + with stale HP after a DM-side hp_current change.
    if "hp_current" in patch:
        _sync_combatant_for_pc(session, updated)
    publish_pc_updated(updated.id, updated.campaign_id)
    return PlayerCharacterRead.model_validate(updated)


def delete_character(session: Session, character_id: uuid.UUID, dm_email: str) -> None:
    """Delete a player character, enforcing DM ownership.

    Args:
        session: Active database session.
        character_id: UUID of the character.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If character or campaign not found.
        PermissionError: If the DM does not own the campaign.
    """
    character = _get_character_or_raise(session, character_id)
    campaign = _get_campaign_or_raise(session, character.campaign_id)
    _assert_campaign_owner(campaign, dm_email)
    CharacterRepo.delete(session, character)


# ---------------------------------------------------------------------------
# Plan 00023 — combat state helpers
# ---------------------------------------------------------------------------


def _sync_combatant_for_pc(session: Session, character: PlayerCharacter) -> None:
    """Mirror the PC's HP / defeated flag onto its active-combat combatant row.

    Plan 00037 — the combat tracker (HUD) reads ``hp_current`` and
    ``defeated`` from the SessionCombatant row, not from the PC. Without
    this sync, a DM-side HP change (PATCH /characters or the party-panel
    +/- buttons) updated the PC sheet but left the combat tracker showing
    the old HP + greyed-out "defeated" state, which is confusing.

    No-ops if the PC isn't in any active combat right now.

    Args:
        session: Active database session.
        character: The just-updated PlayerCharacter (must have current hp).
    """
    from db.repos.session_repo import SessionCombatantRepo
    from integrations.event_bus import publish_pc_combat_updated

    found = SessionCombatantRepo.find_combatant_in_active_combat(session, character.id)
    if found is None:
        return
    _, combatant = found
    changed = False
    if combatant.hp_current != character.hp_current:
        combatant.hp_current = character.hp_current
        changed = True
    should_be_defeated = character.hp_current <= 0
    if combatant.defeated != should_be_defeated:
        combatant.defeated = should_be_defeated
        changed = True
    if changed:
        session.add(combatant)
        session.commit()
        session.refresh(combatant)
        publish_pc_combat_updated(character.id, character.campaign_id)


def apply_damage(
    session: Session,
    character_id: uuid.UUID,
    amount: int,
    dm_email: str,
) -> PlayerCharacter:
    """Apply damage with the temp-HP-first waterfall.

    1. Damage first reduces ``temp_hp`` down to 0.
    2. Remaining damage reduces ``hp_current`` down to 0.
    3. Healing back above 0 does NOT happen here — call ``apply_healing``.

    Args:
        session: Active database session.
        character_id: UUID of the PC.
        amount: Damage to apply (>=0; clamped).
        dm_email: Email of the requesting DM.

    Returns:
        Updated PlayerCharacter.
    """
    character = _get_character_or_raise(session, character_id)
    campaign = _get_campaign_or_raise(session, character.campaign_id)
    _assert_campaign_owner(campaign, dm_email)
    amt = max(0, int(amount))
    absorbed = min(character.temp_hp, amt)
    character.temp_hp = max(0, character.temp_hp - absorbed)
    remaining = amt - absorbed
    character.hp_current = max(0, character.hp_current - remaining)
    session.add(character)
    session.commit()
    session.refresh(character)
    _sync_combatant_for_pc(session, character)
    publish_pc_updated(character.id, character.campaign_id)
    return character


def apply_healing(
    session: Session,
    character_id: uuid.UUID,
    amount: int,
    dm_email: str,
) -> PlayerCharacter:
    """Apply healing to a PC, clamped to ``hp_max``. Resets death saves on revive.

    Args:
        session: Active database session.
        character_id: UUID of the PC.
        amount: Healing to apply (>=0; clamped).
        dm_email: Email of the requesting DM.

    Returns:
        Updated PlayerCharacter.
    """
    character = _get_character_or_raise(session, character_id)
    campaign = _get_campaign_or_raise(session, character.campaign_id)
    _assert_campaign_owner(campaign, dm_email)
    amt = max(0, int(amount))
    was_down = character.hp_current <= 0
    character.hp_current = min(character.hp_max, character.hp_current + amt)
    if was_down and character.hp_current > 0:
        # Reviving from 0 clears the death-save tracker per RAW.
        character.death_save_successes = 0
        character.death_save_failures = 0
    session.add(character)
    session.commit()
    session.refresh(character)
    _sync_combatant_for_pc(session, character)
    publish_pc_updated(character.id, character.campaign_id)
    return character


def resolve_death_save(
    session: Session,
    character_id: uuid.UUID,
    d20: int,
    dm_email: str,
) -> PlayerCharacter:
    """Apply a death-save d20 to a PC's tracker per 2024 RAW.

    Rules:
      - Nat 20: regain 1 HP, zero both tracks.
      - Nat 1: 2 failures.
      - >= 10: 1 success.
      - < 10: 1 failure.
      - 3 successes total -> ``stable`` (HP stays 0; pips persist).
      - 3 failures total -> the DM should mark the PC dead manually (we
        don't auto-set dead state; the failure count of 3 is the signal).

    Args:
        session: Active database session.
        character_id: UUID of the PC.
        d20: The raw d20 result (1..20).
        dm_email: Email of the requesting DM.

    Returns:
        Updated PlayerCharacter.

    Raises:
        ValueError: If d20 is out of range or the PC isn't dying.
    """
    if d20 < 1 or d20 > 20:
        raise ValueError("d20 must be 1..20")
    character = _get_character_or_raise(session, character_id)
    campaign = _get_campaign_or_raise(session, character.campaign_id)
    _assert_campaign_owner(campaign, dm_email)
    if character.hp_current > 0:
        raise ValueError("Death saves only apply when HP is 0.")

    if d20 == 20:
        character.hp_current = 1
        character.death_save_successes = 0
        character.death_save_failures = 0
    elif d20 == 1:
        character.death_save_failures = min(3, character.death_save_failures + 2)
    elif d20 >= 10:
        character.death_save_successes = min(3, character.death_save_successes + 1)
    else:
        character.death_save_failures = min(3, character.death_save_failures + 1)
    session.add(character)
    session.commit()
    session.refresh(character)
    publish_pc_updated(character.id, character.campaign_id)
    return character


# ── Plan 00024 — caster stats, hit dice, exhaustion lookups ────────────────────

# Spellcasting ability per class (2024 PHB).
_SPELLCASTING_ABILITY: dict[CharacterClass, str] = {
    CharacterClass.WIZARD: "int",
    CharacterClass.ARTIFICER: "int",
    CharacterClass.CLERIC: "wis",
    CharacterClass.DRUID: "wis",
    CharacterClass.RANGER: "wis",
    CharacterClass.BARD: "cha",
    CharacterClass.PALADIN: "cha",
    CharacterClass.SORCERER: "cha",
    CharacterClass.WARLOCK: "cha",
}

# Hit die size per class (2024 PHB).
_HIT_DIE_BY_CLASS: dict[CharacterClass, int] = {
    CharacterClass.SORCERER: 6,
    CharacterClass.WIZARD: 6,
    CharacterClass.ARTIFICER: 8,
    CharacterClass.BARD: 8,
    CharacterClass.CLERIC: 8,
    CharacterClass.DRUID: 8,
    CharacterClass.MONK: 8,
    CharacterClass.ROGUE: 8,
    CharacterClass.WARLOCK: 8,
    CharacterClass.FIGHTER: 10,
    CharacterClass.PALADIN: 10,
    CharacterClass.RANGER: 10,
    CharacterClass.BARBARIAN: 12,
}


def hit_die_for(character_class: CharacterClass) -> int:
    """Return the hit-die size (d6/d8/d10/d12) for a class per 2024 RAW.

    Args:
        character_class: The PC's class.

    Returns:
        Integer die size: 6, 8, 10, or 12.
    """
    return _HIT_DIE_BY_CLASS[character_class]


def spellcasting_ability(character_class: CharacterClass) -> Optional[str]:
    """Return the spellcasting ability key for a class, or None for non-casters.

    Args:
        character_class: The PC's class.

    Returns:
        One of ``"int"``, ``"wis"``, ``"cha"`` for casters; ``None`` for
        Barbarian, Fighter, Monk, Rogue.
    """
    return _SPELLCASTING_ABILITY.get(character_class)


def spellcasting_stats(pc: PlayerCharacter) -> dict[str, Any]:
    """Return computed spell DC and attack bonus for a PC, or empty for non-casters.

    Formulas (2024 RAW):
        spell save DC      = 8 + proficiency_bonus + ability_modifier
        spell attack bonus =     proficiency_bonus + ability_modifier

    Args:
        pc: The PlayerCharacter row.

    Returns:
        Dict with ``ability`` (uppercase key) / ``save_dc`` / ``attack_bonus``
        for casters; ``{"ability": None, "save_dc": None, "attack_bonus": None}``
        for non-casters.
    """
    ability = spellcasting_ability(pc.character_class)
    if ability is None:
        return {"ability": None, "save_dc": None, "attack_bonus": None}
    score = getattr(pc, f"score_{ability}")
    mod = ability_modifier(score)
    pb = proficiency_bonus(pc.level)
    return {
        "ability": ability.upper(),
        "save_dc": 8 + pb + mod,
        "attack_bonus": pb + mod,
    }


def spend_hit_dice(
    session: Session, character_id: uuid.UUID, count: int, dm_email: str
) -> PlayerCharacter:
    """Mark ``count`` hit dice as spent on this PC (short-rest healing).

    Healing itself is applied separately via ``apply_healing`` after the player
    rolls the HD and adds CON mod — this just bumps the spent counter so the
    UI's pip tracker stays accurate and long-rest recovery has the right base.

    Args:
        session: Active database session.
        character_id: UUID of the PC to update.
        count: Number of hit dice to spend (must be > 0).
        dm_email: Email of the DM making the request.

    Returns:
        The updated PlayerCharacter row.

    Raises:
        ValueError: If count is not positive or would exceed available HD.
        PermissionError: If the DM does not own the campaign.
    """
    if count <= 0:
        raise ValueError(f"count must be > 0, got {count}.")
    character = _get_character_or_raise(session, character_id)
    campaign = _get_campaign_or_raise(session, character.campaign_id)
    _assert_campaign_owner(campaign, dm_email)
    available = character.level - character.hit_dice_spent
    if count > available:
        raise ValueError(
            f"Tried to spend {count} HD but only {available} remain "
            f"(level {character.level}, already spent {character.hit_dice_spent})."
        )
    character.hit_dice_spent += count
    session.add(character)
    session.commit()
    session.refresh(character)
    publish_pc_updated(character.id, character.campaign_id)
    return character
