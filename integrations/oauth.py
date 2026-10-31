"""OAuth providers for sign-in (Plan 73): Discord and Patreon.

Env-driven; a provider is "configured" only when its client id + secret are
present, so a personal deployment with neither keeps the trusted-header model
untouched.

Plan 130 (pricing): when ``PATREON_CAMPAIGN_ID`` is set, a Patreon sign-in or
"Link your Patreon" also reads the person's membership of QuestLab's campaign
(``parse_patreon_membership``). That membership is what makes a DM a Patron;
QuestLab never handles payment itself.

Env:
    DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
    PATREON_CLIENT_ID / PATREON_CLIENT_SECRET
    PATREON_CAMPAIGN_ID   QuestLab's own campaign (read via integrations.feature_flags)
    OAUTH_REDIRECT_BASE   e.g. https://questlab-api.onrender.com/api
"""

import os
from dataclasses import dataclass, replace
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from integrations import feature_flags

_DISCORD_AUTH = "https://discord.com/oauth2/authorize"
_DISCORD_TOKEN = "https://discord.com/api/oauth2/token"
_DISCORD_ME = "https://discord.com/api/users/@me"
_PATREON_AUTH = "https://www.patreon.com/oauth2/authorize"
_PATREON_TOKEN = "https://www.patreon.com/api/oauth2/token"
_PATREON_ME = "https://www.patreon.com/api/oauth2/v2/identity"
# Plan 130 — "Link your Patreon" asks to see memberships (no email needed: the
# link attaches to the DM who is already signed in).
_PATREON_LINK_SCOPE = "identity identity.memberships"
# The membership fields Patreon's own WordPress plugin reads, plus the entitled
# tiers (whose amount_cents is the tier's monthly price in the campaign currency).
_PATREON_MEMBER_PARAMS = {
    "include": "memberships.currently_entitled_tiers,memberships.campaign",
    "fields[member]": "patron_status,currently_entitled_amount_cents,pledge_cadence",
    "fields[tier]": "amount_cents,title",
}


@dataclass(frozen=True)
class PatreonMembership:
    """Someone's membership of QuestLab's Patreon campaign, as Patreon reports it (Plan 130).

    Amounts are what Patreon says; ``services.plan_service`` decides what counts.
    """

    # A membership (any status, even a free one) to the campaign exists.
    found: bool = False
    # "active_patron" | "declined_patron" | "former_patron" | None.
    patron_status: Optional[str] = None
    # currently_entitled_amount_cents: per payment cycle, in the patron's currency.
    entitled_cents: int = 0
    # pledge_cadence: months between charges (1 monthly, 12 annual).
    cadence_months: int = 1
    # The highest currently entitled tier's monthly price (campaign currency), 0 if unknown.
    tier_cents: int = 0

    @property
    def active(self) -> bool:
        """Whether Patreon says the membership is paid up right now."""
        return self.found and self.patron_status == "active_patron"


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
    # Plan 130 — Patreon only, and only when PATREON_CAMPAIGN_ID is set: the
    # membership of QuestLab's campaign. None means it wasn't asked for.
    membership: Optional[PatreonMembership] = None


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


def patreon_link_url(state: str) -> str:
    """Build Patreon's authorization URL for "Link your Patreon" (Plan 130).

    Same client and callback as sign-in; the signed ``state`` carries the link
    intent and the signed-in DM. Scope ``identity identity.memberships``.

    Args:
        state: Signed state from ``auth_service.start_patreon_link``.

    Returns:
        The URL to send the browser to.

    Raises:
        ValueError: If Patreon isn't configured.
    """
    if "patreon" not in configured_providers():
        raise ValueError("Patreon isn't set up on this server yet.")
    q = {
        "client_id": _env("PATREON_CLIENT_ID"),
        "response_type": "code",
        "redirect_uri": redirect_uri("patreon"),
        "scope": _PATREON_LINK_SCOPE,
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
        campaign_id = feature_flags.patreon_campaign_id()
        if campaign_id:
            # Plan 130 — the membership rides along on the same identity call.
            params.update(_PATREON_MEMBER_PARAMS)
        me = client.get(_PATREON_ME, params=params, headers={"Authorization": f"Bearer {access}"})
        if me.status_code != 200:
            raise ValueError("Patreon did not return a profile.")
        data = me.json()
    profile = parse_patreon_identity(data)
    if not campaign_id:
        return profile
    return replace(profile, membership=parse_patreon_membership(data, campaign_id))


def parse_patreon_identity(data: dict[str, Any]) -> OAuthProfile:
    """Turn Patreon's identity document into a sign-in profile.

    Pure function so it can be tested without HTTP. Identity only — the
    membership is read separately by ``parse_patreon_membership``.

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


def _as_int(value: Any, default: int = 0) -> int:
    """Patreon sends some numbers as strings; read either, else ``default``."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_patreon_membership(data: dict[str, Any], campaign_id: str) -> PatreonMembership:
    """Find the person's membership of ``campaign_id`` in a Patreon identity document.

    Pure function (no HTTP), tested with fixture JSON. Reads the ``member``
    objects in ``included`` whose ``campaign`` relationship is the campaign,
    and the entitled ``tier`` objects they point at. When there is more than
    one (rare), an active one wins, then the larger amount.

    Args:
        data: The JSON:API identity response (with
            ``include=memberships.currently_entitled_tiers,memberships.campaign``).
        campaign_id: QuestLab's Patreon campaign id.

    Returns:
        A PatreonMembership; ``found`` is False when there is none.
    """
    campaign_id = str(campaign_id or "").strip()
    if not campaign_id:
        return PatreonMembership()
    included = data.get("included") or []
    tiers = {
        str(obj.get("id")): _as_int((obj.get("attributes") or {}).get("amount_cents"))
        for obj in included
        if isinstance(obj, dict) and obj.get("type") == "tier"
    }
    best: Optional[PatreonMembership] = None
    for obj in included:
        if not isinstance(obj, dict) or obj.get("type") != "member":
            continue
        rels = obj.get("relationships") or {}
        camp = ((rels.get("campaign") or {}).get("data")) or {}
        if str(camp.get("id", "")) != campaign_id:
            continue
        attrs = obj.get("attributes") or {}
        tier_refs = ((rels.get("currently_entitled_tiers") or {}).get("data")) or []
        tier_cents = max(
            (tiers.get(str(t.get("id")), 0) for t in tier_refs if isinstance(t, dict)),
            default=0,
        )
        found = PatreonMembership(
            found=True,
            patron_status=attrs.get("patron_status") or None,
            entitled_cents=max(0, _as_int(attrs.get("currently_entitled_amount_cents"))),
            cadence_months=max(1, _as_int(attrs.get("pledge_cadence"), 1)),
            tier_cents=max(0, tier_cents),
        )
        rank = (found.active, found.tier_cents, found.entitled_cents)
        if best is None or rank > (best.active, best.tier_cents, best.entitled_cents):
            best = found
    return best or PatreonMembership()
