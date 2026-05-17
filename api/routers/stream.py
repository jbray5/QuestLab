"""Server-Sent Events streams for live sync (Plan 00026).

Two endpoints:
  GET /api/stream/pc/{pc_id}            — events scoped to one PC
  GET /api/stream/campaign/{campaign_id} — events for any PC in a campaign

Both are long-lived HTTP responses with ``Content-Type: text/event-stream``.
Clients use the browser's ``EventSource`` API to receive pushes; reconnection
+ backoff are handled by the browser automatically.

Wire format:
    event: pc.updated
    data: {"type":"pc.updated","pc_id":"...","campaign_id":"..."}

A ``: heartbeat`` line is sent every 15s of idle so Render/Cloudflare don't
close the connection.

Auth model: same as Plan 25 — the PC UUID is the implicit secret. Anyone
with a PC UUID can subscribe to its event stream. A leak only exposes
that one PC's events (no DM/cross-PC info).
"""

from __future__ import annotations

import asyncio
import json
import queue
import uuid

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from integrations.event_bus import event_bus

router = APIRouter(tags=["stream"])

# Idle interval between heartbeat keepalives (seconds). Below Cloudflare's
# default 100s idle timeout and Render's similar limit.
_HEARTBEAT_SECONDS = 15.0

# Polling cadence when no events are pending. Low enough to feel snappy,
# high enough to keep CPU near zero.
_POLL_SECONDS = 0.25


def _format_sse(event: dict) -> str:
    """Format an event dict as one SSE message (event name + JSON data)."""
    name = event.get("type", "message")
    return f"event: {name}\ndata: {json.dumps(event)}\n\n"


async def _stream(topics: list[str]):
    """Yield SSE-formatted lines from the bus until the client disconnects.

    Args:
        topics: List of topic strings to subscribe to.

    Yields:
        UTF-8 strings ready to write to an SSE response.
    """
    q = event_bus.subscribe(topics)
    last_heartbeat = asyncio.get_event_loop().time()
    try:
        # Initial comment makes some intermediaries flush headers.
        yield ": connected\n\n"
        while True:
            try:
                event = q.get_nowait()
                yield _format_sse(event)
                last_heartbeat = asyncio.get_event_loop().time()
            except queue.Empty:
                now = asyncio.get_event_loop().time()
                if now - last_heartbeat >= _HEARTBEAT_SECONDS:
                    yield ": heartbeat\n\n"
                    last_heartbeat = now
                await asyncio.sleep(_POLL_SECONDS)
    finally:
        event_bus.unsubscribe(topics, q)


@router.get("/stream/pc/{pc_id}")
async def stream_pc(pc_id: uuid.UUID):
    """SSE stream for events scoped to a single PC.

    Args:
        pc_id: UUID of the player character.

    Returns:
        StreamingResponse with ``text/event-stream`` media type.
    """
    return StreamingResponse(
        _stream([f"pc:{pc_id}"]),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/stream/campaign/{campaign_id}")
async def stream_campaign(campaign_id: uuid.UUID):
    """SSE stream for events scoped to a campaign (the DM HUD).

    Receives events for any PC in the campaign plus campaign-level events
    like ``session.combat.updated``.

    Args:
        campaign_id: UUID of the campaign.

    Returns:
        StreamingResponse with ``text/event-stream`` media type.
    """
    return StreamingResponse(
        _stream([f"campaign:{campaign_id}"]),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
