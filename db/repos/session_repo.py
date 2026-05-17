"""Session and SessionRunbook repositories — DB access only, no business logic."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.session import Session as GameSession
from domain.session import (
    SessionCombatant,
    SessionCombatantCreate,
    SessionCombatantUpdate,
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
        stmt = select(GameSession).where(GameSession.id == session_id).limit(1)
        return session.exec(stmt).first()

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


class SessionCombatantRepo:
    """CRUD operations for SessionCombatant rows (live initiative tracker state)."""

    @staticmethod
    def list_for_session(session: Session, session_id: uuid.UUID) -> list[SessionCombatant]:
        """Return all combatants for a session ordered by sort_index ascending.

        Args:
            session: Active database session.
            session_id: UUID of the parent game session.

        Returns:
            Combatants in initiative order (0 = first).
        """
        stmt = (
            select(SessionCombatant)
            .where(SessionCombatant.session_id == session_id)
            .order_by(SessionCombatant.sort_index.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def get_by_id(session: Session, combatant_id: uuid.UUID) -> Optional[SessionCombatant]:
        """Fetch a single combatant by primary key.

        Args:
            session: Active database session.
            combatant_id: UUID of the combatant row.

        Returns:
            SessionCombatant if found, else None.
        """
        stmt = select(SessionCombatant).where(SessionCombatant.id == combatant_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def find_active_for_character(
        session: Session, character_id: uuid.UUID
    ) -> Optional[tuple[GameSession, SessionCombatant]]:
        """Find the (session, combatant) pair where this PC is the active combatant.

        Plan 00028 — used by the player view to ask "is it my turn?". Joins
        sessions to their active SessionCombatant and returns the first match
        whose ``character_id`` equals ``character_id``.

        Args:
            session: Active database session.
            character_id: UUID of the player character.

        Returns:
            ``(GameSession, SessionCombatant)`` if a session currently has this
            PC as the active combatant; ``None`` otherwise.
        """
        stmt = (
            select(GameSession, SessionCombatant)
            .where(SessionCombatant.id == GameSession.combat_active_combatant_id)
            .where(SessionCombatant.character_id == character_id)
            .limit(1)
        )
        row = session.exec(stmt).first()
        if row is None:
            return None
        return (row[0], row[1])

    @staticmethod
    def replace_all(
        session: Session,
        session_id: uuid.UUID,
        combatants: list[SessionCombatantCreate],
    ) -> list[SessionCombatant]:
        """Replace the entire combatant roster for a session in one transaction.

        Used when rolling fresh initiative — old rows are deleted, new ones
        created with the provided sort_indexes.

        Args:
            session: Active database session.
            session_id: UUID of the parent game session.
            combatants: New combatant payloads.

        Returns:
            Newly-created SessionCombatant rows ordered by sort_index.
        """
        existing = SessionCombatantRepo.list_for_session(session, session_id)
        for row in existing:
            session.delete(row)
        session.flush()

        created: list[SessionCombatant] = []
        for payload in combatants:
            row = SessionCombatant.model_validate(
                {**payload.model_dump(), "session_id": session_id}
            )
            session.add(row)
            created.append(row)
        session.commit()
        for row in created:
            session.refresh(row)
        return sorted(created, key=lambda r: r.sort_index)

    @staticmethod
    def update_one(
        session: Session,
        combatant: SessionCombatant,
        data: SessionCombatantUpdate,
    ) -> SessionCombatant:
        """Apply a partial update to a single combatant row.

        Args:
            session: Active database session.
            combatant: Existing SessionCombatant ORM object.
            data: Partial update payload.

        Returns:
            The updated SessionCombatant.
        """
        patch = data.model_dump(exclude_unset=True)
        for field, value in patch.items():
            setattr(combatant, field, value)
        session.add(combatant)
        session.commit()
        session.refresh(combatant)
        return combatant

    @staticmethod
    def clear_for_session(session: Session, session_id: uuid.UUID) -> int:
        """Delete all combatants for a session. Returns count deleted.

        Args:
            session: Active database session.
            session_id: UUID of the parent game session.

        Returns:
            Number of rows deleted.
        """
        rows = SessionCombatantRepo.list_for_session(session, session_id)
        for row in rows:
            session.delete(row)
        session.commit()
        return len(rows)
