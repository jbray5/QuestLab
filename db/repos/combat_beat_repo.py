"""CombatBeat repository — DB access only, no business logic.

Plan 40 Change 3 — state-triggered beats. Pure CRUD; the trigger-firing
logic and authorization live in the service.
"""

import uuid
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

from domain.combat_beat import CombatBeat


class CombatBeatRepo:
    """CRUD operations for CombatBeat rows."""

    @staticmethod
    def list_for_session(session: Session, session_id: uuid.UUID) -> list[CombatBeat]:
        """All beats for a session ordered by sort_index ascending then created_at.

        Args:
            session: Active database session.
            session_id: UUID of the parent game session.

        Returns:
            Every beat — pending, fired, and dismissed alike. Callers can
            filter by ``fired_at`` / ``dismissed_at`` for their view.
        """
        stmt = (
            select(CombatBeat)
            .where(CombatBeat.session_id == session_id)
            .order_by(CombatBeat.sort_index.asc(), CombatBeat.created_at.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def get_by_id(session: Session, beat_id: uuid.UUID) -> Optional[CombatBeat]:
        """Fetch one beat by primary key.

        Args:
            session: Active database session.
            beat_id: UUID of the beat.

        Returns:
            CombatBeat if found, else None.
        """
        stmt = select(CombatBeat).where(CombatBeat.id == beat_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def create(session: Session, beat: CombatBeat) -> CombatBeat:
        """Persist a new beat.

        Args:
            session: Active database session.
            beat: Fully-built CombatBeat row.

        Returns:
            The persisted row with id / created_at populated.
        """
        session.add(beat)
        session.commit()
        session.refresh(beat)
        return beat

    @staticmethod
    def update(session: Session, beat: CombatBeat) -> CombatBeat:
        """Persist changes to an existing beat.

        Args:
            session: Active database session.
            beat: The mutated row.

        Returns:
            The refreshed row.
        """
        session.add(beat)
        session.commit()
        session.refresh(beat)
        return beat

    @staticmethod
    def delete(session: Session, beat: CombatBeat) -> bool:
        """Remove a beat row.

        Args:
            session: Active database session.
            beat: The row to delete.

        Returns:
            True (always — the service controls validation upstream).
        """
        session.delete(beat)
        session.commit()
        return True

    @staticmethod
    def mark_fired(session: Session, beat: CombatBeat) -> CombatBeat:
        """Stamp ``fired_at`` if it isn't already set.

        Args:
            session: Active database session.
            beat: The beat to fire.

        Returns:
            The refreshed row.
        """
        if beat.fired_at is None:
            beat.fired_at = datetime.now(UTC)
            session.add(beat)
            session.commit()
            session.refresh(beat)
        return beat

    @staticmethod
    def mark_dismissed(session: Session, beat: CombatBeat) -> CombatBeat:
        """Stamp ``dismissed_at``. Fires the beat first if it wasn't already.

        Args:
            session: Active database session.
            beat: The beat to dismiss.

        Returns:
            The refreshed row.
        """
        now = datetime.now(UTC)
        if beat.fired_at is None:
            beat.fired_at = now
        beat.dismissed_at = now
        session.add(beat)
        session.commit()
        session.refresh(beat)
        return beat

    @staticmethod
    def reset(session: Session, beat: CombatBeat) -> CombatBeat:
        """Re-arm a beat — clears both fired_at and dismissed_at.

        Args:
            session: Active database session.
            beat: The beat to reset.

        Returns:
            The refreshed row.
        """
        beat.fired_at = None
        beat.dismissed_at = None
        session.add(beat)
        session.commit()
        session.refresh(beat)
        return beat
