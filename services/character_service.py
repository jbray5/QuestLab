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
    recompute_update = PlayerCharacterUpdate.model_validate(patch)
    updated = CharacterRepo.update(session, character, recompute_update)
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
