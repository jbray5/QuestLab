"""Spell service — business logic for the SRD 5.5e spell catalog.

Plan 00017 — read-mostly. Writes are admin-only (DM-only auth model means
any authenticated DM can author homebrew spells, but listing/reading is open
to any authenticated user).
"""

from typing import Optional

from sqlmodel import Session

from db.repos.spell_repo import SpellRepo
from domain.spell import Spell, SpellCreate, SpellRead, SpellUpdate
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

    Returns:
        Filtered list of SpellRead objects.
    """
    rows = SpellRepo.list_all(
        db,
        q=q,
        level=level,
        school=school,
        class_name=class_name,
        is_ritual=is_ritual,
        is_concentration=is_concentration,
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


def list_for_class(db: Session, class_name: str, max_level: int = 9) -> list[SpellRead]:
    """Return spells a given class can learn, up to a max spell level.

    Used by the future character-sheet UI (Plan 00020) for the spell picker.

    Args:
        db: Active database session.
        class_name: Class name to filter by (e.g. "Wizard").
        max_level: Inclusive upper bound on spell level. Defaults to 9.

    Returns:
        Filtered list of SpellRead objects.
    """
    rows = SpellRepo.list_all(db, class_name=class_name)
    return [SpellRead.model_validate(s) for s in rows if s.level <= max_level]


def create_spell(db: Session, payload: SpellCreate, dm_email: Optional[str] = None) -> Spell:
    """Persist a new spell (the seeder, or a DM's homebrew).

    Args:
        db: Active database session.
        payload: Validated SpellCreate.
        dm_email: The authoring DM (stamped, SEC-003), or None for the shared catalog.

    Returns:
        The newly persisted Spell.
    """
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


def seed_spells(db: Session, payloads: list[SpellCreate]) -> int:
    """Seed the spell catalog if empty. Idempotent.

    Args:
        db: Active database session.
        payloads: List of validated SpellCreate payloads.

    Returns:
        Number of spells inserted (0 if the catalog is already populated).
    """
    if SpellRepo.count(db) > 0:
        return 0
    return SpellRepo.bulk_create(db, payloads)
