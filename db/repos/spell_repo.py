"""Spell repository — DB access only, no business logic.

Plan 00017 — read-heavy access patterns. Filters are pushed to SQL where
possible; the ``classes`` JSON column is filtered in Python because portable
JSON-array containment across Postgres + DuckDB is fiddly.
"""

import uuid
from typing import Any, Optional

from sqlalchemy import func, or_
from sqlmodel import Session, select

from domain.character import CharacterSpell, PlayerCharacter
from domain.spell import Spell, SpellCreate, SpellUpdate


def _in_ruleset(stmt: Any, ruleset: Optional[str]) -> Any:
    """Narrow a spell query to one edition's rows plus homebrew (NULL ruleset), or not at all."""
    if not ruleset:
        return stmt
    return stmt.where(
        or_(Spell.ruleset == str(getattr(ruleset, "value", ruleset)), Spell.ruleset.is_(None))
    )


class SpellRepo:
    """CRUD operations for Spell records."""

    @staticmethod
    def get_by_id(session: Session, spell_id: uuid.UUID) -> Optional[Spell]:
        """Fetch a single spell by primary key.

        Args:
            session: Active database session.
            spell_id: UUID of the spell.

        Returns:
            Spell if found, else None.
        """
        return session.get(Spell, spell_id)

    @staticmethod
    def get_by_name(session: Session, name: str, ruleset: Optional[str] = None) -> Optional[Spell]:
        """Fetch a spell by exact name (case-insensitive).

        Args:
            session: Active database session.
            name: Spell name to look up.
            ruleset: Plan 131 — "2024"/"2014" to look in that edition's catalog (homebrew,
                which has no ruleset, matches either). None searches every row.

        Returns:
            Spell if found, else None.
        """
        stmt = _in_ruleset(select(Spell).where(Spell.name.ilike(name)), ruleset).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def list_named(session: Session, name: str) -> list[Spell]:
        """Every spell with exactly this name, ignoring case and outer spaces (Plan 132).

        An equality match, not a pattern, so ``%`` or ``_`` in a homebrew name match only
        themselves.

        Args:
            session: Active database session.
            name: The spell name.

        Returns:
            Matching spells across both editions and every DM's homebrew.
        """
        stmt = select(Spell).where(func.lower(Spell.name) == name.strip().lower())
        return list(session.exec(stmt).all())

    @staticmethod
    def knower_names(session: Session, spell_id: uuid.UUID) -> list[str]:
        """Names of the characters with this spell on their spell list (Plan 132).

        Args:
            session: Active database session.
            spell_id: UUID of the spell.

        Returns:
            One character name per ``character_spells`` row, sorted.
        """
        stmt = (
            select(PlayerCharacter.character_name)
            .join(CharacterSpell, CharacterSpell.character_id == PlayerCharacter.id)
            .where(CharacterSpell.spell_id == spell_id)
            .order_by(PlayerCharacter.character_name.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def list_all(
        session: Session,
        q: Optional[str] = None,
        level: Optional[int] = None,
        school: Optional[str] = None,
        class_name: Optional[str] = None,
        is_ritual: Optional[bool] = None,
        is_concentration: Optional[bool] = None,
        ruleset: Optional[str] = None,
    ) -> list[Spell]:
        """List spells with optional filters.

        Filters applied at the SQL layer where possible. ``class_name`` filters
        the JSON ``classes`` array in Python after fetch (cheap — the catalog
        is small enough to fit in memory).

        Args:
            session: Active database session.
            q: Optional case-insensitive name substring search.
            level: Optional exact spell level (0 = cantrip).
            school: Optional exact school name (e.g. "Evocation").
            class_name: Optional class scope (e.g. "Wizard"). Case-sensitive.
            is_ritual: Optional ritual flag.
            is_concentration: Optional concentration flag.
            ruleset: Plan 131 — "2024"/"2014" keeps that edition's rows plus homebrew (which
                has no ruleset). None lists every row.

        Returns:
            Spells ordered by level ascending, then name ascending.
        """
        stmt = _in_ruleset(select(Spell), ruleset)
        if q:
            stmt = stmt.where(Spell.name.ilike(f"%{q}%"))
        if level is not None:
            stmt = stmt.where(Spell.level == level)
        if school:
            stmt = stmt.where(Spell.school.ilike(school))
        if is_ritual is not None:
            stmt = stmt.where(Spell.is_ritual == is_ritual)
        if is_concentration is not None:
            stmt = stmt.where(Spell.is_concentration == is_concentration)
        stmt = stmt.order_by(Spell.level.asc(), Spell.name.asc())
        rows = list(session.exec(stmt).all())
        if class_name:
            target = class_name.lower()
            rows = [s for s in rows if any(c.lower() == target for c in (s.classes or []))]
        return rows

    @staticmethod
    def create(session: Session, data: SpellCreate, owner_email: Optional[str] = None) -> Spell:
        """Persist a new spell.

        Args:
            session: Active database session.
            data: Validated spell creation payload.
            owner_email: The authoring DM for homebrew; None for the shared catalog.

        Returns:
            The newly created Spell.
        """
        spell = Spell.model_validate(data)
        spell.created_by_email = owner_email
        session.add(spell)
        session.commit()
        session.refresh(spell)
        return spell

    @staticmethod
    def bulk_create(session: Session, payloads: list[SpellCreate]) -> int:
        """Persist many spells in one transaction (used by the seeder).

        Args:
            session: Active database session.
            payloads: Validated spell creation payloads.

        Returns:
            Number of spells inserted.
        """
        rows = [Spell.model_validate(p) for p in payloads]
        for row in rows:
            session.add(row)
        session.commit()
        return len(rows)

    @staticmethod
    def update(session: Session, spell: Spell, data: SpellUpdate) -> Spell:
        """Apply a partial update to a spell.

        Args:
            session: Active database session.
            spell: Existing Spell ORM object.
            data: Partial update payload.

        Returns:
            The updated Spell.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(spell, field, value)
        session.add(spell)
        session.commit()
        session.refresh(spell)
        return spell

    @staticmethod
    def delete(session: Session, spell: Spell) -> bool:
        """Delete a spell record.

        Args:
            session: Active database session.
            spell: Spell ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(spell)
        session.commit()
        return True

    @staticmethod
    def count(session: Session, ruleset: Optional[str] = None) -> int:
        """Return the number of spells in the catalog.

        Args:
            session: Active database session.
            ruleset: Plan 131 — count only that edition's SRD rows ("2024"/"2014"), for the
                insert-if-missing seeds. None counts every row.

        Returns:
            Row count.
        """
        stmt = select(Spell)
        if ruleset:
            stmt = stmt.where(Spell.ruleset == str(getattr(ruleset, "value", ruleset)))
        return len(list(session.exec(stmt).all()))
