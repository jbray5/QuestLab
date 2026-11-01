"""Sign-in and account service (Plan 73).

Flow: ``start`` mints a signed CSRF state and returns the provider URL;
``complete`` verifies the state, exchanges the code, upserts the user,
and issues a session token. Email is the identity everything else keys on.

Plan 130 — "Link your Patreon" for a signed-in DM: ``start_patreon_link``
signs a state carrying the link intent and that DM's email;
``complete_patreon_link`` (the callback) reads the Patreon identity and
membership and returns a short-lived signed result; ``confirm_patreon_link``
attaches it, only for the same signed-in DM who started it.
"""

import hmac
import os
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.campaign_repo import CampaignRepo
from db.repos.user_repo import UserRepo
from domain.plan import PatreonLinkResult
from domain.user import User, UserRead
from integrations import oauth, session_token
from integrations.identity import get_current_user_email as _get_email
from services import beta_service, plan_service

_STATE_TTL = 10 * 60
# Plan 130 — the callback's signed link result lives only as long as a sign-in state.
_LINK_KIND = "patreon_link"
_LINK_INTENT = "link"


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


def _admin_emails() -> set[str]:
    """The deployment's bootstrap admins as a lowercased set (BOOTSTRAP_ADMIN_EMAILS)."""
    return set(get_bootstrap_admins())


def personal_content_allowed(email: str) -> bool:
    """Whether ``email`` may receive non-SRD (personal-license) content, e.g. PHB subclass text.

    Only the deployment's admins — the DM whose own books those are. Everyone
    else gets the SRD 5.2.1 catalog.

    Args:
        email: The DM's email (case-insensitive).

    Returns:
        True for a bootstrap admin, else False.
    """
    return email.strip().lower() in _admin_emails()


def require_admin(email: str) -> None:
    """Raise PermissionError if the email is not an admin.

    Args:
        email: Email to check.

    Raises:
        PermissionError: If the user is not an admin.
    """
    if not is_admin(email):
        raise PermissionError(f"Admin access required. '{email}' is not an admin.")


# ── SEC-003: the shared catalog (monsters, items, spells) ──


def can_edit_catalog(owner_email: Optional[str], email: str) -> bool:
    """True when ``email`` may change a catalog row owned by ``owner_email``.

    Admins may change anything. A DM may change only the homebrew rows they
    created; the shared SRD rows (no owner) are admin-only, so one DM's edit
    can never rewrite another table's monster, item or spell.

    Args:
        owner_email: The row's author, or None for the shared catalog.
        email: The requesting DM.

    Returns:
        Whether the edit is allowed.
    """
    if is_admin(email):
        return True
    return bool(owner_email) and owner_email.strip().lower() == email.strip().lower()


def require_catalog_editor(owner_email: Optional[str], email: str) -> None:
    """Raise PermissionError unless ``email`` may change this catalog row.

    Args:
        owner_email: The row's author, or None for the shared catalog.
        email: The requesting DM.

    Raises:
        PermissionError: If the DM neither owns the row nor is an admin.
    """
    if not can_edit_catalog(owner_email, email):
        if owner_email:
            raise PermissionError("Only the DM who made this homebrew entry can change it.")
        raise PermissionError("The shared rules catalog can only be changed by an admin.")


def catalog_visible(owner_email: Optional[str], email: Optional[str]) -> bool:
    """True when a catalog row shows in ``email``'s lists: shared rows and their own homebrew.

    Args:
        owner_email: The row's author, or None for the shared catalog.
        email: The viewing DM, or None for an unscoped (internal) list.

    Returns:
        Whether the row is listed.
    """
    if not owner_email or email is None:
        return True
    return owner_email.strip().lower() == email.strip().lower()


# ── Plan 73: OAuth sign-in ──


def auth_mode() -> str:
    """``oauth`` when the deployment requires signed sessions, else ``header``."""
    mode = os.environ.get("AUTH_MODE", "header").strip().lower()
    return "oauth" if mode == "oauth" else "header"


def start(provider: str, invite: Optional[str] = None) -> str:
    """Begin a sign-in.

    Args:
        provider: ``discord`` or ``patreon``.
        invite: A friends-beta invite code (Plan 125); it rides in the signed
            state so a first sign-in can start an account with it.

    Returns:
        The provider authorization URL.

    Raises:
        ValueError: If the provider isn't configured.
    """
    extra = {"provider": provider}
    if invite:
        extra["invite"] = invite.strip()[:40]
    state = session_token.issue(
        "anon",
        kind="state",
        ttl_seconds=_STATE_TTL,
        extra=extra,
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

    user = UserRepo.get_by_provider(db, provider, profile.provider_id)
    if user is None:
        if not profile.email:
            raise ValueError(
                f"{provider.title()} did not share an email address — QuestLab needs one "
                "to keep your campaigns yours."
            )
        # Plan 120 — an address the provider hasn't verified proves nothing:
        # it must never attach to (or start) the account that owns it.
        if not profile.email_verified:
            raise ValueError(
                f"{provider.title()} hasn't verified your email address yet. Verify it "
                f"with {provider.title()}, then sign in again."
            )
        user = UserRepo.get_by_email(db, profile.email)
    if user is None:
        email = str(profile.email).strip().lower()
        user = User(email=email)
        # Plan 125 — a brand-new DM needs a friends-beta invite (an email that
        # already owns campaigns is an existing DM, not a new one).
        if not CampaignRepo.list_by_dm(db, email):
            user.invite_code = beta_service.gate_new_account(db, email, claims.get("invite"))

    if profile.provider == "discord":
        user.discord_id = profile.provider_id
    else:
        user.patreon_id = profile.provider_id
        # Plan 130 — every Patreon sign-in refreshes the membership.
        plan_service.apply_membership(user, profile.membership)
    if not user.display_name:
        user.display_name = profile.display_name
    if profile.avatar_url and not user.avatar_url:
        user.avatar_url = profile.avatar_url
    user = UserRepo.save(db, user)
    return session_token.issue(user.email), user


# ── Plan 130: link a Patreon account to the signed-in DM ──


def start_patreon_link(email: str) -> str:
    """Begin "Link your Patreon" for a signed-in DM.

    The signed state names this DM and the link intent, so the callback can
    only ever attach the Patreon account to them.

    Args:
        email: The signed-in DM.

    Returns:
        Patreon's authorization URL (scope ``identity identity.memberships``).

    Raises:
        ValueError: If Patreon isn't configured.
        RuntimeError: If APP_SECRET is missing (no signed state possible).
    """
    if "patreon" not in oauth.configured_providers():
        raise ValueError("Patreon isn't set up on this server yet.")
    state = session_token.issue(
        email,
        kind="state",
        ttl_seconds=_STATE_TTL,
        extra={"provider": "patreon", "intent": _LINK_INTENT},
    )
    return oauth.patreon_link_url(state)


def state_intent(state: str) -> str:
    """Whether a callback's state is a sign-in or a Patreon link.

    Args:
        state: The signed state from the callback.

    Returns:
        ``"link"`` for a valid link state, else ``"signin"`` (which ``complete``
        then verifies on its own).
    """
    claims = session_token.verify(state, kind="state")
    if claims is not None and claims.get("intent") == _LINK_INTENT:
        return _LINK_INTENT
    return "signin"


def _refuse_if_linked_elsewhere(db: DBSession, patreon_id: str, email: str) -> None:
    """Refuse to link a Patreon account that already belongs to another QuestLab account."""
    other = UserRepo.get_by_provider(db, "patreon", patreon_id)
    if other is not None and other.email != email.strip().lower():
        raise ValueError(
            "That Patreon account is already linked to another QuestLab account. "
            "Sign in with Patreon to use that account, or link a different Patreon."
        )


def complete_patreon_link(db: DBSession, code: str, state: str) -> str:
    """Finish the Patreon side of a link: read the identity and membership.

    Nothing is attached yet. The result is signed for the DM named in the state
    and handed to the plan page, which confirms it with that DM's own session
    (so a link started by one person can't be finished in someone else's browser).

    Args:
        db: Active database session.
        code: Authorization code from the callback.
        state: The signed link state.

    Returns:
        A short-lived signed link result for ``confirm_patreon_link``.

    Raises:
        ValueError: On a bad or expired state, a failed exchange, or a Patreon
            account already linked to someone else.
    """
    claims = session_token.verify(state, kind="state")
    if (
        claims is None
        or claims.get("intent") != _LINK_INTENT
        or claims.get("provider") != "patreon"
    ):
        raise ValueError("That Patreon link expired or was tampered with. Try again.")
    email = str(claims["sub"])
    profile = oauth.exchange_code("patreon", code)
    if not profile.provider_id:
        raise ValueError("Patreon did not say who you are. Try again.")
    _refuse_if_linked_elsewhere(db, profile.provider_id, email)
    extra: dict = {"patreon_id": profile.provider_id, "asked": profile.membership is not None}
    m = profile.membership
    if m is not None:
        extra.update(
            found=m.found,
            status=m.patron_status or "",
            entitled=m.entitled_cents,
            cadence=m.cadence_months,
            tier=m.tier_cents,
        )
    return session_token.issue(email, kind=_LINK_KIND, ttl_seconds=_STATE_TTL, extra=extra)


def _link_message(status_counts: bool, membership: Optional[oauth.PatreonMembership]) -> str:
    """The sentence the plan page shows after a link."""
    if status_counts:
        return "Your Patreon is linked. Thank you for being a Patron."
    if membership is None:
        return "Your Patreon is linked."
    if not membership.found:
        return (
            "Your Patreon is linked, but it has no QuestLab membership yet. "
            "Join on Patreon, then check again."
        )
    if not membership.active:
        return (
            "Your Patreon is linked, but the membership isn't active. "
            "Check it on Patreon, then check again."
        )
    return (
        "Your Patreon is linked, but the membership is below the Patron tier "
        f"({plan_service.PRICE_MONTHLY} or {plan_service.PRICE_YEARLY})."
    )


def confirm_patreon_link(db: DBSession, email: str, token: str) -> PatreonLinkResult:
    """Attach a finished Patreon link to the signed-in DM who started it.

    Args:
        db: Active database session.
        email: The signed-in DM (from their session, not from the token).
        token: The signed result from ``complete_patreon_link``.

    Returns:
        A sentence saying what happened, and the plan afterwards.

    Raises:
        ValueError: If the result is invalid or expired, or the Patreon account
            is linked to another QuestLab account.
        PermissionError: If a different DM started this link.
    """
    claims = session_token.verify(token, kind=_LINK_KIND)
    if claims is None or not claims.get("patreon_id"):
        raise ValueError("That Patreon link expired. Try linking again.")
    email = email.strip().lower()
    if str(claims["sub"]).strip().lower() != email:
        raise PermissionError(
            "That Patreon link was started from a different QuestLab account. "
            "Sign in as that account, or start the link again here."
        )
    patreon_id = str(claims["patreon_id"])
    _refuse_if_linked_elsewhere(db, patreon_id, email)
    user = UserRepo.get_by_email(db, email) or User(email=email)
    user.patreon_id = patreon_id
    membership = None
    if claims.get("asked"):
        membership = oauth.PatreonMembership(
            found=bool(claims.get("found")),
            patron_status=claims.get("status") or None,
            entitled_cents=int(claims.get("entitled") or 0),
            cadence_months=int(claims.get("cadence") or 1),
            tier_cents=int(claims.get("tier") or 0),
        )
    plan_service.apply_membership(user, membership)
    UserRepo.save(db, user)
    status = plan_service.status(db, email)
    return PatreonLinkResult(
        message=_link_message(status.patreon_counts, membership), status=status
    )


def _require_claim_code(claim_code: Optional[str]) -> None:
    """Refuse unless ``claim_code`` matches the server's ACCOUNT_CLAIM_CODE (Plan 120).

    Campaigns key on the DM's email. Before accounts, anyone could type an
    email and be that DM, so an email that already owns campaigns (or a
    passwordless user row) carries no proof of who it belongs to. There is no
    email sender to verify with, so the owner proves it with a code only the
    server operator knows, set on Render for the switch-over and removed after.

    Args:
        claim_code: What the person typed, if anything.

    Raises:
        ValueError: If no claim code is configured or it doesn't match.
    """
    expected = os.environ.get("ACCOUNT_CLAIM_CODE", "").strip()
    given = (claim_code or "").strip()
    if not expected or not given or not hmac.compare_digest(given, expected):
        raise ValueError(
            "That email already has campaigns here. To claim them, enter the claim code "
            "from the server's settings."
        )


def signup(
    db: DBSession,
    name: str,
    email: str,
    password: str,
    claim_code: Optional[str] = None,
    invite_code: Optional[str] = None,
) -> tuple[str, User]:
    """Create an email + password account and sign it in (Plan 73b).

    Args:
        db: Active database session.
        name: Display name.
        email: Email (the identity key).
        password: Plaintext password (hashed with scrypt before storage).
        claim_code: The server's ACCOUNT_CLAIM_CODE — needed only when the email
            already owns campaigns or a passwordless account (Plan 120).
        invite_code: A friends-beta invite — needed for a brand-new account
            while ``BETA_INVITES=required`` (Plan 125).

    Returns:
        ``(session_token, user)``.

    Raises:
        ValueError: If the email is taken (with a password), already owns data
            and the claim code is missing or wrong, a needed invite is missing
            or spent, or the password is weak.
    """
    from integrations import passwords

    email = email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise ValueError("That doesn't look like an email address.")
    user = UserRepo.get_by_email(db, email)
    if user is not None and user.password_hash:
        raise ValueError("An account with that email already exists — sign in instead.")
    if user is not None or CampaignRepo.list_by_dm(db, email):
        # Plan 120 — first come must not be first served for someone else's campaigns.
        _require_claim_code(claim_code)
    new_account = user is None and not CampaignRepo.list_by_dm(db, email)
    if user is None:
        user = User(email=email)
    user.display_name = name.strip()[:120] or user.display_name
    user.password_hash = passwords.hash_password(password)
    if new_account:
        # Plan 125 — checked last, so a bad email or password never spends a use.
        user.invite_code = beta_service.gate_new_account(db, email, invite_code)
    user = UserRepo.save(db, user)
    return session_token.issue(user.email), user


def login(db: DBSession, email: str, password: str) -> tuple[str, User]:
    """Sign in with email + password (Plan 73b).

    Args:
        db: Active database session.
        email: Email.
        password: Plaintext password.

    Returns:
        ``(session_token, user)``.

    Raises:
        ValueError: On unknown email, no password set, or a wrong password
            (one message for all three — no account enumeration).
    """
    from integrations import passwords

    user = UserRepo.get_by_email(db, email.strip().lower())
    if (
        user is None
        or not user.password_hash
        or not passwords.verify_password(password, user.password_hash)
    ):
        raise ValueError("Email or password didn't match.")
    user = UserRepo.save(db, user)  # bumps last_seen_at
    return session_token.issue(user.email), user


def touch_header_user(db: DBSession, email: str) -> None:
    """Ensure a users row exists for a trusted-header identity (best effort).

    Args:
        db: Active database session.
        email: The email from the trusted header.
    """
    if UserRepo.get_by_email(db, email) is None:
        UserRepo.save(db, User(email=email.strip().lower()))


def me(db: DBSession, email: str) -> UserRead:
    """Profile summary for the signed-in DM.

    The admin flag comes from BOOTSTRAP_ADMIN_EMAILS here, so every route that
    returns a profile (sign-up, password sign-in, /auth/me) agrees on it.

    Args:
        db: Active database session.
        email: The DM's email.

    Returns:
        A UserRead.
    """
    user = UserRepo.get_by_email(db, email)
    return UserRead(
        email=email,
        display_name=(user.display_name if user else "") or email.split("@")[0],
        avatar_url=user.avatar_url if user else None,
        discord_linked=bool(user and user.discord_id),
        patreon_linked=bool(user and user.patreon_id),
        is_admin=is_admin(email),
    )
