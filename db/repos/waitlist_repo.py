"""Waitlist repository — DB access only (Plan 54)."""

from typing import Optional

from sqlmodel import Session, select

from domain.waitlist import WaitlistEntry


class WaitlistRepo:
    """CRUD for beta-waitlist entries."""

    @staticmethod
    def find_by_email(session: Session, email: str) -> Optional[WaitlistEntry]:
        """Fetch an entry by (already normalized) email.

        Args:
            session: Active database session.
            email: Lowercased email address.

        Returns:
            The WaitlistEntry if present, else None.
        """
        stmt = select(WaitlistEntry).where(WaitlistEntry.email == email).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def create(session: Session, entry: WaitlistEntry) -> WaitlistEntry:
        """Persist a new entry.

        Args:
            session: Active database session.
            entry: The WaitlistEntry to insert.

        Returns:
            The created entry.
        """
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry

    @staticmethod
    def count(session: Session) -> int:
        """Total signups.

        Args:
            session: Active database session.

        Returns:
            Number of entries.
        """
        return len(list(session.exec(select(WaitlistEntry)).all()))
