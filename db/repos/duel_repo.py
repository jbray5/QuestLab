"""Duel repository — DB access only, no business logic (Plan 104)."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Optional

from sqlmodel import Session, select

from domain.duel import Duel


class DuelRepo:
    """CRUD for server-held duels."""

    @staticmethod
    def get(session: Session, duel_id: uuid.UUID) -> Optional[Duel]:
        """Fetch one duel by id.

        Args:
            session: Active database session.
            duel_id: UUID of the duel.

        Returns:
            The Duel if present, else None.
        """
        return session.get(Duel, duel_id)

    @staticmethod
    def create(session: Session, duel: Duel) -> Duel:
        """Insert a new duel.

        Args:
            session: Active database session.
            duel: The populated Duel row.

        Returns:
            The refreshed Duel.
        """
        session.add(duel)
        session.commit()
        session.refresh(duel)
        return duel

    @staticmethod
    def save(session: Session, duel: Duel) -> Duel:
        """Persist mutations and bump updated_at.

        Args:
            session: Active database session.
            duel: The mutated Duel row.

        Returns:
            The refreshed Duel.
        """
        duel.updated_at = datetime.now(UTC)
        session.add(duel)
        session.commit()
        session.refresh(duel)
        return duel

    @staticmethod
    def list_recent_for_campaign(
        session: Session, campaign_id: uuid.UUID, since_minutes: int = 240
    ) -> list[Duel]:
        """Duels in a campaign touched recently, newest first.

        Args:
            session: Active database session.
            campaign_id: UUID of the campaign.
            since_minutes: How far back to look.

        Returns:
            Matching duels, newest first.
        """
        cutoff = datetime.now(UTC) - timedelta(minutes=since_minutes)
        stmt = select(Duel).where(Duel.campaign_id == campaign_id)
        rows = list(session.exec(stmt).all())
        fresh = [r for r in rows if _aware(r.updated_at) >= cutoff]
        return sorted(fresh, key=lambda r: _aware(r.updated_at), reverse=True)

    @staticmethod
    def delete(session: Session, duel: Duel) -> None:
        """Remove a duel row.

        Args:
            session: Active database session.
            duel: The row to delete.
        """
        session.delete(duel)
        session.commit()


def _aware(value: datetime) -> datetime:
    """Normalize a timestamp read back from either backend.

    Postgres returns what was written: an aware UTC moment. DuckDB drops the
    tzinfo *and* converts to local time first, so the same row comes back
    reading hours earlier — enough to fall outside a four-hour window and make
    a live duel look abandoned. ``astimezone`` on a naive value assumes local
    time, which is exactly what DuckDB gave us.

    Args:
        value: A timestamp from the database.

    Returns:
        The same moment, timezone-aware.
    """
    return value if value.tzinfo else value.astimezone(UTC)
