"""Spell service — business logic for the SRD 5.5e spell catalog.

Plan 00017 — read-mostly. Writes are admin-only (DM-only auth model means
any authenticated DM can author homebrew spells, but listing/reading is open
to any authenticated user).
"""

from typing import Optional

from sqlmodel import Session

from db.repos.spell_repo import SpellRepo
from domain.spell import Spell, SpellCreate, SpellRead, SpellUpdate


def list_spells(
    db: Session,
    q: Optional[str] = None,
    level: Optional[int] = None,
    school: Optional[str] = None,
    class_name: Optional[str] = None,
    is_ritual: Optional[bool] = None,
    is_concentration: Optional[bool] = None,
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
    return [SpellRead.model_validate(s) for s in rows]


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


def create_spell(db: Session, payload: SpellCreate) -> Spell:
    """Persist a new spell (used by both the seeder and admin write endpoint).

    Args:
        db: Active database session.
        payload: Validated SpellCreate.

    Returns:
        The newly persisted Spell.
    """
    return SpellRepo.create(db, payload)


def update_spell(db: Session, spell_id, payload: SpellUpdate) -> Spell:
    """Partial update for a spell.

    Args:
        db: Active database session.
        spell_id: UUID of the spell.
        payload: Validated SpellUpdate.

    Returns:
        The updated Spell.

    Raises:
        ValueError: If the spell does not exist.
    """
    spell = get_spell(db, spell_id)
    return SpellRepo.update(db, spell, payload)


def delete_spell(db: Session, spell_id) -> bool:
    """Delete a spell by ID.

    Args:
        db: Active database session.
        spell_id: UUID of the spell.

    Returns:
        True if deleted.

    Raises:
        ValueError: If the spell does not exist.
    """
    spell = get_spell(db, spell_id)
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
