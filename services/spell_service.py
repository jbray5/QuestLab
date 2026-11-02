"""Spell service — business logic for the SRD spell catalogs and DM homebrew.

Plan 00017 — read-mostly. SEC-003: any signed-in DM may author homebrew spells (stamped
as theirs, listed only to them); the shared SRD rows are admin-only to change.

Plan 132 — a homebrew spell's name must not clash with a spell its DM can already see (the
character builder and level-up guide look spells up by name), and a spell characters still
know is not deleted: the refusal names who knows it.

Plan 131 — the catalog holds two editions side by side: the 2024 rows (SRD 5.2.1,
``ruleset="2024"``) and the 2014 rows (SRD 5.1, ``ruleset="2014"``). A DM's homebrew has no
ruleset and shows in both. Lists take an optional ``ruleset`` to keep one edition.
"""

import uuid
from typing import Any, Optional

from sqlmodel import Session

from db.repos.spell_repo import SpellRepo
from domain.spell import Spell, SpellConflictError, SpellCreate, SpellRead, SpellUpdate
from integrations.dnd_rules import rulesets
from services.auth_service import catalog_visible, require_catalog_editor

# Plan 132 — what a DM's homebrew spell says it comes from when the form gives no source.
HOMEBREW_SOURCE = "Homebrew"


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
    only the SRD seeds stamp "2024"/"2014". Plan 132: its name must not be one the DM can
    already see, and with no source given it says "Homebrew", not the SRD.

    Args:
        db: Active database session.
        payload: Validated SpellCreate.
        dm_email: The authoring DM (stamped, SEC-003), or None for the shared catalog.

    Returns:
        The newly persisted Spell.

    Raises:
        SpellConflictError: If a homebrew name is already taken.
    """
    if dm_email is not None:
        update: dict[str, Any] = {"ruleset": None}
        if "source" not in payload.model_fields_set:
            update["source"] = HOMEBREW_SOURCE
        payload = payload.model_copy(update=update)
        _require_free_name(db, payload.name, dm_email)
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
        SpellConflictError: If a homebrew spell is renamed to a name its DM can already see.
    """
    spell = get_spell(db, spell_id)
    require_catalog_editor(spell.created_by_email, dm_email)
    renamed = payload.name is not None and payload.name.casefold() != spell.name.casefold()
    if renamed and spell.created_by_email:
        _require_free_name(db, payload.name, spell.created_by_email, skip=spell.id)
    return SpellRepo.update(db, spell, payload)


def delete_spell(db: Session, spell_id, dm_email: str) -> bool:
    """Delete a spell the DM may edit (SEC-003), unless a character knows it (Plan 132).

    ``character_spells`` points at the spell with a plain foreign key, so deleting a known
    spell would fail in the database (or, without the key, leave spell lists pointing at
    nothing). It is refused instead, naming who knows it.

    Args:
        db: Active database session.
        spell_id: UUID of the spell.
        dm_email: The requesting DM.

    Returns:
        True if deleted.

    Raises:
        ValueError: If the spell does not exist.
        PermissionError: If it is shared (non-admin) or another DM's homebrew.
        SpellConflictError: If any character has it on their spell list.
    """
    spell = get_spell(db, spell_id)
    require_catalog_editor(spell.created_by_email, dm_email)
    knowers = SpellRepo.knower_names(db, spell.id)
    if knowers:
        raise SpellConflictError(_in_use_message(spell.name, knowers))
    return SpellRepo.delete(db, spell)


def _require_free_name(
    db: Session, name: str, owner_email: str, skip: Optional[uuid.UUID] = None
) -> None:
    """Refuse a homebrew name already used by a spell its owner can see (Plan 132).

    The shared rows of either edition and the owner's own homebrew count; other DMs'
    homebrew doesn't (they never see each other's).

    Raises:
        SpellConflictError: If the name is taken.
    """
    for row in SpellRepo.list_named(db, name):
        if row.id != skip and catalog_visible(row.created_by_email, owner_email):
            mine = bool(row.created_by_email)
            where = (
                "You already have a homebrew spell" if mine else "The rules already have a spell"
            )
            raise SpellConflictError(
                f"{where} called {row.name}. Give this one its own name, so spell pickers "
                "can tell them apart."
            )


def _in_use_message(spell_name: str, names: list[str]) -> str:
    """The plain refusal for deleting a spell characters know: who, and what to do first."""
    unique = list(dict.fromkeys(names))
    shown = unique[:3]
    rest = len(names) - len(shown)
    if rest > 0:
        who = f"{', '.join(shown)} and {rest} more"
    elif len(shown) > 1:
        who = f"{', '.join(shown[:-1])} and {shown[-1]}"
    else:
        who = shown[0]
    verb = "knows" if len(names) == 1 else "know"
    lists = "spell list" if len(names) == 1 else "spell lists"
    return (
        f"{spell_name} can't be deleted yet: {who} {verb} it. "
        f"Take it off their {lists} first, then delete it."
    )


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
