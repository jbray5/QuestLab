"""Spell repository — DB access only, no business logic.

Plan 00017 — read-heavy access patterns. Filters are pushed to SQL where
possible; the ``classes`` JSON column is filtered in Python because portable
JSON-array containment across Postgres + DuckDB is fiddly.
"""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.spell import Spell, SpellCreate, SpellUpdate


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
    def get_by_name(session: Session, name: str) -> Optional[Spell]:
        """Fetch a spell by exact name (case-insensitive).

        Args:
            session: Active database session.
            name: Spell name to look up.

        Returns:
            Spell if found, else None.
        """
        stmt = select(Spell).where(Spell.name.ilike(name)).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def list_all(
        session: Session,
        q: Optional[str] = None,
        level: Optional[int] = None,
        school: Optional[str] = None,
        class_name: Optional[str] = None,
        is_ritual: Optional[bool] = None,
        is_concentration: Optional[bool] = None,
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

        Returns:
            Spells ordered by level ascending, then name ascending.
        """
        stmt = select(Spell)
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
    def create(session: Session, data: SpellCreate) -> Spell:
        """Persist a new spell.

        Args:
            session: Active database session.
            data: Validated spell creation payload.

        Returns:
            The newly created Spell.
        """
        spell = Spell.model_validate(data)
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
    def count(session: Session) -> int:
        """Return the total number of spells in the catalog.

        Args:
            session: Active database session.

        Returns:
            Row count.
        """
        return len(list(session.exec(select(Spell)).all()))
