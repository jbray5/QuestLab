"""Town Crier router — DM-only NPC Discord posting (Plan 56).

Every route is identity-gated. Unlike the Puzzle Workbench there is no
capability-URL variant: an anonymous link must never reach a send button
that posts into the DM's real Discord server.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.crier import (
    CrierChannelCreate,
    CrierChannelRead,
    CrierChannelUpdate,
    CrierNpcCreate,
    CrierNpcRead,
    CrierNpcUpdate,
    CrierPostRead,
    CrierSendRequest,
)
from services import crier_service

router = APIRouter(tags=["crier"])


def _http(exc: Exception) -> HTTPException:
    """404 for missing rows, 409 for business refusals."""
    msg = str(exc)
    code = status.HTTP_404_NOT_FOUND if "not found" in msg.lower() else status.HTTP_409_CONFLICT
    return HTTPException(status_code=code, detail=msg)


def _forbidden(exc: Exception) -> HTTPException:
    """403 for ownership and demo-mode refusals."""
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── Channels ──────────────────────────────────────────────────────────────────


@router.get("/campaigns/{campaign_id}/crier/channels", response_model=list[CrierChannelRead])
def list_channels(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[CrierChannelRead]:
    """List the campaign's Discord channels (webhook URLs stripped).

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Client-safe channel projections.
    """
    try:
        return crier_service.list_channels(db, campaign_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.post(
    "/campaigns/{campaign_id}/crier/channels",
    response_model=CrierChannelRead,
    status_code=status.HTTP_201_CREATED,
)
def create_channel(
    campaign_id: uuid.UUID, body: CrierChannelCreate, db: DB, user: CurrentUser
) -> CrierChannelRead:
    """Register a channel webhook.

    Args:
        campaign_id: UUID of the campaign.
        body: Label + webhook URL.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The created channel, webhook URL stripped.
    """
    try:
        return crier_service.create_channel(db, campaign_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.patch("/crier/channels/{channel_id}", response_model=CrierChannelRead)
def update_channel(
    channel_id: uuid.UUID, body: CrierChannelUpdate, db: DB, user: CurrentUser
) -> CrierChannelRead:
    """Update a channel's label, order, or webhook URL.

    Args:
        channel_id: UUID of the channel.
        body: Partial update.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed channel.
    """
    try:
        return crier_service.update_channel(db, channel_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.delete("/crier/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(channel_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a channel.

    Args:
        channel_id: UUID of the channel.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        crier_service.delete_channel(db, channel_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


# ── NPC identities ────────────────────────────────────────────────────────────


@router.get("/campaigns/{campaign_id}/crier/npcs", response_model=list[CrierNpcRead])
def list_npcs(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[CrierNpcRead]:
    """List the campaign's NPC posting identities.

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The roster, in DM-chosen order.
    """
    try:
        return crier_service.list_npcs(db, campaign_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.post(
    "/campaigns/{campaign_id}/crier/npcs",
    response_model=CrierNpcRead,
    status_code=status.HTTP_201_CREATED,
)
def create_npc(
    campaign_id: uuid.UUID, body: CrierNpcCreate, db: DB, user: CurrentUser
) -> CrierNpcRead:
    """Add an NPC posting identity.

    Args:
        campaign_id: UUID of the campaign.
        body: Name, avatar, colour.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The created identity.
    """
    try:
        return crier_service.create_npc(db, campaign_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.patch("/crier/npcs/{npc_id}", response_model=CrierNpcRead)
def update_npc(npc_id: uuid.UUID, body: CrierNpcUpdate, db: DB, user: CurrentUser) -> CrierNpcRead:
    """Update an NPC identity.

    Args:
        npc_id: UUID of the identity.
        body: Partial update.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed identity.
    """
    try:
        return crier_service.update_npc(db, npc_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.delete("/crier/npcs/{npc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_npc(npc_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete an NPC identity.

    Args:
        npc_id: UUID of the identity.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        crier_service.delete_npc(db, npc_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


# ── Sending ───────────────────────────────────────────────────────────────────


@router.post(
    "/campaigns/{campaign_id}/crier/send",
    response_model=CrierPostRead,
    status_code=status.HTTP_201_CREATED,
)
def send(
    campaign_id: uuid.UUID, body: CrierSendRequest, db: DB, user: CurrentUser
) -> CrierPostRead:
    """Post a message to Discord as an NPC.

    Args:
        campaign_id: UUID of the campaign.
        body: Channel, identity, and message body.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The sent-log row.
    """
    try:
        return crier_service.send(db, campaign_id, user, body)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)


@router.get("/campaigns/{campaign_id}/crier/posts", response_model=list[CrierPostRead])
def list_posts(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[CrierPostRead]:
    """Read the sent-log, newest first.

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Sent-log rows.
    """
    try:
        return crier_service.list_posts(db, campaign_id, user)
    except ValueError as exc:
        raise _http(exc)
    except PermissionError as exc:
        raise _forbidden(exc)
