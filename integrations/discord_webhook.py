"""Discord webhook adapter — posts a message as an NPC identity (Plan 56).

A Discord webhook URL is bound to one channel, but each POST may override
``username`` and ``avatar_url``. That override is what lets a single
webhook speak as any number of NPCs, so the DM creates one webhook per
channel in the Discord UI and never touches it again.

Payload shape (Discord ``POST /api/webhooks/{id}/{token}``)::

    {"content": ..., "username": ..., "avatar_url": ...,
     "embeds": [{"description": ..., "color": 0xRRGGBB}]}

The webhook URL is a bearer credential: anyone holding it can post to that
channel indefinitely. Nothing in this module logs it, and callers pass a
separate human-readable ``channel_label`` for log lines.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0
# Discord returns 429 with a retry_after; one polite retry is plenty for a
# DM posting by hand. Anything beyond that is a real outage, not a burst.
_MAX_RETRY_AFTER = 5.0


def build_payload(
    *,
    username: str,
    avatar_url: Optional[str] = None,
    content: Optional[str] = None,
    embed_description: Optional[str] = None,
    embed_color: Optional[int] = None,
) -> dict[str, Any]:
    """Build the Discord webhook JSON body.

    Empty fields are omitted rather than sent as null — Discord rejects
    an embed whose description is null, and a null content clears nothing.

    Args:
        username: Per-message display name override (the NPC's name).
        avatar_url: Absolute public image URL Discord fetches for the face.
        content: Plain message text, or None.
        embed_description: Rich embed body, or None.
        embed_color: Embed accent bar as 0xRRGGBB, or None.

    Returns:
        A dict ready to POST as JSON.
    """
    payload: dict[str, Any] = {"username": username}
    if avatar_url:
        payload["avatar_url"] = avatar_url
    if content and content.strip():
        payload["content"] = content
    if embed_description and embed_description.strip():
        embed = _parse_embed(embed_description)
        if embed_color is not None and "color" not in embed:
            embed["color"] = embed_color
        payload["embeds"] = [embed]
    return payload


def _parse_embed(text: str) -> dict[str, Any]:
    """Turn the embed field into a Discord embed object.

    Plain prose becomes ``{"description": text}``. A pasted JSON object
    (``{"title": ..., "description": ..., "fields": [...]}``) is used as the
    embed itself, so a prepared notice keeps its title, fields and footer.
    Anything that isn't a JSON object falls back to prose — a notice never
    posts as a wall of braces.

    Args:
        text: The embed field as typed or pasted.

    Returns:
        A Discord embed dict.
    """
    import json

    stripped = text.strip()
    if stripped.startswith("{"):
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict) and parsed:
            allowed = {
                "title",
                "description",
                "url",
                "color",
                "fields",
                "footer",
                "image",
                "thumbnail",
                "author",
            }
            embed = {k: v for k, v in parsed.items() if k in allowed}
            if embed:
                return embed
    return {"description": text}


def post(
    webhook_url: str,
    *,
    username: str,
    avatar_url: Optional[str] = None,
    content: Optional[str] = None,
    embed_description: Optional[str] = None,
    embed_color: Optional[int] = None,
    channel_label: str = "(unlabelled)",
) -> None:
    """Post one message to a Discord channel under an NPC identity.

    Args:
        webhook_url: The channel's webhook URL. NEVER logged.
        username: The NPC's display name for this message.
        avatar_url: Absolute public URL for the NPC's face.
        content: Plain message text.
        embed_description: Rich embed body.
        embed_color: Embed accent bar as 0xRRGGBB.
        channel_label: Human-readable channel name, used only for logging.

    Raises:
        ValueError: If Discord rejects the post or is unreachable. The
            message is safe to surface to the DM — it never contains the URL.
    """
    payload = build_payload(
        username=username,
        avatar_url=avatar_url,
        content=content,
        embed_description=embed_description,
        embed_color=embed_color,
    )

    try:
        with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
            # wait=true makes Discord validate and persist before responding,
            # so a 2xx here means the message really landed in the channel.
            response = client.post(webhook_url, json=payload, params={"wait": "true"})

            if response.status_code == 429:
                retry_after = _parse_retry_after(response)
                if retry_after is not None and retry_after <= _MAX_RETRY_AFTER:
                    logger.warning(
                        "Discord rate-limited the crier on %s; retrying in %.1fs",
                        channel_label,
                        retry_after,
                    )
                    time.sleep(retry_after)
                    response = client.post(webhook_url, json=payload, params={"wait": "true"})

            if response.status_code >= 400:
                raise ValueError(_friendly_error(response))

    except httpx.HTTPError as exc:
        # Deliberately not interpolating the exception's request URL — httpx
        # puts the full URL in some messages, and that URL is the credential.
        raise ValueError(f"Could not reach Discord: {type(exc).__name__}") from exc

    logger.info("Crier posted to %s as %s", channel_label, username)


def _parse_retry_after(response: httpx.Response) -> Optional[float]:
    """Read Discord's retry_after from a 429 body or header.

    Args:
        response: The 429 response.

    Returns:
        Seconds to wait, or None if it could not be parsed.
    """
    try:
        body = response.json()
        if isinstance(body, dict) and "retry_after" in body:
            return float(body["retry_after"])
    except (ValueError, TypeError):
        pass
    header = response.headers.get("Retry-After")
    if header:
        try:
            return float(header)
        except ValueError:
            return None
    return None


def _friendly_error(response: httpx.Response) -> str:
    """Turn a Discord error response into a DM-readable sentence.

    Args:
        response: The failed response.

    Returns:
        An explanation safe to show in the UI and store in the sent-log.
    """
    if response.status_code in (401, 403, 404):
        return (
            "Discord rejected this webhook (it may have been deleted or "
            "regenerated in the channel's settings). Re-copy the webhook URL."
        )
    detail = ""
    try:
        body = response.json()
        if isinstance(body, dict):
            detail = str(body.get("message") or "")
    except ValueError:
        detail = ""
    suffix = f" — {detail}" if detail else ""
    return f"Discord refused the post (HTTP {response.status_code}){suffix}"
