"""Spell service — business logic for the SRD spell catalogs.

Plan 00017 — read-mostly. Writes are admin-only (DM-only auth model means
any authenticated DM can author homebrew spells, but listing/reading is open
to any authenticated user).

Plan 131 — the catalog holds two editions side by side: the 2024 rows (SRD 5.2.1,
``ruleset="2024"``) and the 2014 rows (SRD 5.1, ``ruleset="2014"``). A DM's homebrew has no
ruleset and shows in both. Lists take an optional ``ruleset`` to keep one edition.
"""

from typing import Any, Optional

from sqlmodel import Session

from db.repos.spell_repo import SpellRepo
from domain.spell import Spell, SpellCreate, SpellRead, SpellUpdate
from integrations.dnd_rules import rulesets
from services.auth_service import catalog_visible, require_catalog_editor


def list_spells(
    db: Session,
    q: Optional[str] = None,
    level: Optional[int] = None,
    school: Optional[str] = None,
    class_name: Optional[str] = None,
    is_ritual: Optional[bool] = None,
    is_concentration: Optional[bool] = None,
    viewer: Optional[str] = None,
    ruleset: Any = None,
) -> list[SpellRead]:
    """List spells with optional filters.

    Args:
        db: Active database session.
        q: Optional case-insensitive name substring.
        level: Optional exact level (0 for cantrips).
        school: Optional school name.
        class_name: Optional class scope (Wizard, Cleric, ...).
        is_ritual: Optional ritual filter.
        is_concentration: Optional concentration filter.
        viewer: The listing DM: shared spells plus their own homebrew (SEC-003).
        ruleset: Plan 131 — "2024"/"2014" (or a Ruleset) keeps that edition's spells plus
            homebrew. None lists both editions, as before.

    Returns:
        Filtered list of SpellRead objects.

    Raises:
        ValueError: If ``ruleset`` is not a known ruleset.
    """
    rows = SpellRepo.list_all(
        db,
        q=q,
        level=level,
        school=school,
        class_name=class_name,
        is_ritual=is_ritual,
        is_concentration=is_concentration,
        ruleset=_edition(ruleset),
    )
    return [
        SpellRead.model_validate(s) for s in rows if catalog_visible(s.created_by_email, viewer)
    ]


def get_spell(db: Session, spell_id) -> Spell:
    """Fetch a single spell by ID or raise ValueError.

    Args:
        db: Active database session.
        spell_id: UUID of the spell.

    Returns:
        The matching Spell ORM object.

    Raises:
        ValueError: If no spell with that ID exists.
    """
    spell = SpellRepo.get_by_id(db, spell_id)
    if spell is None:
        raise ValueError(f"Spell {spell_id} not found.")
    return spell


def list_for_class(
    db: Session, class_name: str, max_level: int = 9, ruleset: Any = None
) -> list[SpellRead]:
    """Return spells a given class can learn, up to a max spell level.

    Used by the future character-sheet UI (Plan 00020) for the spell picker.

    Args:
        db: Active database session.
        class_name: Class name to filter by (e.g. "Wizard").
        max_level: Inclusive upper bound on spell level. Defaults to 9.
        ruleset: Plan 131 — "2024"/"2014" (or a Ruleset) keeps that edition's class list
            plus homebrew. None lists both editions.

    Returns:
        Filtered list of SpellRead objects.

    Raises:
        ValueError: If ``ruleset`` is not a known ruleset.
    """
    rows = SpellRepo.list_all(db, class_name=class_name, ruleset=_edition(ruleset))
    return [SpellRead.model_validate(s) for s in rows if s.level <= max_level]


def create_spell(db: Session, payload: SpellCreate, dm_email: Optional[str] = None) -> Spell:
    """Persist a new spell (the seeder, or a DM's homebrew).

    A DM's homebrew never carries a ruleset (Plan 131): it is valid in both editions, and
    only the SRD seeds stamp "2024"/"2014".

    Args:
        db: Active database session.
        payload: Validated SpellCreate.
        dm_email: The authoring DM (stamped, SEC-003), or None for the shared catalog.

    Returns:
        The newly persisted Spell.
    """
    if dm_email is not None and payload.ruleset is not None:
        payload = payload.model_copy(update={"ruleset": None})
    return SpellRepo.create(db, payload, owner_email=dm_email)


def update_spell(db: Session, spell_id, payload: SpellUpdate, dm_email: str) -> Spell:
    """Partial update for a spell the DM may edit (SEC-003).

    Args:
        db: Active database session.
        spell_id: UUID of the spell.
        payload: Validated SpellUpdate.
        dm_email: The requesting DM.

    Returns:
        The updated Spell.

    Raises:
        ValueError: If the spell does not exist.
        PermissionError: If it is shared (non-admin) or another DM's homebrew.
    """
    spell = get_spell(db, spell_id)
    require_catalog_editor(spell.created_by_email, dm_email)
    return SpellRepo.update(db, spell, payload)


def delete_spell(db: Session, spell_id, dm_email: str) -> bool:
    """Delete a spell the DM may edit (SEC-003).

    Args:
        db: Active database session.
        spell_id: UUID of the spell.
        dm_email: The requesting DM.

    Returns:
        True if deleted.

    Raises:
        ValueError: If the spell does not exist.
        PermissionError: If it is shared (non-admin) or another DM's homebrew.
    """
    spell = get_spell(db, spell_id)
    require_catalog_editor(spell.created_by_email, dm_email)
    return SpellRepo.delete(db, spell)


def _edition(ruleset: Any) -> Optional[str]:
    """The plain ruleset value for a filter, or None when no ruleset was asked for."""
    return None if ruleset is None else rulesets.normalize(ruleset)


def seed_spells(db: Session, payloads: list[SpellCreate], ruleset: Any = None) -> int:
    """Seed spells if they are missing. Idempotent.

    Without ``ruleset`` (the original behaviour) the payloads go in only when the whole
    catalog is empty. With a ruleset (Plan 131) they go in when that edition has no rows
    yet, each stamped with that ruleset, so the 2014 catalog lands beside an existing
    2024 one.

    Args:
        db: Active database session.
        payloads: List of validated SpellCreate payloads.
        ruleset: "2024"/"2014" (or a Ruleset) to seed one edition; None for the legacy
            whole-catalog check.

    Returns:
        Number of spells inserted (0 if already populated).

    Raises:
        ValueError: If ``ruleset`` is not a known ruleset.
    """
    if ruleset is None:
        if SpellRepo.count(db) > 0:
            return 0
        return SpellRepo.bulk_create(db, payloads)
    edition = rulesets.normalize(ruleset)
    if SpellRepo.count(db, ruleset=edition) > 0:
        return 0
    stamped = [
        p if p.ruleset == edition else p.model_copy(update={"ruleset": edition}) for p in payloads
    ]
    return SpellRepo.bulk_create(db, stamped)


def seed_srd_spells(db: Session) -> dict[str, int]:
    """Seed both SRD spell catalogs at startup, each only while it has no rows (Plan 131).

    The 2024 list (SRD 5.2.1) carries no ruleset of its own, so it is stamped "2024" here;
    the 2014 list (SRD 5.1) is already stamped "2014". Prod's existing 2024 rows were
    backfilled to "2024" by migration 0061, so only the 2014 rows are new there.

    Args:
        db: Active database session.

    Returns:
        Rows inserted per ruleset, e.g. ``{"2024": 0, "2014": 319}``.
    """
    return {r: seed_spells(db, rulesets.spell_seed(r), ruleset=r) for r in rulesets.RULESETS}
