"""Session and SessionRunbook repositories — DB access only, no business logic."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.session import Session as GameSession
from domain.session import (
    SessionCreate,
    SessionRunbook,
    SessionRunbookCreate,
    SessionUpdate,
)


class SessionRepo:
    """CRUD operations for game Session records."""

    @staticmethod
    def get_by_id(session: Session, session_id: uuid.UUID) -> Optional[GameSession]:
        """Fetch a single game session by primary key.

        Args:
            session: Active database session.
            session_id: UUID of the game session.

        Returns:
            GameSession if found, else None.
        """
        return session.get(GameSession, session_id)

    @staticmethod
    def list_by_adventure(session: Session, adventure_id: uuid.UUID) -> list[GameSession]:
        """List all sessions for an adventure in chronological order.

        Args:
            session: Active database session.
            adventure_id: UUID of the parent adventure.

        Returns:
            Sessions ordered by session_number ascending.
        """
        stmt = (
            select(GameSession)
            .where(GameSession.adventure_id == adventure_id)
            .order_by(GameSession.session_number.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, data: SessionCreate) -> GameSession:
        """Persist a new game session.

        Args:
            session: Active database session.
            data: Validated session creation payload.

        Returns:
            The newly created GameSession.
        """
        game_session = GameSession.model_validate(data)
        session.add(game_session)
        session.commit()
        session.refresh(game_session)
        return game_session

    @staticmethod
    def update(session: Session, game_session: GameSession, data: SessionUpdate) -> GameSession:
        """Apply a partial update to a game session.

        Args:
            session: Active database session.
            game_session: Existing GameSession ORM object.
            data: Partial update payload.

        Returns:
            The updated GameSession.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(game_session, field, value)
        session.add(game_session)
        session.commit()
        session.refresh(game_session)
        return game_session

    @staticmethod
    def delete(session: Session, game_session: GameSession) -> bool:
        """Delete a game session record.

        Args:
            session: Active database session.
            game_session: GameSession ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(game_session)
        session.commit()
        return True


class SessionRunbookRepo:
    """CRUD operations for SessionRunbook records."""

    @staticmethod
    def get_by_session(session: Session, session_id: uuid.UUID) -> Optional[SessionRunbook]:
        """Fetch the runbook for a given game session (1:1 relation).

        Args:
            session: Active database session.
            session_id: UUID of the parent game session.

        Returns:
            SessionRunbook if one exists, else None.
        """
        stmt = select(SessionRunbook).where(SessionRunbook.session_id == session_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def create(session: Session, data: SessionRunbookCreate) -> SessionRunbook:
        """Persist a new session runbook, overwriting any existing one for this session.

        Args:
            session: Active database session.
            data: Validated runbook creation payload.

        Returns:
            The newly created SessionRunbook.
        """
        existing = SessionRunbookRepo.get_by_session(session, data.session_id)
        if existing:
            session.delete(existing)
            session.flush()
        runbook = SessionRunbook.model_validate(data)
        session.add(runbook)
        session.commit()
        session.refresh(runbook)
        return runbook

    @staticmethod
    def delete(session: Session, runbook: SessionRunbook) -> bool:
        """Delete a session runbook record.

        Args:
            session: Active database session.
            runbook: SessionRunbook ORM object to delete.

        Returns:
            True if deleted.
        """
        session.delete(runbook)
        session.commit()
        return True
