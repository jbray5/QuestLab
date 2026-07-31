"""Town Crier service — NPC-voiced Discord posts (Plan 56).

Every operation requires campaign ownership; there is no capability-URL
path here (unlike the Puzzle Workbench). Posting to the DM's real Discord
is not something an anonymous link should ever reach.
"""

import logging
import os
import uuid
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.campaign_repo import CampaignRepo
from db.repos.crier_repo import CrierChannelRepo, CrierNpcRepo, CrierPostRepo
from domain.campaign import Campaign
from domain.crier import (
    CrierChannel,
    CrierChannelCreate,
    CrierChannelRead,
    CrierChannelUpdate,
    CrierNpc,
    CrierNpcCreate,
    CrierNpcUpdate,
    CrierPost,
    CrierSendRequest,
)
from integrations import discord_webhook
from services import campaign_service

logger = logging.getLogger(__name__)


# ── Authz ─────────────────────────────────────────────────────────────────────


def _get_owned_campaign(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> Campaign:
    """Fetch a campaign, asserting the requester owns it.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        The owned Campaign.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the requester does not own it.
    """
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    campaign_service._assert_owner(campaign, dm_email)
    return campaign


def _assert_sending_allowed() -> None:
    """Refuse outbound posts on public demo deployments.

    ``DEMO_MODE`` pins every visitor to one shared demo identity
    (``api/deps.py``), so ownership checks cannot distinguish the real DM
    from a stranger. Outbound Discord posts are irreversible and public,
    so the send path closes entirely rather than trusting that identity.

    Raises:
        PermissionError: If DEMO_MODE is enabled.
    """
    if os.environ.get("DEMO_MODE", "").strip().lower() in ("1", "true", "yes"):
        raise PermissionError("The Town Crier is disabled on the public demo.")


def _mask(url: str) -> str:
    """Return a recognisable-but-useless tail of a webhook URL.

    Args:
        url: The full webhook URL.

    Returns:
        A short masked hint such as ``…a1b2c3``.
    """
    tail = (url or "").strip()[-6:]
    return f"…{tail}" if tail else ""


def _to_channel_read(row: CrierChannel) -> CrierChannelRead:
    """Project a channel WITHOUT its webhook URL.

    Args:
        row: The stored channel.

    Returns:
        A client-safe CrierChannelRead.
    """
    return CrierChannelRead(
        id=row.id,
        label=row.label,
        configured=bool(row.webhook_url),
        url_hint=_mask(row.webhook_url),
        sort_order=row.sort_order,
    )


# ── Channels ──────────────────────────────────────────────────────────────────


def list_channels(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> list[CrierChannelRead]:
    """List a campaign's channels, webhook URLs stripped.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        Client-safe channel projections.
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    return [_to_channel_read(r) for r in CrierChannelRepo.list_for_campaign(db, campaign_id)]


def create_channel(
    db: DBSession, campaign_id: uuid.UUID, dm_email: str, payload: CrierChannelCreate
) -> CrierChannelRead:
    """Register a channel webhook.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        payload: Label + webhook URL.

    Returns:
        The created channel, webhook URL stripped.

    Raises:
        ValueError: If the URL is not a Discord webhook URL.
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    url = payload.webhook_url.strip()
    if "discord.com/api/webhooks/" not in url and "discordapp.com/api/webhooks/" not in url:
        raise ValueError(
            "That does not look like a Discord webhook URL. Copy it from "
            "the channel's Settings → Integrations → Webhooks."
        )
    row = CrierChannel(
        campaign_id=campaign_id,
        label=payload.label.strip(),
        webhook_url=url,
        sort_order=payload.sort_order,
    )
    return _to_channel_read(CrierChannelRepo.create(db, row))


def update_channel(
    db: DBSession, channel_id: uuid.UUID, dm_email: str, payload: CrierChannelUpdate
) -> CrierChannelRead:
    """Update a channel's label, order, or webhook URL.

    Omitting ``webhook_url`` keeps the stored one — the UI never receives
    the current value, so it cannot echo it back on an unrelated edit.

    Args:
        db: Active database session.
        channel_id: UUID of the channel.
        dm_email: Email of the requesting DM.
        payload: Partial update.

    Returns:
        The refreshed channel, webhook URL stripped.

    Raises:
        ValueError: If the channel does not exist.
    """
    row = CrierChannelRepo.get_by_id(db, channel_id)
    if row is None:
        raise ValueError(f"Channel {channel_id} not found.")
    _get_owned_campaign(db, row.campaign_id, dm_email)

    if payload.label is not None:
        row.label = payload.label.strip()
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    if payload.webhook_url is not None and payload.webhook_url.strip():
        row.webhook_url = payload.webhook_url.strip()
    return _to_channel_read(CrierChannelRepo.save(db, row))


def delete_channel(db: DBSession, channel_id: uuid.UUID, dm_email: str) -> None:
    """Delete a channel.

    Args:
        db: Active database session.
        channel_id: UUID of the channel.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the channel does not exist.
    """
    row = CrierChannelRepo.get_by_id(db, channel_id)
    if row is None:
        raise ValueError(f"Channel {channel_id} not found.")
    _get_owned_campaign(db, row.campaign_id, dm_email)
    # Detach first: the sent-log outlives the channel it posted through.
    CrierPostRepo.detach_channel(db, channel_id)
    CrierChannelRepo.delete(db, row)


# ── NPC identities ────────────────────────────────────────────────────────────


def list_npcs(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> list[CrierNpc]:
    """List a campaign's NPC posting identities.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        The identities, in DM-chosen order.
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    return CrierNpcRepo.list_for_campaign(db, campaign_id)


def create_npc(
    db: DBSession, campaign_id: uuid.UUID, dm_email: str, payload: CrierNpcCreate
) -> CrierNpc:
    """Add an NPC posting identity.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        payload: Name, avatar, colour.

    Returns:
        The created identity.
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    row = CrierNpc(
        campaign_id=campaign_id,
        name=payload.name.strip(),
        avatar_url=(payload.avatar_url or "").strip() or None,
        embed_color=payload.embed_color,
        sort_order=payload.sort_order,
    )
    return CrierNpcRepo.create(db, row)


def update_npc(
    db: DBSession, npc_id: uuid.UUID, dm_email: str, payload: CrierNpcUpdate
) -> CrierNpc:
    """Update an NPC identity.

    Args:
        db: Active database session.
        npc_id: UUID of the identity.
        dm_email: Email of the requesting DM.
        payload: Partial update.

    Returns:
        The refreshed identity.

    Raises:
        ValueError: If the identity does not exist.
    """
    row = CrierNpcRepo.get_by_id(db, npc_id)
    if row is None:
        raise ValueError(f"NPC identity {npc_id} not found.")
    _get_owned_campaign(db, row.campaign_id, dm_email)

    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.avatar_url is not None:
        row.avatar_url = payload.avatar_url.strip() or None
    if payload.embed_color is not None:
        row.embed_color = payload.embed_color
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    return CrierNpcRepo.save(db, row)


def delete_npc(db: DBSession, npc_id: uuid.UUID, dm_email: str) -> None:
    """Delete an NPC identity.

    Args:
        db: Active database session.
        npc_id: UUID of the identity.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the identity does not exist.
    """
    row = CrierNpcRepo.get_by_id(db, npc_id)
    if row is None:
        raise ValueError(f"NPC identity {npc_id} not found.")
    _get_owned_campaign(db, row.campaign_id, dm_email)
    # Detach first: the sent-log outlives the identity that spoke.
    CrierPostRepo.detach_npc(db, npc_id)
    CrierNpcRepo.delete(db, row)


# ── Sending ───────────────────────────────────────────────────────────────────


def list_posts(
    db: DBSession, campaign_id: uuid.UUID, dm_email: str, limit: int = 100
) -> list[CrierPost]:
    """Read the sent-log, newest first.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        limit: Maximum rows.

    Returns:
        Sent-log rows.
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    return CrierPostRepo.list_for_campaign(db, campaign_id, limit)


def send(
    db: DBSession, campaign_id: uuid.UUID, dm_email: str, payload: CrierSendRequest
) -> CrierPost:
    """Post a message to Discord as an NPC, and log the outcome.

    A failed send is logged too — a post that vanishes with no trace is
    worse than one that visibly failed.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        payload: Channel, identity, and message body.

    Returns:
        The sent-log row (status ``sent`` or ``failed``).

    Raises:
        ValueError: If the channel or identity is missing or Discord refused.
        PermissionError: If the DM does not own the campaign, or DEMO_MODE.
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    _assert_sending_allowed()

    channel = CrierChannelRepo.get_by_id(db, payload.channel_id)
    if channel is None or channel.campaign_id != campaign_id:
        raise ValueError("Channel not found in this campaign.")
    npc = CrierNpcRepo.get_by_id(db, payload.npc_id)
    if npc is None or npc.campaign_id != campaign_id:
        raise ValueError("NPC identity not found in this campaign.")

    error: Optional[str] = None
    try:
        discord_webhook.post(
            channel.webhook_url,
            username=npc.name,
            avatar_url=npc.avatar_url,
            content=payload.content,
            embed_description=payload.embed_description,
            embed_color=npc.embed_color,
            channel_label=channel.label,
        )
    except ValueError as exc:
        error = str(exc)[:500]

    row = CrierPost(
        campaign_id=campaign_id,
        channel_id=channel.id,
        npc_id=npc.id,
        channel_label=channel.label,
        npc_name=npc.name,
        content=payload.content,
        embed_description=payload.embed_description,
        status="failed" if error else "sent",
        error=error,
    )
    logged = CrierPostRepo.create(db, row)

    if error:
        raise ValueError(error)
    return logged
