"""Repository for the uploads ledger (Plan 130)."""

from sqlalchemy import func
from sqlmodel import Session, select

from domain.upload import Upload


class UploadRepo:
    """Data access for the uploads table."""

    @staticmethod
    def add(session: Session, upload: Upload) -> Upload:
        """Record one stored file.

        Args:
            session: Active database session.
            upload: The new row.

        Returns:
            The saved row.
        """
        session.add(upload)
        session.commit()
        session.refresh(upload)
        return upload

    @staticmethod
    def total_bytes(session: Session, owner_email: str) -> int:
        """The sum of every recorded upload's size for one owner.

        Args:
            session: Active database session.
            owner_email: The DM's (lowercased) email.

        Returns:
            Bytes used; 0 when they have no rows.
        """
        stmt = select(func.coalesce(func.sum(Upload.size_bytes), 0)).where(
            Upload.owner_email == owner_email.strip().lower()
        )
        return int(session.exec(stmt).one() or 0)

    @staticmethod
    def list_by_owner(session: Session, owner_email: str) -> list[Upload]:
        """Every recorded upload for one owner, newest first.

        Args:
            session: Active database session.
            owner_email: The DM's email.

        Returns:
            Their rows.
        """
        stmt = (
            select(Upload)
            .where(Upload.owner_email == owner_email.strip().lower())
            .order_by(Upload.created_at.desc())
        )
        return list(session.exec(stmt).all())
