"""Encounter service — business logic and authorization for Encounter operations.

Rules enforced here:
- A DM must own the parent campaign (via adventure) to manage encounters.
- monster_roster entries must have monster_id (UUID) and count >= 1.
- XP budget and difficulty are auto-calculated from the monster roster
  when pc_levels are provided; otherwise stored as-is.
- At most 20 encounters per adventure.
"""

import uuid
from typing import Any, Optional

from sqlmodel import Session

from db.repos.adventure_repo import AdventureRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.encounter_repo import EncounterRepo
from db.repos.monster_repo import MonsterRepo
from domain.encounter import Encounter, EncounterCreate, EncounterUpdate
from domain.enums import EncounterDifficulty
from domain.monster import MonsterStatBlock, MonsterStatBlockUpdate
from integrations.dnd_rules.encounter_math import calculate_difficulty, cr_to_xp

MAX_ENCOUNTERS_PER_ADVENTURE = 20


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _assert_adventure_owner(session: Session, adventure_id: uuid.UUID, dm_email: str) -> None:
    """Verify the DM owns the campaign that contains this adventure.

    Args:
        session: Active database session.
        adventure_id: UUID of the adventure to verify.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the adventure or its campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    adventure = AdventureRepo.get_by_id(session, adventure_id)
    if adventure is None:
        raise ValueError(f"Adventure {adventure_id} not found.")
    campaign = CampaignRepo.get_by_id(session, adventure.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign for adventure {adventure_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to access this adventure's encounters.")


def _assert_encounter_owner(session: Session, encounter: Encounter, dm_email: str) -> None:
    """Verify the DM owns the encounter's parent adventure.

    Args:
        session: Active database session.
        encounter: Encounter ORM object.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If related records don't exist.
        PermissionError: If the DM does not own the campaign.
    """
    _assert_adventure_owner(session, encounter.adventure_id, dm_email)


def _compute_xp_and_difficulty(
    session: Session,
    monster_roster: list[dict[str, Any]],
    pc_levels: list[int],
) -> tuple[int, EncounterDifficulty]:
    """Compute XP budget and difficulty from monster roster and PC levels.

    Args:
        session: Active database session.
        monster_roster: List of roster entries with 'monster_id' and 'count'.
        pc_levels: List of PC levels (1–20) for XP threshold calculation.

    Returns:
        Tuple of (adjusted_xp, difficulty).
    """
    if not pc_levels or not monster_roster:
        return 0, EncounterDifficulty.LOW

    monster_xp_values: list[int] = []
    for entry in monster_roster:
        mid_str = entry.get("monster_id")
        count = int(entry.get("count", 1))
        try:
            mid = uuid.UUID(str(mid_str))
        except (ValueError, TypeError):
            continue
        monster = MonsterRepo.get_by_id(session, mid)
        if monster is None:
            continue
        xp_each = monster.xp or cr_to_xp(monster.challenge_rating)
        monster_xp_values.extend([xp_each] * count)

    if not monster_xp_values:
        return 0, EncounterDifficulty.LOW

    result = calculate_difficulty(pc_levels, monster_xp_values)
    return result.adjusted_xp, result.difficulty


def _hydrate_roster(session: Session, encounter: Encounter) -> Encounter:
    """Enrich monster roster entries with name, hp, ac, xp, cr from the DB.

    Entries that were saved with only ``monster_id`` and ``count`` are
    back-filled so that all consumers (frontend roster editor, initiative
    tracker, session HUD) receive complete data without a second round-trip.

    Args:
        session: Active database session.
        encounter: Encounter whose roster to hydrate (mutated in place).

    Returns:
        The same Encounter, with roster entries enriched.
    """
    roster = encounter.monster_roster
    if not roster:
        return encounter
    hydrated: list[dict[str, Any]] = []
    for entry in roster:
        mid_str = entry.get("monster_id")
        count = int(entry.get("count", 1))
        # If name is already present, keep existing data
        if entry.get("name"):
            hydrated.append(entry)
            continue
        try:
            mid = uuid.UUID(str(mid_str))
        except (ValueError, TypeError):
            hydrated.append(entry)
            continue
        monster = MonsterRepo.get_by_id(session, mid)
        if monster is None:
            hydrated.append(entry)
            continue
        hydrated.append(
            {
                "monster_id": str(mid),
                "count": count,
                "name": monster.name,
                "xp": monster.xp or cr_to_xp(monster.challenge_rating),
                "cr": monster.challenge_rating,
                "hp": monster.hp_average,
                "ac": monster.ac,
            }
        )
    encounter.monster_roster = hydrated
    return encounter


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def list_encounters(session: Session, adventure_id: uuid.UUID, dm_email: str) -> list[Encounter]:
    """List all encounters in an adventure.

    Args:
        session: Active database session.
        adventure_id: UUID of the parent adventure.
        dm_email: Email of the requesting DM.

    Returns:
        List of Encounter ORM objects, ordered by name.

    Raises:
        ValueError: If the adventure or campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    _assert_adventure_owner(session, adventure_id, dm_email)
    encounters = EncounterRepo.list_by_adventure(session, adventure_id)
    for enc in encounters:
        _hydrate_roster(session, enc)
    return encounters


def get_encounter(session: Session, encounter_id: uuid.UUID, dm_email: str) -> Encounter:
    """Fetch a single encounter by ID.

    Args:
        session: Active database session.
        encounter_id: UUID of the encounter.
        dm_email: Email of the requesting DM.

    Returns:
        Encounter ORM object.

    Raises:
        ValueError: If not found.
        PermissionError: If the DM does not own the parent campaign.
    """
    encounter = EncounterRepo.get_by_id(session, encounter_id)
    if encounter is None:
        raise ValueError(f"Encounter {encounter_id} not found.")
    _assert_encounter_owner(session, encounter, dm_email)
    return _hydrate_roster(session, encounter)


def create_encounter(
    session: Session,
    adventure_id: uuid.UUID,
    name: str,
    dm_email: str,
    description: Optional[str] = None,
    monster_roster: Optional[list[dict[str, Any]]] = None,
    terrain_notes: Optional[str] = None,
    read_aloud_text: Optional[str] = None,
    dm_notes: Optional[str] = None,
    reward_xp: int = 0,
    loot_table_id: Optional[uuid.UUID] = None,
    pc_levels: Optional[list[int]] = None,
) -> Encounter:
    """Create a new encounter, auto-calculating XP budget and difficulty.

    Args:
        session: Active database session.
        adventure_id: UUID of the parent adventure.
        name: Encounter name (required).
        dm_email: Email of the owning DM.
        description: Optional free-text description.
        monster_roster: List of {monster_id, count} dicts.
        terrain_notes: Optional terrain description.
        read_aloud_text: Optional boxed text to read aloud.
        dm_notes: Optional private DM notes.
        reward_xp: XP to award players on completion.
        loot_table_id: Optional linked loot table UUID.
        pc_levels: PC levels for XP budget calculation.

    Returns:
        Newly created Encounter ORM object.

    Raises:
        ValueError: If validation fails or encounter limit reached.
        PermissionError: If DM does not own the campaign.
    """
    name = name.strip()
    if not name:
        raise ValueError("Encounter name cannot be empty.")

    _assert_adventure_owner(session, adventure_id, dm_email)

    existing = EncounterRepo.list_by_adventure(session, adventure_id)
    if len(existing) >= MAX_ENCOUNTERS_PER_ADVENTURE:
        raise ValueError(
            f"Adventure already has {MAX_ENCOUNTERS_PER_ADVENTURE} encounters (maximum)."
        )

    roster = monster_roster or []
    levels = pc_levels or []
    xp_budget, difficulty = _compute_xp_and_difficulty(session, roster, levels)

    payload = EncounterCreate(
        adventure_id=adventure_id,
        name=name,
        description=description,
        difficulty=difficulty,
        xp_budget=xp_budget,
        monster_roster=roster,
        terrain_notes=terrain_notes,
        read_aloud_text=read_aloud_text,
        dm_notes=dm_notes,
        reward_xp=reward_xp,
        loot_table_id=loot_table_id,
    )
    return _hydrate_roster(session, EncounterRepo.create(session, payload))


def update_encounter(
    session: Session,
    encounter_id: uuid.UUID,
    dm_email: str,
    update: EncounterUpdate,
    pc_levels: Optional[list[int]] = None,
) -> Encounter:
    """Partially update an encounter, recalculating XP if roster or pc_levels changed.

    Args:
        session: Active database session.
        encounter_id: UUID of the encounter to update.
        dm_email: Email of the requesting DM.
        update: Partial update payload.
        pc_levels: Optional PC levels to recalculate difficulty.

    Returns:
        Updated Encounter ORM object.

    Raises:
        ValueError: If not found.
        PermissionError: If DM does not own the campaign.
    """
    encounter = EncounterRepo.get_by_id(session, encounter_id)
    if encounter is None:
        raise ValueError(f"Encounter {encounter_id} not found.")
    _assert_encounter_owner(session, encounter, dm_email)

    patch = update.model_dump(exclude_unset=True)

    # pc_levels may come from caller or from body (EncounterUpdate.pc_levels).
    effective_levels = pc_levels or patch.get("pc_levels") or []

    # If roster or pc_levels supplied, recalculate budget
    new_roster = patch.get("monster_roster", encounter.monster_roster or [])
    if effective_levels and ("xp_budget" not in patch or "monster_roster" in patch):
        xp_budget, difficulty = _compute_xp_and_difficulty(session, new_roster, effective_levels)
        patch["xp_budget"] = xp_budget
        patch["difficulty"] = difficulty

    # Apply via a fresh EncounterUpdate with the merged patch
    merged = EncounterUpdate(**patch)
    return _hydrate_roster(session, EncounterRepo.update(session, encounter, merged))


def delete_encounter(session: Session, encounter_id: uuid.UUID, dm_email: str) -> bool:
    """Delete an encounter.

    Args:
        session: Active database session.
        encounter_id: UUID of the encounter to delete.
        dm_email: Email of the requesting DM.

    Returns:
        True if deleted.

    Raises:
        ValueError: If not found.
        PermissionError: If DM does not own the campaign.
    """
    encounter = EncounterRepo.get_by_id(session, encounter_id)
    if encounter is None:
        raise ValueError(f"Encounter {encounter_id} not found.")
    _assert_encounter_owner(session, encounter, dm_email)
    return EncounterRepo.delete(session, encounter)


def list_monsters(
    session: Session,
    search: Optional[str] = None,
    is_custom: Optional[bool] = None,
) -> list:
    """List all available monsters, optionally filtered.

    Args:
        session: Active database session.
        search: Optional name substring filter (case-insensitive).
        is_custom: If True, return only custom monsters.

    Returns:
        List of MonsterStatBlock ORM objects.
    """
    monsters = MonsterRepo.list_all(session, is_custom=is_custom)
    if search:
        q = search.strip().lower()
        monsters = [m for m in monsters if q in m.name.lower()]
    return monsters


def count_monsters(session: Session) -> int:
    """Return the total number of monster stat blocks in the database.

    Args:
        session: Active database session.

    Returns:
        Integer count of monsters.
    """
    return MonsterRepo.count(session)


def delete_all_monsters(session: Session) -> int:
    """Delete all monster stat blocks.

    Args:
        session: Active database session.

    Returns:
        Number of monsters deleted.
    """
    return MonsterRepo.delete_all(session)


def get_monster(session: Session, monster_id: uuid.UUID) -> MonsterStatBlock:
    """Fetch a single monster by ID.

    Args:
        session: Active database session.
        monster_id: UUID of the monster.

    Returns:
        MonsterStatBlock ORM object.

    Raises:
        ValueError: If monster not found.
    """
    monster = MonsterRepo.get_by_id(session, monster_id)
    if monster is None:
        raise ValueError(f"Monster {monster_id} not found.")
    return monster


def update_monster(
    session: Session,
    monster_id: uuid.UUID,
    update: MonsterStatBlockUpdate,
) -> MonsterStatBlock:
    """Partially update a monster stat block.

    Args:
        session: Active database session.
        monster_id: UUID of the monster.
        update: Partial update payload.

    Returns:
        Updated MonsterStatBlock ORM object.

    Raises:
        ValueError: If monster not found.
    """
    monster = MonsterRepo.get_by_id(session, monster_id)
    if monster is None:
        raise ValueError(f"Monster {monster_id} not found.")
    patch = update.model_dump(exclude_unset=True)
    for field, value in patch.items():
        setattr(monster, field, value)
    session.add(monster)
    session.commit()
    session.refresh(monster)
    return monster
