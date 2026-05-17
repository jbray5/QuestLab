"""Class-feature service — catalog browsing + per-PC usage tracking (Plan 00021).

Resolves the ``UsesFormula`` enum against a PC to produce the actual ``max_uses``
integer. All authz goes through campaign ownership.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.class_feature_repo import CharacterFeatureRepo, ClassFeatureRepo
from domain.character import (
    CharacterFeature,
    CharacterFeatureCreate,
    CharacterFeatureRead,
    CharacterFeatureUpdate,
    ClassFeature,
    ClassFeatureRead,
    PlayerCharacter,
)
from domain.enums import CharacterClass, UsesFormula
from integrations.event_bus import publish_pc_updated
from services import character_service


def _ability_mod(score: int) -> int:
    """Standard 5e modifier formula."""
    return (int(score) - 10) // 2


def resolve_max_uses(formula: UsesFormula, pc: PlayerCharacter) -> int:
    """Compute the integer max uses for a feature given the PC's stats.

    Args:
        formula: The ``UsesFormula`` enum value from the catalog row.
        pc: The PC whose stats provide the inputs.

    Returns:
        The max uses count (≥0). ``NONE`` returns 0 (passive features).
    """
    if formula == UsesFormula.NONE:
        return 0
    if formula == UsesFormula.FIXED_1:
        return 1
    if formula == UsesFormula.FIXED_2:
        return 2
    if formula == UsesFormula.FIXED_3:
        return 3
    if formula == UsesFormula.FIXED_4:
        return 4
    if formula == UsesFormula.PROF_BONUS:
        return character_service.proficiency_bonus(pc.level)
    if formula == UsesFormula.WIS_MOD:
        return max(1, _ability_mod(pc.score_wis))
    if formula == UsesFormula.CHA_MOD:
        return max(1, _ability_mod(pc.score_cha))
    if formula == UsesFormula.INT_MOD:
        return max(1, _ability_mod(pc.score_int))
    if formula == UsesFormula.CON_MOD:
        return max(1, _ability_mod(pc.score_con))
    if formula == UsesFormula.LEVEL:
        return pc.level
    if formula == UsesFormula.LEVEL_DIV_3:
        return max(1, pc.level // 3)
    if formula == UsesFormula.LEVEL_DIV_2:
        return max(1, pc.level // 2)
    return 0


def _assert_pc_owner(db: Session, character_id: uuid.UUID, dm_email: str) -> PlayerCharacter:
    """Verify the DM owns the PC's campaign, return the PC.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        The PlayerCharacter ORM object.

    Raises:
        ValueError: If the PC or campaign is missing.
        PermissionError: If the DM does not own the campaign.
    """
    pc = CharacterRepo.get_by_id(db, character_id)
    if pc is None:
        raise ValueError(f"Player character {character_id} not found.")
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign for PC {character_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to manage this PC's features.")
    return pc


def _hydrate(
    db: Session,
    row: CharacterFeature,
    pc: PlayerCharacter,
    feature_cache: dict[uuid.UUID, ClassFeature] | None = None,
) -> CharacterFeatureRead:
    """Build a ``CharacterFeatureRead`` with computed ``max_uses`` + name.

    Args:
        db: Active database session.
        row: The PC-feature row.
        pc: The owning PC.
        feature_cache: Optional cache of {feature_id → ClassFeature} so list
            calls don't refetch the same catalog row repeatedly.

    Returns:
        Hydrated CharacterFeatureRead.
    """
    feature: ClassFeature | None = None
    if feature_cache is not None:
        feature = feature_cache.get(row.feature_id)
    if feature is None:
        feature = ClassFeatureRepo.get_by_id(db, row.feature_id)
        if feature is not None and feature_cache is not None:
            feature_cache[row.feature_id] = feature
    name = feature.name if feature else ""
    formula = feature.uses_formula if feature else UsesFormula.NONE
    recovery = feature.recovery if feature else None
    max_uses = resolve_max_uses(formula, pc) if feature else 0
    return CharacterFeatureRead(
        id=row.id,
        character_id=row.character_id,
        feature_id=row.feature_id,
        feature_name=name,
        uses_spent=row.uses_spent,
        max_uses=max_uses,
        recovery=(
            recovery
            if recovery is not None
            else CharacterFeatureRead.model_fields["recovery"].default
        ),
        notes=row.notes,
    )


# ── Catalog ────────────────────────────────────────────────────────────────


def list_catalog(
    db: Session,
    character_class: CharacterClass | None = None,
    max_level: int = 20,
) -> list[ClassFeatureRead]:
    """Return catalog features for a class (or all classes).

    Args:
        db: Active database session.
        character_class: Optional class filter.
        max_level: Inclusive upper bound on level_acquired.

    Returns:
        ClassFeatureRead list.
    """
    rows = ClassFeatureRepo.list_all(db, character_class=character_class, max_level=max_level)
    return [ClassFeatureRead.model_validate(r) for r in rows]


def seed_catalog(db: Session, payloads: list) -> int:
    """Seed the class_features catalog if empty. Idempotent.

    Args:
        db: Active database session.
        payloads: List of ClassFeatureCreate payloads.

    Returns:
        Number of features inserted (0 if catalog already populated).
    """
    if ClassFeatureRepo.count(db) > 0:
        return 0
    inserted = 0
    for payload in payloads:
        ClassFeatureRepo.create(db, payload)
        inserted += 1
    return inserted


# ── Per-PC features ────────────────────────────────────────────────────────


def list_for_character(
    db: Session, character_id: uuid.UUID, dm_email: str
) -> list[CharacterFeatureRead]:
    """Return all of a PC's feature rows, hydrated with name + max_uses.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        Hydrated CharacterFeatureRead list.
    """
    pc = _assert_pc_owner(db, character_id, dm_email)
    rows = CharacterFeatureRepo.list_for_character(db, character_id)
    cache: dict[uuid.UUID, ClassFeature] = {}
    return [_hydrate(db, r, pc, feature_cache=cache) for r in rows]


def learn_feature(
    db: Session,
    character_id: uuid.UUID,
    payload: CharacterFeatureCreate,
    dm_email: str,
) -> CharacterFeatureRead:
    """Add a class feature to a PC. Idempotent on feature_id.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        payload: Validated payload (feature_id + initial uses_spent).
        dm_email: Email of the requesting DM.

    Returns:
        Hydrated CharacterFeatureRead.

    Raises:
        ValueError: If the PC or feature is not found.
        PermissionError: If the DM does not own the campaign.
    """
    pc = _assert_pc_owner(db, character_id, dm_email)
    feature = ClassFeatureRepo.get_by_id(db, payload.feature_id)
    if feature is None:
        raise ValueError(f"Class feature {payload.feature_id} not found.")
    existing = CharacterFeatureRepo.find_by_pc_and_feature(db, character_id, payload.feature_id)
    if existing is not None:
        # Re-learn is a no-op: keep current uses_spent.
        return _hydrate(db, existing, pc)
    row = CharacterFeatureRepo.create(db, character_id, payload)
    return _hydrate(db, row, pc)


def set_uses_spent(
    db: Session,
    character_feature_id: uuid.UUID,
    uses_spent: int,
    dm_email: str,
) -> CharacterFeatureRead:
    """Set how many uses of a feature have been spent.

    Args:
        db: Active database session.
        character_feature_id: UUID of the PC-feature row.
        uses_spent: New uses-spent count (clamped to [0, max_uses]).
        dm_email: Email of the requesting DM.

    Returns:
        Hydrated CharacterFeatureRead.

    Raises:
        ValueError: If the row is not found.
        PermissionError: If the DM does not own the campaign.
    """
    row = CharacterFeatureRepo.get_by_id(db, character_feature_id)
    if row is None:
        raise ValueError(f"Character-feature {character_feature_id} not found.")
    pc = _assert_pc_owner(db, row.character_id, dm_email)
    feature = ClassFeatureRepo.get_by_id(db, row.feature_id)
    max_uses = resolve_max_uses(feature.uses_formula, pc) if feature else 0
    clamped = max(0, min(uses_spent, max_uses)) if max_uses > 0 else 0
    updated = CharacterFeatureRepo.update(db, row, CharacterFeatureUpdate(uses_spent=clamped))
    publish_pc_updated(pc.id, pc.campaign_id, kind="pc.features.updated")
    return _hydrate(db, updated, pc)


def spend_use(db: Session, character_feature_id: uuid.UUID, dm_email: str) -> CharacterFeatureRead:
    """Spend one use of a feature (uses_spent += 1, clamped to max).

    Args:
        db: Active database session.
        character_feature_id: UUID of the PC-feature row.
        dm_email: Email of the requesting DM.

    Returns:
        Hydrated CharacterFeatureRead.
    """
    row = CharacterFeatureRepo.get_by_id(db, character_feature_id)
    if row is None:
        raise ValueError(f"Character-feature {character_feature_id} not found.")
    return set_uses_spent(db, row.id, row.uses_spent + 1, dm_email)


def restore_use(
    db: Session, character_feature_id: uuid.UUID, dm_email: str
) -> CharacterFeatureRead:
    """Undo one spent use (uses_spent -= 1, floor 0)."""
    row = CharacterFeatureRepo.get_by_id(db, character_feature_id)
    if row is None:
        raise ValueError(f"Character-feature {character_feature_id} not found.")
    return set_uses_spent(db, row.id, max(0, row.uses_spent - 1), dm_email)


def forget_feature(db: Session, character_feature_id: uuid.UUID, dm_email: str) -> bool:
    """Remove a class feature from a PC (rare — usually only on respec)."""
    row = CharacterFeatureRepo.get_by_id(db, character_feature_id)
    if row is None:
        raise ValueError(f"Character-feature {character_feature_id} not found.")
    _assert_pc_owner(db, row.character_id, dm_email)
    return CharacterFeatureRepo.delete(db, row)
