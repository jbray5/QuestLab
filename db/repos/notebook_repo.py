"""Notebook repositories — DB access only (Plan 57)."""

import uuid
from typing import Optional

from sqlmodel import Session, or_, select

from domain.notebook import Notebook, NotebookPage


class NotebookRepo:
    """CRUD for a campaign's notebooks."""

    @staticmethod
    def get_by_id(session: Session, notebook_id: uuid.UUID) -> Optional[Notebook]:
        """Fetch a notebook by primary key.

        Args:
            session: Active database session.
            notebook_id: UUID of the notebook.

        Returns:
            The Notebook if found, else None.
        """
        stmt = select(Notebook).where(Notebook.id == notebook_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def list_for_campaign(session: Session, campaign_id: uuid.UUID) -> list[Notebook]:
        """List a campaign's notebooks in DM order.

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.

        Returns:
            Notebooks ordered by sort_order then created_at.
        """
        stmt = (
            select(Notebook)
            .where(Notebook.campaign_id == campaign_id)
            .order_by(Notebook.sort_order.asc(), Notebook.created_at.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, row: Notebook) -> Notebook:
        """Persist a new notebook.

        Args:
            session: Active database session.
            row: The Notebook to insert.

        Returns:
            The created Notebook.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def save(session: Session, row: Notebook) -> Notebook:
        """Persist changes already applied to a fetched notebook.

        Args:
            session: Active database session.
            row: The modified Notebook.

        Returns:
            The refreshed Notebook.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def delete(session: Session, row: Notebook) -> None:
        """Delete a notebook.

        Args:
            session: Active database session.
            row: The Notebook to delete.
        """
        session.delete(row)
        session.commit()


class NotebookPageRepo:
    """CRUD + search for notebook pages."""

    @staticmethod
    def get_by_id(session: Session, page_id: uuid.UUID) -> Optional[NotebookPage]:
        """Fetch a page by primary key.

        Args:
            session: Active database session.
            page_id: UUID of the page.

        Returns:
            The NotebookPage if found, else None.
        """
        stmt = select(NotebookPage).where(NotebookPage.id == page_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def list_for_notebook(session: Session, notebook_id: uuid.UUID) -> list[NotebookPage]:
        """List a notebook's pages in DM order.

        Args:
            session: Active database session.
            notebook_id: UUID of the owning notebook.

        Returns:
            Pages ordered by sort_order then updated_at.
        """
        stmt = (
            select(NotebookPage)
            .where(NotebookPage.notebook_id == notebook_id)
            .order_by(NotebookPage.sort_order.asc(), NotebookPage.updated_at.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def list_runbooks(session: Session, campaign_id: uuid.UUID) -> list[NotebookPage]:
        """List a campaign's promoted runbook pages.

        Args:
            session: Active database session.
            campaign_id: UUID of the campaign.

        Returns:
            Pages flagged is_runbook, most recently updated first.
        """
        stmt = (
            select(NotebookPage)
            .where(NotebookPage.campaign_id == campaign_id)
            .where(NotebookPage.is_runbook == True)  # noqa: E712
            .order_by(NotebookPage.updated_at.desc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def search(session: Session, campaign_id: uuid.UUID, q: str) -> list[NotebookPage]:
        """Case-insensitive full-text search over titles and page text.

        Args:
            session: Active database session.
            campaign_id: UUID of the campaign.
            q: Search phrase (matched as a substring).

        Returns:
            Matching pages, most recently updated first.
        """
        needle = f"%{q}%"
        stmt = (
            select(NotebookPage)
            .where(NotebookPage.campaign_id == campaign_id)
            .where(
                or_(
                    NotebookPage.title.ilike(needle),  # type: ignore[attr-defined]
                    NotebookPage.search_text.ilike(needle),  # type: ignore[attr-defined]
                )
            )
            .order_by(NotebookPage.updated_at.desc())
            .limit(50)
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, row: NotebookPage) -> NotebookPage:
        """Persist a new page.

        Args:
            session: Active database session.
            row: The NotebookPage to insert.

        Returns:
            The created NotebookPage.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def save(session: Session, row: NotebookPage) -> NotebookPage:
        """Persist changes already applied to a fetched page.

        JSON columns are reassigned by the service (SQLAlchemy does not
        track in-place dict mutation), so add/commit suffices.

        Args:
            session: Active database session.
            row: The modified NotebookPage.

        Returns:
            The refreshed NotebookPage.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def delete(session: Session, row: NotebookPage) -> None:
        """Delete a page.

        Args:
            session: Active database session.
            row: The NotebookPage to delete.
        """
        session.delete(row)
        session.commit()

    @staticmethod
    def delete_for_notebook(session: Session, notebook_id: uuid.UUID) -> None:
        """Delete all pages of a notebook (before deleting the notebook).

        Explicit rather than relying on DB cascade so tests (DuckDB, no
        migration-level cascade) and prod behave identically.

        Args:
            session: Active database session.
            notebook_id: UUID of the notebook being removed.
        """
        stmt = select(NotebookPage).where(NotebookPage.notebook_id == notebook_id)
        for row in session.exec(stmt).all():
            session.delete(row)
        session.commit()
