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


# ---------------------------------------------------------------------------
# Plan 00031 — Dynamic encounter builder helpers
# ---------------------------------------------------------------------------


def _resolve_party_levels(session: Session, adventure_id: uuid.UUID) -> list[int]:
    """Return the level of every PC in the adventure's parent campaign.

    Used by the encounter builder's live difficulty meter — the DM
    doesn't have to enter party size or levels because we can pull them
    from the campaign's character roster.

    Args:
        session: Active database session.
        adventure_id: UUID of the adventure.

    Returns:
        List of integer levels (one per PC). Empty if the campaign has
        no PCs yet.
    """
    from db.repos.character_repo import CharacterRepo

    adventure = AdventureRepo.get_by_id(session, adventure_id)
    if adventure is None:
        raise ValueError(f"Adventure {adventure_id} not found.")
    chars = CharacterRepo.list_by_campaign(session, adventure.campaign_id)
    return [int(c.level) for c in chars]


def _build_ai_budget(party_levels: list[int], target_difficulty: str) -> Optional[dict[str, Any]]:
    """Compute the raw-XP target band for the AI prompt (Plan 32 — 2024 RAW).

    Under 2024 rules there is no count multiplier; raw monster XP is
    compared directly to the party's thresholds. This helper returns
    the XP band Claude should hit for the chosen difficulty tier.

    Args:
        party_levels: PC levels.
        target_difficulty: "Low" | "Moderate" | "High" | "Deadly" (informal).

    Returns:
        Budget dict, or None when the party is empty.
    """
    if not party_levels:
        return None

    base = calculate_difficulty(party_levels, [])
    label = target_difficulty.capitalize()
    band_lower: int
    band_upper: int
    if label == "Low":
        band_lower, band_upper = base.low_threshold, base.moderate_threshold
    elif label == "Moderate":
        band_lower, band_upper = base.moderate_threshold, base.high_threshold
    elif label == "High":
        band_lower, band_upper = base.high_threshold, base.deadly_threshold
    elif label == "Deadly":
        band_lower = base.deadly_threshold
        band_upper = int(base.deadly_threshold * 1.5)
    else:
        band_lower, band_upper = base.moderate_threshold, base.high_threshold

    return {
        "target_raw_xp_min": band_lower,
        "target_raw_xp_max": band_upper,
        "preferred_monster_count": 4,
        "xp_band": f"{band_lower}–{band_upper} XP ({label})",
        "band_lower": band_lower,
        "band_upper": band_upper,
    }


def _trim_overbudget_suggestions(
    suggestions: list[dict[str, Any]], budget: Optional[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Safety net: reduce counts until raw monster XP fits the band.

    Plan 32 (2024 RAW). No multiplier — compares raw monster XP totals
    directly to ``band_upper`` and trims counts from the highest-XP
    monster until the total fits.

    Args:
        suggestions: List of {monster_id, monster_name, count, xp, ...} dicts.
        budget: Output from :func:`_build_ai_budget`.

    Returns:
        Possibly-trimmed suggestion list. Order is preserved.
    """
    if not budget or not suggestions:
        return suggestions
    upper = int(budget.get("band_upper", 0))
    if upper <= 0:
        return suggestions

    trimmed = [dict(s) for s in suggestions]

    def total_xp(items: list[dict[str, Any]]) -> int:
        return sum(int(s.get("count", 0)) * int(s.get("xp", 0)) for s in items)

    safety = 50  # cap iterations
    while total_xp(trimmed) > upper and safety > 0:
        safety -= 1
        # Drop one count from the entry whose unit XP contributes the
        # most to the overage — that brings us closest to the band.
        candidates = [s for s in trimmed if int(s.get("count", 0)) > 0]
        if not candidates:
            break
        worst = max(candidates, key=lambda s: int(s.get("xp", 0)))
        worst["count"] = int(worst["count"]) - 1
    # Remove zero-count entries.
    trimmed = [s for s in trimmed if int(s.get("count", 0)) > 0]
    return trimmed


def suggest_themed_monsters(
    session: Session,
    adventure_id: uuid.UUID,
    dm_email: str,
    target_difficulty: str = "Moderate",
) -> dict[str, Any]:
    """Ask the AI for monster picks that fit the adventure (Plan 00031).

    Resolves the adventure context (title / synopsis / location notes /
    tier), the party (campaign PCs), and the available monster pool;
    delegates the actual ranking to ``ai_service.suggest_themed_monsters``;
    then maps each returned monster_name back to a monster_id so the
    frontend can drop suggestions straight into the roster.

    Args:
        session: Active database session.
        adventure_id: UUID of the adventure to theme around.
        dm_email: Email of the requesting DM (for authz).
        target_difficulty: One of "Low" | "Moderate" | "High" | "Deadly".

    Returns:
        Dict with:
          - ``encounter_concept``: Claude's one-sentence pitch
          - ``suggestions``: list of {monster_id, monster_name, count,
            rationale, challenge_rating, xp}

    Raises:
        ValueError: If the adventure is missing.
        PermissionError: If the DM does not own the campaign.
    """
    from services import ai_service

    _assert_adventure_owner(session, adventure_id, dm_email)

    adventure = AdventureRepo.get_by_id(session, adventure_id)
    if adventure is None:
        raise ValueError(f"Adventure {adventure_id} not found.")
    campaign = CampaignRepo.get_by_id(session, adventure.campaign_id)
    tier = adventure.tier.value if adventure.tier else None

    # Party — pull PCs from the campaign for the summary.
    from db.repos.character_repo import CharacterRepo

    chars = CharacterRepo.list_by_campaign(session, adventure.campaign_id)
    if chars:
        party_summary = f"{len(chars)} PCs: " + ", ".join(
            f"{c.character_name} (Lv {c.level} {c.character_class.value})" for c in chars
        )
    else:
        party_summary = "Party not yet rostered."

    # Monster pool — every monster the DM has access to. Sorted by CR
    # ascending so Claude sees the small fry first; it tends to pick a
    # variety when ordered this way.
    monsters = MonsterRepo.list_all(session)
    pool = [
        {
            "name": m.name,
            "challenge_rating": m.challenge_rating,
            "creature_type": m.creature_type,
            "xp": cr_to_xp(m.challenge_rating),
        }
        for m in monsters
    ]

    # Plan 32 — 2024 RAW XP budget. No multiplier; raw monster XP is
    # compared directly to the party threshold. The budget dict carries
    # the target band so the AI prompt knows where to land.
    budget = _build_ai_budget(_resolve_party_levels(session, adventure_id), target_difficulty)

    ai_result = ai_service.suggest_themed_monsters(
        adventure_title=adventure.title,
        adventure_synopsis=adventure.synopsis,
        location_notes=getattr(adventure, "location_notes", None),
        tier=tier,
        target_difficulty=target_difficulty,
        party_summary=party_summary
        + (f" — {campaign.tone}." if campaign and campaign.tone else "."),
        available_monsters=pool,
        budget=budget,
    )

    # Map Claude's monster_name back to actual monster rows. Case-
    # insensitive match so minor capitalization drift doesn't lose a
    # suggestion.
    by_name = {m.name.lower(): m for m in monsters}
    hydrated: list[dict[str, Any]] = []
    for s in ai_result.get("suggestions", []):
        name = (s.get("monster_name") or "").strip()
        monster = by_name.get(name.lower())
        if monster is None:
            continue
        hydrated.append(
            {
                "monster_id": str(monster.id),
                "monster_name": monster.name,
                "count": int(s.get("count") or 1),
                "rationale": s.get("rationale", ""),
                "challenge_rating": monster.challenge_rating,
                "xp": cr_to_xp(monster.challenge_rating),
            }
        )

    # Plan 32 — final safety net. Even with a tight prompt, the AI
    # sometimes returns too much raw XP. Trim counts from the highest-
    # XP monster until the total fits the target band.
    trimmed = _trim_overbudget_suggestions(hydrated, budget)

    return {
        "encounter_concept": ai_result.get("encounter_concept", ""),
        "suggestions": trimmed,
    }


def preview_difficulty(
    session: Session,
    adventure_id: uuid.UUID,
    roster: list[dict[str, Any]],
    dm_email: str,
) -> dict[str, Any]:
    """Compute the difficulty of a hypothetical monster roster (Plan 00031).

    Does not persist anything — used by the live difficulty meter while
    the DM is editing an encounter. Resolves the party from the
    adventure's campaign characters.

    Args:
        session: Active database session.
        adventure_id: UUID of the adventure.
        roster: List of ``{"monster_id": str, "count": int}`` dicts.
        dm_email: Email of the requesting DM.

    Returns:
        Dict with: ``party_levels``, ``raw_xp``, ``adjusted_xp`` (back-
        compat alias of raw under 2024), ``multiplier`` (always 1.0 in
        2024), ``low_threshold``, ``moderate_threshold``,
        ``high_threshold``, ``deadly_threshold`` (informal 1.5× High),
        ``difficulty``.

    Raises:
        ValueError: If the adventure is missing.
        PermissionError: If the DM does not own the campaign.
    """
    _assert_adventure_owner(session, adventure_id, dm_email)
    levels = _resolve_party_levels(session, adventure_id)

    # Expand the roster into individual XP values (count-aware).
    xp_values: list[int] = []
    for entry in roster:
        monster_id = entry.get("monster_id")
        count = int(entry.get("count", 0) or 0)
        if not monster_id or count <= 0:
            continue
        try:
            mid = uuid.UUID(str(monster_id))
        except (ValueError, TypeError):
            continue
        monster = MonsterRepo.get_by_id(session, mid)
        if monster is None:
            continue
        xp = cr_to_xp(monster.challenge_rating)
        xp_values.extend([xp] * count)

    if not levels:
        return {
            "party_levels": [],
            "raw_xp": sum(xp_values),
            "adjusted_xp": sum(xp_values),  # 2024: = raw (back-compat field)
            "multiplier": 1.0,  # 2024: no multiplier (back-compat field)
            "low_threshold": 0,
            "moderate_threshold": 0,
            "high_threshold": 0,
            "deadly_threshold": 0,
            "difficulty": None,
        }

    result = calculate_difficulty(levels, xp_values)
    return {
        "party_levels": levels,
        "raw_xp": result.raw_xp,
        "adjusted_xp": result.adjusted_xp,  # 2024: = raw
        "multiplier": result.multiplier,  # 2024: 1.0
        "low_threshold": result.low_threshold,
        "moderate_threshold": result.moderate_threshold,
        "high_threshold": result.high_threshold,
        "deadly_threshold": result.deadly_threshold,
        "difficulty": result.difficulty.value,
    }


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
