"""OAuth providers for sign-in (Plan 73): Discord and Patreon, identity only.

Env-driven; a provider is "configured" only when its client id + secret are
present, so a personal deployment with neither keeps the trusted-header model
untouched. (Patreon membership — the tier data that fed the AI quotas — is no
longer requested; Plan 124 removed generative AI.)

Env:
    DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
    PATREON_CLIENT_ID / PATREON_CLIENT_SECRET
    OAUTH_REDIRECT_BASE   e.g. https://questlab-api.onrender.com/api
"""

import os
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

_DISCORD_AUTH = "https://discord.com/oauth2/authorize"
_DISCORD_TOKEN = "https://discord.com/api/oauth2/token"
_DISCORD_ME = "https://discord.com/api/users/@me"
_PATREON_AUTH = "https://www.patreon.com/oauth2/authorize"
_PATREON_TOKEN = "https://www.patreon.com/api/oauth2/token"
_PATREON_ME = "https://www.patreon.com/api/oauth2/v2/identity"


@dataclass(frozen=True)
class OAuthProfile:
    """What a provider tells us about the person who just signed in."""

    provider: str
    provider_id: str
    email: Optional[str]
    display_name: str
    avatar_url: Optional[str]
    # Plan 120 — whether the provider vouches that this person owns ``email``.
    # An unverified address proves nothing, so it never claims an account.
    email_verified: bool = False


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def configured_providers() -> list[str]:
    """Providers with a client id + secret present, in display order."""
    out: list[str] = []
    if _env("DISCORD_CLIENT_ID") and _env("DISCORD_CLIENT_SECRET"):
        out.append("discord")
    if _env("PATREON_CLIENT_ID") and _env("PATREON_CLIENT_SECRET"):
        out.append("patreon")
    return out


def redirect_uri(provider: str) -> str:
    """The callback URL registered with the provider."""
    base = _env("OAUTH_REDIRECT_BASE").rstrip("/")
    return f"{base}/auth/{provider}/callback"


def authorize_url(provider: str, state: str) -> str:
    """Build the provider's authorization URL for a login/link.

    Args:
        provider: ``discord`` or ``patreon``.
        state: Signed CSRF state (see session_token.issue kind=state).

    Returns:
        The URL to redirect the browser to.

    Raises:
        ValueError: If the provider is unknown or not configured.
    """
    if provider not in configured_providers():
        raise ValueError(f"Sign-in with {provider} is not configured.")
    if provider == "discord":
        q = {
            "client_id": _env("DISCORD_CLIENT_ID"),
            "response_type": "code",
            "redirect_uri": redirect_uri(provider),
            "scope": "identify email",
            "state": state,
            "prompt": "none",
        }
        return f"{_DISCORD_AUTH}?{urlencode(q)}"
    q = {
        "client_id": _env("PATREON_CLIENT_ID"),
        "response_type": "code",
        "redirect_uri": redirect_uri(provider),
        "scope": "identity identity[email]",
        "state": state,
    }
    return f"{_PATREON_AUTH}?{urlencode(q)}"


def exchange_code(provider: str, code: str, *, timeout: float = 20.0) -> OAuthProfile:
    """Trade an authorization code for the signed-in profile.

    Args:
        provider: ``discord`` or ``patreon``.
        code: The ``code`` query param from the callback.
        timeout: HTTP timeout per call.

    Returns:
        An OAuthProfile.

    Raises:
        ValueError: If the provider is unknown/unconfigured or the exchange fails.
    """
    if provider not in configured_providers():
        raise ValueError(f"Sign-in with {provider} is not configured.")
    if provider == "discord":
        return _discord(code, timeout)
    return _patreon(code, timeout)


def _discord(code: str, timeout: float) -> OAuthProfile:
    with httpx.Client(timeout=timeout) as client:
        tok = client.post(
            _DISCORD_TOKEN,
            data={
                "client_id": _env("DISCORD_CLIENT_ID"),
                "client_secret": _env("DISCORD_CLIENT_SECRET"),
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri("discord"),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if tok.status_code != 200:
            raise ValueError("Discord rejected the sign-in code.")
        access = tok.json().get("access_token")
        me = client.get(_DISCORD_ME, headers={"Authorization": f"Bearer {access}"})
        if me.status_code != 200:
            raise ValueError("Discord did not return a profile.")
        u = me.json()
    avatar = None
    if u.get("avatar"):
        avatar = f"https://cdn.discordapp.com/avatars/{u['id']}/{u['avatar']}.png"
    return OAuthProfile(
        provider="discord",
        provider_id=str(u["id"]),
        email=(u.get("email") or None),
        display_name=u.get("global_name") or u.get("username") or "Dungeon Master",
        avatar_url=avatar,
        email_verified=bool(u.get("verified")),
    )


def _patreon(code: str, timeout: float) -> OAuthProfile:
    with httpx.Client(timeout=timeout) as client:
        tok = client.post(
            _PATREON_TOKEN,
            data={
                "client_id": _env("PATREON_CLIENT_ID"),
                "client_secret": _env("PATREON_CLIENT_SECRET"),
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri("patreon"),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if tok.status_code != 200:
            raise ValueError("Patreon rejected the sign-in code.")
        access = tok.json().get("access_token")
        params = {"fields[user]": "email,full_name,image_url,is_email_verified"}
        me = client.get(_PATREON_ME, params=params, headers={"Authorization": f"Bearer {access}"})
        if me.status_code != 200:
            raise ValueError("Patreon did not return a profile.")
        data = me.json()
    return parse_patreon_identity(data)


def parse_patreon_identity(data: dict[str, Any]) -> OAuthProfile:
    """Turn Patreon's identity document into a sign-in profile.

    Pure function so it can be tested without HTTP. Identity only — any
    membership data in the document is ignored.

    Args:
        data: The JSON:API identity response.

    Returns:
        An OAuthProfile.
    """
    user = data.get("data") or {}
    attrs = user.get("attributes") or {}
    return OAuthProfile(
        provider="patreon",
        provider_id=str(user.get("id", "")),
        email=(attrs.get("email") or None),
        display_name=attrs.get("full_name") or "Dungeon Master",
        avatar_url=attrs.get("image_url"),
        email_verified=bool(attrs.get("is_email_verified")),
    )
