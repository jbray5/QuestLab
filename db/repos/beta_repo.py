"""DB access for the friends beta (Plan 125): invites and feedback."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.beta import BetaInvite, Feedback


class InviteRepo:
    """CRUD for beta invite codes."""

    @staticmethod
    def get(session: Session, invite_id: uuid.UUID) -> Optional[BetaInvite]:
        """Fetch an invite by id.

        Args:
            session: Active database session.
            invite_id: The invite's id.

        Returns:
            The invite, or None.
        """
        return session.get(BetaInvite, invite_id)

    @staticmethod
    def get_by_code(session: Session, code: str) -> Optional[BetaInvite]:
        """Fetch an invite by its code (exact; callers normalise case).

        Args:
            session: Active database session.
            code: The invite code.

        Returns:
            The invite, or None.
        """
        return session.exec(select(BetaInvite).where(BetaInvite.code == code)).first()

    @staticmethod
    def list_all(session: Session) -> list[BetaInvite]:
        """Every invite, newest first.

        Args:
            session: Active database session.

        Returns:
            Invites ordered by creation time, newest first.
        """
        stmt = select(BetaInvite).order_by(BetaInvite.created_at.desc())
        return list(session.exec(stmt).all())

    @staticmethod
    def save(session: Session, invite: BetaInvite) -> BetaInvite:
        """Insert or update an invite.

        Args:
            session: Active database session.
            invite: The invite row.

        Returns:
            The refreshed row.
        """
        session.add(invite)
        session.commit()
        session.refresh(invite)
        return invite


class FeedbackRepo:
    """CRUD for feedback notes."""

    @staticmethod
    def get(session: Session, feedback_id: uuid.UUID) -> Optional[Feedback]:
        """Fetch a note by id.

        Args:
            session: Active database session.
            feedback_id: The note's id.

        Returns:
            The note, or None.
        """
        return session.get(Feedback, feedback_id)

    @staticmethod
    def list_all(session: Session) -> list[Feedback]:
        """Every note, newest first.

        Args:
            session: Active database session.

        Returns:
            Notes ordered by creation time, newest first.
        """
        stmt = select(Feedback).order_by(Feedback.created_at.desc())
        return list(session.exec(stmt).all())

    @staticmethod
    def save(session: Session, note: Feedback) -> Feedback:
        """Insert or update a note.

        Args:
            session: Active database session.
            note: The feedback row.

        Returns:
            The refreshed row.
        """
        session.add(note)
        session.commit()
        session.refresh(note)
        return note
