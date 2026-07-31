"""Town Crier repositories — DB access only (Plan 56)."""

import uuid
from typing import Optional

from sqlmodel import Session, select

from domain.crier import CrierChannel, CrierNpc, CrierPost


class CrierChannelRepo:
    """CRUD for a campaign's Discord channel webhooks."""

    @staticmethod
    def get_by_id(session: Session, channel_id: uuid.UUID) -> Optional[CrierChannel]:
        """Fetch a channel by primary key.

        Args:
            session: Active database session.
            channel_id: UUID of the channel.

        Returns:
            The CrierChannel if found, else None.
        """
        stmt = select(CrierChannel).where(CrierChannel.id == channel_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def list_for_campaign(session: Session, campaign_id: uuid.UUID) -> list[CrierChannel]:
        """List a campaign's channels in DM-chosen order.

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.

        Returns:
            Channels ordered by sort_order then label.
        """
        stmt = (
            select(CrierChannel)
            .where(CrierChannel.campaign_id == campaign_id)
            .order_by(CrierChannel.sort_order.asc(), CrierChannel.label.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, row: CrierChannel) -> CrierChannel:
        """Persist a new channel.

        Args:
            session: Active database session.
            row: The CrierChannel to insert.

        Returns:
            The created CrierChannel.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def save(session: Session, row: CrierChannel) -> CrierChannel:
        """Persist changes already applied to a fetched channel.

        Args:
            session: Active database session.
            row: The modified CrierChannel.

        Returns:
            The refreshed CrierChannel.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def delete(session: Session, row: CrierChannel) -> None:
        """Delete a channel.

        Args:
            session: Active database session.
            row: The CrierChannel to delete.
        """
        session.delete(row)
        session.commit()


class CrierNpcRepo:
    """CRUD for a campaign's NPC posting identities."""

    @staticmethod
    def get_by_id(session: Session, npc_id: uuid.UUID) -> Optional[CrierNpc]:
        """Fetch an NPC identity by primary key.

        Args:
            session: Active database session.
            npc_id: UUID of the identity.

        Returns:
            The CrierNpc if found, else None.
        """
        stmt = select(CrierNpc).where(CrierNpc.id == npc_id).limit(1)
        return session.exec(stmt).first()

    @staticmethod
    def get_by_name(session: Session, campaign_id: uuid.UUID, name: str) -> Optional[CrierNpc]:
        """Fetch an identity by name within a campaign.

        Used by the seeder to stay idempotent.

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.
            name: Exact identity name.

        Returns:
            The CrierNpc if found, else None.
        """
        stmt = (
            select(CrierNpc)
            .where(CrierNpc.campaign_id == campaign_id)
            .where(CrierNpc.name == name)
            .limit(1)
        )
        return session.exec(stmt).first()

    @staticmethod
    def list_for_campaign(session: Session, campaign_id: uuid.UUID) -> list[CrierNpc]:
        """List a campaign's identities in DM-chosen order.

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.

        Returns:
            Identities ordered by sort_order then name.
        """
        stmt = (
            select(CrierNpc)
            .where(CrierNpc.campaign_id == campaign_id)
            .order_by(CrierNpc.sort_order.asc(), CrierNpc.name.asc())
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, row: CrierNpc) -> CrierNpc:
        """Persist a new identity.

        Args:
            session: Active database session.
            row: The CrierNpc to insert.

        Returns:
            The created CrierNpc.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def save(session: Session, row: CrierNpc) -> CrierNpc:
        """Persist changes already applied to a fetched identity.

        Args:
            session: Active database session.
            row: The modified CrierNpc.

        Returns:
            The refreshed CrierNpc.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def delete(session: Session, row: CrierNpc) -> None:
        """Delete an identity.

        Args:
            session: Active database session.
            row: The CrierNpc to delete.
        """
        session.delete(row)
        session.commit()


class CrierPostRepo:
    """Append and read the sent-log."""

    @staticmethod
    def list_for_campaign(
        session: Session, campaign_id: uuid.UUID, limit: int = 100
    ) -> list[CrierPost]:
        """List a campaign's posts, newest first.

        Args:
            session: Active database session.
            campaign_id: UUID of the owning campaign.
            limit: Maximum rows to return.

        Returns:
            CrierPosts ordered by sent_at descending.
        """
        stmt = (
            select(CrierPost)
            .where(CrierPost.campaign_id == campaign_id)
            .order_by(CrierPost.sent_at.desc())
            .limit(limit)
        )
        return list(session.exec(stmt).all())

    @staticmethod
    def create(session: Session, row: CrierPost) -> CrierPost:
        """Append a sent-log row.

        Args:
            session: Active database session.
            row: The CrierPost to insert.

        Returns:
            The created CrierPost.
        """
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @staticmethod
    def detach_channel(session: Session, channel_id: uuid.UUID) -> None:
        """Null out log references to a channel about to be deleted.

        Done in the application rather than left to ``ON DELETE SET NULL``
        so the behaviour is identical on Postgres (prod) and DuckDB (tests).
        The label snapshot on each row keeps the log readable.

        Args:
            session: Active database session.
            channel_id: UUID of the channel being removed.
        """
        stmt = select(CrierPost).where(CrierPost.channel_id == channel_id)
        for row in session.exec(stmt).all():
            row.channel_id = None
            session.add(row)
        session.commit()

    @staticmethod
    def detach_npc(session: Session, npc_id: uuid.UUID) -> None:
        """Null out log references to an identity about to be deleted.

        Args:
            session: Active database session.
            npc_id: UUID of the identity being removed.
        """
        stmt = select(CrierPost).where(CrierPost.npc_id == npc_id)
        for row in session.exec(stmt).all():
            row.npc_id = None
            session.add(row)
        session.commit()
