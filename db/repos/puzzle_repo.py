"""Puzzle repository — DB access only (Plan 55)."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.puzzle import Puzzle


class PuzzleRepo:
    """CRUD for campaign puzzles."""

    @staticmethod
    def get_by_id(session: Session, puzzle_id: uuid.UUID) -> Optional[Puzzle]:
        """Fetch a puzzle by primary key.

        Args:
            session: Active database session.
            puzzle_id: UUID of the puzzle.

        Returns:
            The Puzzle if found, else None.
        """
        stmt = select(Puzzle).where(Puzzle.id == puzzle_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def list_for_campaign(session: Session, campaign_id: uuid.UUID) -> list[Puzzle]:
        """List a campaign's puzzles, oldest first.

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.

        Returns:
            Puzzles ordered by created_at ascending.
        """
        stmt = (
            select(Puzzle)
            .where(Puzzle.campaign_id == campaign_id)
            .order_by(Puzzle.created_at.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, row: Puzzle) -> Puzzle:
        """Persist a new puzzle.

        Args:
            session: Active database session.
            row: The Puzzle to insert.

        Returns:
            The created Puzzle.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def save(session: Session, row: Puzzle) -> Puzzle:
        """Persist changes already applied to a fetched row.

        JSON columns are reassigned by the service (SQLAlchemy does not
        track in-place mutation of dict columns), so a plain add/commit
        is enough here.

        Args:
            session: Active database session.
            row: The modified Puzzle.

        Returns:
            The refreshed Puzzle.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def delete(session: Session, row: Puzzle) -> None:
        """Delete a puzzle.

        Args:
            session: Active database session.
            row: The Puzzle to delete.
        """
        session.delete(row)
        session.commit()
