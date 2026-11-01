"""Class-feature service — catalog browsing + per-PC usage tracking (Plans 00021, 128, 131).

Resolves the ``UsesFormula`` enum (or a level-scaled override from the rules
module) against a PC to produce the actual ``max_uses`` integer. Seeds every
catalog row a database is missing, grants new rows to the characters that
qualify, and lists every class and subclass feature a character has at its
level. All DM authz goes through campaign ownership; the player route is a
capability link the router resolves.

Plan 131: the catalog holds both editions' rows (``ClassFeature.ruleset``), and a
PC is only ever granted its own edition's (``pc.ruleset``, stamped from the campaign).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Iterable, Optional

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
from integrations.dnd_rules import rulesets
from integrations.dnd_rules.class_features_2024 import (
    NON_SRD_SUBCLASSES,
    canonical_subclass,
    features_for_level,
    scaled_uses,
)
from integrations.event_bus import publish_pc_updated
from services import auth_service, character_service

logger = logging.getLogger(__name__)

_ABILITIES = ("str", "dex", "con", "int", "wis", "cha")

# Plan 131 — counts that step up at set levels: (from level, uses), ascending. A 0 means
# no limit (2014 Rage and Wild Shape at level 20): nothing to count, so no counter shows.
_LEVEL_STEPS: dict[UsesFormula, tuple[tuple[int, int], ...]] = {
    UsesFormula.RAGE_2014: ((1, 2), (3, 3), (6, 4), (12, 5), (17, 6), (20, 0)),
    UsesFormula.WILD_SHAPE_2014: ((1, 2), (20, 0)),
    UsesFormula.CHANNEL_DIV_2014: ((1, 1), (6, 2), (18, 3)),
    UsesFormula.ACTION_SURGE: ((1, 1), (17, 2)),
    UsesFormula.INDOMITABLE: ((1, 1), (13, 2), (17, 3)),
}


def _ability_mod(score: int) -> int:
    """Standard 5e modifier formula."""
    return (int(score) - 10) // 2


def _at_level(level: int, steps: tuple[tuple[int, int], ...]) -> int:
    """The value from an ascending (from_level, value) table at ``level``."""
    out = steps[0][1]
    for at, value in steps:
        if level >= at:
            out = value
    return out


def _ruleset_of(obj: Any) -> str:
    """The plain ruleset ("2024"/"2014") of a catalog row or a PC; a missing one is 2024."""
    return rulesets.normalize(getattr(obj, "ruleset", None))


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
    if formula == UsesFormula.PROF_X2:
        return 2 * character_service.proficiency_bonus(pc.level)
    if formula == UsesFormula.CHANNEL_DIVINITY:
        return 2 + (1 if pc.level >= 6 else 0) + (1 if pc.level >= 18 else 0)
    if formula == UsesFormula.SECOND_WIND:
        return 2 + (1 if pc.level >= 4 else 0) + (1 if pc.level >= 10 else 0)
    if formula == UsesFormula.RAGE:
        return 2 + sum(1 for lvl in (3, 6, 12, 17) if pc.level >= lvl)
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
    # Plan 131 — the 2014 counters.
    if formula == UsesFormula.CHA_MOD_PLUS_1:
        return max(1, 1 + _ability_mod(pc.score_cha))
    if formula == UsesFormula.LEVEL_X5:
        return 5 * max(1, pc.level)
    steps = _LEVEL_STEPS.get(formula)
    if steps is not None:
        return _at_level(pc.level, steps)
    return 0


def max_uses_for(feature: ClassFeature, pc: PlayerCharacter) -> int:
    """Max uses of a catalog feature for this PC, level-scaled where 2024 says so.

    Action Surge, Indomitable, Wild Shape and the Paladin's Channel Divinity gain
    uses at set levels; Lay on Hands is a pool of 5 hit points per level. For 2024
    rows those come from the rules module, keyed by name; everything else, and every
    2014 row (Plan 131: its formula says it all), from the row's ``UsesFormula``.

    Args:
        feature: The catalog row.
        pc: The PC whose level and scores provide the inputs.

    Returns:
        The max uses (or pool size), 0 for passive features.
    """
    if feature.uses_formula == UsesFormula.NONE:
        return 0
    if not rulesets.is_2014(_ruleset_of(feature)):
        scaled = scaled_uses(feature.character_class, feature.name, pc.level)
        if scaled is not None:
            return scaled
    return resolve_max_uses(feature.uses_formula, pc)


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
    recovery = feature.recovery if feature else None
    max_uses = max_uses_for(feature, pc) if feature else 0
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
    dm_email: str | None = None,
    ruleset: Any = None,
) -> list[ClassFeatureRead]:
    """Return catalog features for a class (or all classes).

    Args:
        db: Active database session.
        character_class: Optional class filter.
        max_level: Inclusive upper bound on level_acquired.
        dm_email: The requesting DM; non-SRD entries are shown only to admins (Plan 77).
        ruleset: Optional edition filter ("2024"/"2014", Plan 131), so the "learn a
            feature" list for a PC shows only its own edition's rows. None lists both.

    Returns:
        ClassFeatureRead list.
    """
    rows = ClassFeatureRepo.list_all(db, character_class=character_class, max_level=max_level)
    if ruleset is not None:
        wanted = rulesets.normalize(ruleset)
        rows = [r for r in rows if _ruleset_of(r) == wanted]
    personal = bool(dm_email) and auth_service.personal_content_allowed(dm_email)
    return [
        ClassFeatureRead.model_validate(r)
        for r in rows
        if personal or r.subclass not in NON_SRD_SUBCLASSES
    ]


def _catalog_key(
    name: str, character_class: Any, subclass: Optional[str], ruleset: Any = None
) -> tuple[str, str, str, str]:
    """The identity a catalog row is matched on: name + class + subclass + ruleset (Plan 131)."""
    cls = str(getattr(character_class, "value", character_class) or "").strip().lower()
    return (
        name.strip().lower(),
        cls,
        (subclass or "").strip().lower(),
        rulesets.normalize(ruleset),
    )


def _seed_missing(db: Session, payloads: Iterable[Any]) -> list[ClassFeature]:
    """Insert the payloads the catalog lacks and return the new rows (see ``seed_catalog``)."""
    existing = {
        _catalog_key(r.name, r.character_class, r.subclass, _ruleset_of(r)): r
        for r in ClassFeatureRepo.list_all(db)
    }
    inserted: list[ClassFeature] = []
    changed = 0
    for payload in payloads:
        key = _catalog_key(
            payload.name, payload.character_class, payload.subclass, _ruleset_of(payload)
        )
        row = existing.get(key)
        if row is None:
            row = ClassFeatureRepo.create(db, payload)
            existing[key] = row
            inserted.append(row)
            continue
        if row.uses_formula != payload.uses_formula or row.recovery != payload.recovery:
            row.uses_formula = payload.uses_formula
            row.recovery = payload.recovery
            db.add(row)
            changed += 1
    if changed:
        db.commit()
    return inserted


def seed_catalog(db: Session, payloads: list) -> int:
    """Insert every catalog row the table is missing. Idempotent.

    Rows are matched on name + class + subclass + ruleset, so a database that
    already holds some rows (an older seed, or the rows data migrations planted)
    gets the rest, nothing is ever duplicated, and the 2014 Rage never overwrites
    the 2024 one (Plan 131). Existing rows keep their id (PCs' counters point at
    it); only their max-uses formula and recovery are kept in step with the
    rules module (Plan 83).

    Args:
        db: Active database session.
        payloads: List of ClassFeatureCreate payloads.

    Returns:
        Number of features inserted.
    """
    return len(_seed_missing(db, payloads))


def seed_and_backfill(db: Session, payloads: list) -> dict[str, int]:
    """Startup: seed the missing catalog rows, then grant the new ones to every PC who qualifies.

    Only rows inserted by this call are granted, so a feature a DM removed
    from a sheet on purpose doesn't come back on the next restart. A row only
    goes to PCs of its own edition (see ``_qualifies``), so startup can pass both
    editions' catalogs.

    Args:
        db: Active database session.
        payloads: List of ClassFeatureCreate payloads (either edition, or both).

    Returns:
        ``{"inserted": n, "granted": m}``.
    """
    new_rows = _seed_missing(db, payloads)
    granted = 0
    if new_rows:
        for campaign in CampaignRepo.list_all(db):
            personal = auth_service.personal_content_allowed(campaign.dm_email or "")
            for pc in CharacterRepo.list_by_campaign(db, campaign.id):
                granted += len(_grant(db, pc, new_rows, personal))
        logger.info(
            "Class-feature catalog: %d rows added, %d granted to characters.",
            len(new_rows),
            granted,
        )
    return {"inserted": len(new_rows), "granted": granted}


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
    max_uses = max_uses_for(feature, pc) if feature else 0
    clamped = max(0, min(uses_spent, max_uses)) if max_uses > 0 else 0
    updated = CharacterFeatureRepo.update(db, row, CharacterFeatureUpdate(uses_spent=clamped))
    publish_pc_updated(pc.id, pc.campaign_id, kind="pc.features.updated")
    return _hydrate(db, updated, pc)


def spend_use(
    db: Session, character_feature_id: uuid.UUID, dm_email: str, amount: int = 1
) -> CharacterFeatureRead:
    """Spend uses of a feature (uses_spent += amount, clamped to max).

    ``amount`` is for pools: Lay on Hands spends any number of its points at once.

    Args:
        db: Active database session.
        character_feature_id: UUID of the PC-feature row.
        dm_email: Email of the requesting DM.
        amount: How many uses (or pool points) to spend; at least 1.

    Returns:
        Hydrated CharacterFeatureRead.
    """
    row = CharacterFeatureRepo.get_by_id(db, character_feature_id)
    if row is None:
        raise ValueError(f"Character-feature {character_feature_id} not found.")
    return set_uses_spent(db, row.id, row.uses_spent + max(1, int(amount)), dm_email)


def restore_use(
    db: Session, character_feature_id: uuid.UUID, dm_email: str, amount: int = 1
) -> CharacterFeatureRead:
    """Undo spent uses (uses_spent -= amount, floor 0); ``amount`` is for pools."""
    row = CharacterFeatureRepo.get_by_id(db, character_feature_id)
    if row is None:
        raise ValueError(f"Character-feature {character_feature_id} not found.")
    return set_uses_spent(db, row.id, max(0, row.uses_spent - max(1, int(amount))), dm_email)


def forget_feature(db: Session, character_feature_id: uuid.UUID, dm_email: str) -> bool:
    """Remove a class feature from a PC (rare — usually only on respec)."""
    row = CharacterFeatureRepo.get_by_id(db, character_feature_id)
    if row is None:
        raise ValueError(f"Character-feature {character_feature_id} not found.")
    _assert_pc_owner(db, row.character_id, dm_email)
    return CharacterFeatureRepo.delete(db, row)


def _subclass_matches(feature_subclass: str, pc: PlayerCharacter) -> bool:
    """Whether a subclass catalog row belongs to this PC's subclass.

    Case-insensitive substring either way ("Life Domain" matches "Life"), or, for
    2024, the same SRD subclass however it was written ("Path of the Berserker" is
    the Berserker, "School of Evocation" the Evoker). A 2014 PC matches the 2014
    rows' own names directly: the 2024 aliases point at 2024 keys (Plan 131).
    """
    subclass = (pc.subclass or "").strip().lower()
    if not subclass:
        return False
    fsub = feature_subclass.strip().lower()
    if fsub in subclass or subclass in fsub:
        return True
    if rulesets.is_2014(_ruleset_of(pc)):
        return False
    canon = canonical_subclass(pc.character_class, pc.subclass)
    return canon is not None and canon.lower() == fsub


def _qualifies(feature: ClassFeature, pc: PlayerCharacter, personal: bool) -> bool:
    """Edition, class, level and subclass all fit (and non-SRD text only at the owner's table)."""
    # Plan 131 — a PC only ever gets its own edition's rows.
    if _ruleset_of(feature) != _ruleset_of(pc):
        return False
    if feature.character_class != pc.character_class or feature.level_acquired > pc.level:
        return False
    if feature.subclass:
        if not _subclass_matches(feature.subclass, pc):
            return False
        # Plan 77 — PHB-only subclass text never leaves the owner's table.
        if feature.subclass in NON_SRD_SUBCLASSES and not personal:
            return False
    return True


def _grant(
    db: Session, pc: PlayerCharacter, catalog: Iterable[ClassFeature], personal: bool
) -> list[str]:
    """Create a PC-feature row for each catalog row the PC qualifies for and lacks."""
    have = {row.feature_id for row in CharacterFeatureRepo.list_for_character(db, pc.id)}
    granted: list[str] = []
    for feature in catalog:
        if feature.id in have or not _qualifies(feature, pc, personal):
            continue
        CharacterFeatureRepo.create(db, pc.id, CharacterFeatureCreate(feature_id=feature.id))
        have.add(feature.id)
        granted.append(feature.name)
    return granted


def sync_for_level(db: Session, character_id: uuid.UUID, dm_email: str) -> list[str]:
    """Grant every catalog feature the PC qualifies for (creation and level-up helper).

    Idempotent: features already learned are skipped. The catalog is first
    topped up from the PC's edition's rules module, so a database whose startup
    seed missed rows still grants the whole set. A feature qualifies when its
    edition and class match, its ``level_acquired`` is within the PC's level, and
    it is either class-generic or belongs to the PC's subclass (see
    ``_subclass_matches``).

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        Names of the newly granted features (empty if up to date).
    """
    pc = _assert_pc_owner(db, character_id, dm_email)
    _seed_missing(db, rulesets.class_features(_ruleset_of(pc)))
    catalog = ClassFeatureRepo.list_all(db, character_class=pc.character_class, max_level=pc.level)
    return _grant(db, pc, catalog, auth_service.personal_content_allowed(dm_email))


# ── Every feature at the PC's level (Plan 128) ─────────────────────────────


def _mods(pc: PlayerCharacter) -> dict[str, int]:
    """Ability modifiers, for notes that quote them (Aura of Protection, Bardic Inspiration)."""
    return {ab: _ability_mod(getattr(pc, f"score_{ab}")) for ab in _ABILITIES}


def class_features_of(pc: PlayerCharacter) -> list[dict[str, Any]]:
    """Every class and subclass feature this PC has at its level, with plain-words notes.

    Args:
        pc: The player character.

    Returns:
        ``[{"name", "level", "source": "class"|"subclass", "note"}]`` in level order.
    """
    return features_for_level(pc.character_class, pc.subclass, pc.level, _mods(pc))


def list_class_features(
    db: Session, character_id: uuid.UUID, dm_email: str
) -> list[dict[str, Any]]:
    """The DM's view: every class and subclass feature the PC has at its level.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        See ``class_features_of``.

    Raises:
        ValueError: If the PC or campaign is missing.
        PermissionError: If the DM does not own the campaign.
    """
    return class_features_of(_assert_pc_owner(db, character_id, dm_email))


def list_class_features_for_player(db: Session, pc_id: uuid.UUID) -> list[dict[str, Any]]:
    """The player's view through their sheet link (the router resolved the capability).

    Args:
        db: Active database session.
        pc_id: UUID of the PC the link opens.

    Returns:
        See ``class_features_of``.

    Raises:
        LookupError: If the PC does not exist.
    """
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise LookupError("Character not found.")
    return class_features_of(pc)
