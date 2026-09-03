"""Sign-in and account service (Plan 73).

Flow: ``start`` mints a signed CSRF state and returns the provider URL;
``complete`` verifies the state, exchanges the code, upserts the user,
and issues a session token. ``link_patreon`` attaches membership to an
existing account. Email is the identity everything else keys on.
"""

import os
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.user_repo import UserRepo
from domain.user import User, UserRead
from integrations import oauth, session_token
from integrations.identity import get_current_user_email as _get_email
from services import entitlement_service

_STATE_TTL = 10 * 60


# ── Legacy identity + admin helpers (unchanged; admin router + pages use these) ──


def get_current_user_email() -> str:
    """Return the authenticated DM email for the current request.

    Delegates to integrations.identity, which reads the trusted header in
    production or falls back to CURRENT_USER_EMAIL in development.

    Returns:
        Lowercased, stripped email string.

    Raises:
        PermissionError: If no identity can be resolved (fail-closed).
    """
    return _get_email()


def get_bootstrap_admins() -> list[str]:
    """Return the list of bootstrap admin emails from environment config.

    Returns:
        Normalised list of admin email strings.
    """
    raw = os.environ.get("BOOTSTRAP_ADMIN_EMAILS", "")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def is_admin(email: str) -> bool:
    """Return True if the email belongs to a bootstrap admin.

    Args:
        email: Email to check (case-insensitive).

    Returns:
        True if admin, False otherwise.
    """
    return email.strip().lower() in get_bootstrap_admins()


def require_admin(email: str) -> None:
    """Raise PermissionError if the email is not an admin.

    Args:
        email: Email to check.

    Raises:
        PermissionError: If the user is not an admin.
    """
    if not is_admin(email):
        raise PermissionError(f"Admin access required. '{email}' is not an admin.")


# ── Plan 73: OAuth sign-in ──


def auth_mode() -> str:
    """``oauth`` when the deployment requires signed sessions, else ``header``."""
    mode = os.environ.get("AUTH_MODE", "header").strip().lower()
    return "oauth" if mode == "oauth" else "header"


def start(provider: str, *, link_email: Optional[str] = None) -> str:
    """Begin a sign-in (or a Patreon link for a signed-in DM).

    Args:
        provider: ``discord`` or ``patreon``.
        link_email: When set, the flow links the provider to this account.

    Returns:
        The provider authorization URL.

    Raises:
        ValueError: If the provider isn't configured.
    """
    state = session_token.issue(
        link_email or "anon",
        kind="state",
        ttl_seconds=_STATE_TTL,
        extra={"provider": provider, "link": bool(link_email)},
    )
    return oauth.authorize_url(provider, state)


def complete(db: DBSession, provider: str, code: str, state: str) -> tuple[str, User]:
    """Finish a sign-in: verify state, exchange the code, upsert, issue a token.

    Args:
        db: Active database session.
        provider: ``discord`` or ``patreon``.
        code: Authorization code from the callback.
        state: The signed state from the callback.

    Returns:
        ``(session_token, user)``.

    Raises:
        ValueError: On a bad/expired state, provider mismatch, or exchange failure.
    """
    claims = session_token.verify(state, kind="state")
    if claims is None or claims.get("provider") != provider:
        raise ValueError("That sign-in link expired or was tampered with. Try again.")
    profile = oauth.exchange_code(provider, code)

    if claims.get("link") and claims.get("sub") not in (None, "anon"):
        user = UserRepo.get_by_email(db, str(claims["sub"]))
        if user is None:
            raise ValueError("Account not found for link.")
    else:
        user = UserRepo.get_by_provider(db, provider, profile.provider_id)
        if user is None and profile.email:
            user = UserRepo.get_by_email(db, profile.email)
        if user is None:
            if not profile.email:
                raise ValueError(
                    f"{provider.title()} did not share an email address — QuestLab needs one "
                    "to keep your campaigns yours."
                )
            user = User(email=profile.email.strip().lower())

    if profile.provider == "discord":
        user.discord_id = profile.provider_id
    else:
        user.patreon_id = profile.provider_id
        user.patron_active = profile.patron_active
        user.patron_tier_cents = profile.patron_tier_cents
        user.patron_checked_at = datetime.now(UTC)
    if not user.display_name:
        user.display_name = profile.display_name
    if profile.avatar_url and not user.avatar_url:
        user.avatar_url = profile.avatar_url
    user = UserRepo.save(db, user)
    return session_token.issue(user.email), user


def touch_header_user(db: DBSession, email: str) -> None:
    """Ensure a users row exists for a trusted-header identity (best effort).

    Args:
        db: Active database session.
        email: The email from the trusted header.
    """
    if UserRepo.get_by_email(db, email) is None:
        UserRepo.save(db, User(email=email.strip().lower()))


def me(db: DBSession, email: str, *, is_admin: bool = False) -> UserRead:
    """Profile + entitlement summary for the signed-in DM.

    Args:
        db: Active database session.
        email: The DM's email.
        is_admin: Whether the caller is an admin.

    Returns:
        A UserRead.
    """
    user = UserRepo.get_by_email(db, email)
    ent = entitlement_service.check_ai(db, email)
    return UserRead(
        email=email,
        display_name=(user.display_name if user else "") or email.split("@")[0],
        avatar_url=user.avatar_url if user else None,
        discord_linked=bool(user and user.discord_id),
        patreon_linked=bool(user and user.patreon_id),
        patron_active=bool(user and user.patron_active),
        is_admin=is_admin,
        ai_allowed=ent.allowed,
        ai_reason=ent.reason,
        ai_remaining_today=ent.remaining_today,
    )
