"""TableState repository — DB access only, no business logic (Plan 42)."""

import uuid
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

from domain.table_state import TableState


class TableStateRepo:
    """CRUD for the per-session live table surface state."""

    @staticmethod
    def get_by_session(session: Session, session_id: uuid.UUID) -> Optional[TableState]:
        """Fetch the table state for a session (1:1), if it exists.

        Args:
            session: Active database session.
            session_id: UUID of the parent game session.

        Returns:
            The TableState if present, else None.
        """
        stmt = select(TableState).where(TableState.session_id == session_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def get_or_create(session: Session, session_id: uuid.UUID) -> TableState:
        """Return the session's table state, creating an empty one if absent.

        Args:
            session: Active database session.
            session_id: UUID of the parent game session.

        Returns:
            The existing or newly-created TableState.
        """
        existing = TableStateRepo.get_by_session(session, session_id)
        if existing is not None:
            return existing
        row = TableState(session_id=session_id)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def save(session: Session, state: TableState) -> TableState:
        """Persist mutations to a table state and bump updated_at.

        Args:
            session: Active database session.
            state: The mutated TableState ORM object.

        Returns:
            The refreshed TableState.
        """
        state.updated_at = datetime.now(UTC)
        session.add(state)
        session.commit()
        session.refresh(state)
        return state

    @staticmethod
    def clear_map_references(session: Session, map_id: uuid.UUID) -> int:
        """Null out any table state pointing at a map about to be deleted.

        Args:
            session: Active database session.
            map_id: UUID of the battle map being removed.

        Returns:
            Number of table states updated.
        """
        stmt = select(TableState).where(TableState.active_map_id == map_id)
        rows = list(session.exec(stmt).all())
        for row in rows:
            row.active_map_id = None
            session.add(row)
        if rows:
            session.commit()
        return len(rows)
