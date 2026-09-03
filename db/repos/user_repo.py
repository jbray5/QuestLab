"""Repository for users and AI usage counters (Plan 73)."""

import uuid
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

from domain.user import AiUsage, User


class UserRepo:
    """Data access for the users table."""

    @staticmethod
    def get_by_email(session: Session, email: str) -> Optional[User]:
        """Fetch a user by (lowercased) email.

        Args:
            session: Active database session.
            email: Email address.

        Returns:
            The user or None.
        """
        return session.exec(select(User).where(User.email == email.strip().lower())).first()

    @staticmethod
    def get_by_provider(session: Session, provider: str, provider_id: str) -> Optional[User]:
        """Fetch a user by a linked provider id.

        Args:
            session: Active database session.
            provider: ``discord`` or ``patreon``.
            provider_id: The provider's user id.

        Returns:
            The user or None.
        """
        col = User.discord_id if provider == "discord" else User.patreon_id
        return session.exec(select(User).where(col == provider_id)).first()

    @staticmethod
    def save(session: Session, user: User) -> User:
        """Persist a new or mutated user and bump ``last_seen_at``.

        Args:
            session: Active database session.
            user: The row.

        Returns:
            The refreshed row.
        """
        user.last_seen_at = datetime.now(UTC)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


class AiUsageRepo:
    """Data access for per-day AI usage counters."""

    @staticmethod
    def get(session: Session, email: str, day: str) -> Optional[AiUsage]:
        """Fetch today's counter row for a user, if any.

        Args:
            session: Active database session.
            email: User email.
            day: ``YYYY-MM-DD``.

        Returns:
            The counter row or None.
        """
        return session.exec(
            select(AiUsage).where(AiUsage.email == email, AiUsage.day == day)
        ).first()

    @staticmethod
    def increment(session: Session, email: str, day: str) -> int:
        """Add one generation to today's count and return the new total.

        Args:
            session: Active database session.
            email: User email.
            day: ``YYYY-MM-DD``.

        Returns:
            The count after incrementing.
        """
        row = AiUsageRepo.get(session, email, day)
        if row is None:
            row = AiUsage(id=uuid.uuid4(), email=email, day=day, count=0)
        row.count += 1
        session.add(row)
        session.commit()
        session.refresh(row)
        return row.count
