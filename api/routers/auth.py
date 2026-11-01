"""Auth router (Plan 73) — sign in with Discord or Patreon, signed sessions.

Public: ``/auth/providers``, ``/auth/{provider}/start``, ``/auth/{provider}/callback``.
Signed-in: ``/auth/me``.
"""

import os
import uuid
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse

from api.deps import DB, CurrentUser
from domain.beta import InviteCheck
from domain.user import AuthProviders, LoginRequest, SessionResponse, SignupRequest, UserRead
from integrations import oauth
from services import auth_service, beta_service

router = APIRouter(tags=["auth"])


def _is_dev() -> bool:
    """Whether this is a development or test deployment (never production)."""
    return os.environ.get("ENV", "").strip().lower() in ("development", "dev", "local", "test")


def _frontend_origin(request: Request) -> str:
    env = os.environ.get("FRONTEND_ORIGIN", "").strip().rstrip("/")
    if env:
        return env
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    return origin.rstrip("/") or "http://localhost:5173"


@router.get("/auth/providers", response_model=AuthProviders)
def providers() -> AuthProviders:
    """Which sign-in methods this deployment runs.

    Returns:
        The provider list, auth mode, and Patreon page.
    """
    return AuthProviders(
        providers=oauth.configured_providers(),
        password_signup=bool(os.environ.get("APP_SECRET", "").strip()),
        mode=auth_service.auth_mode(),
        patreon_url=os.environ.get("PATREON_URL", "").strip() or None,
        invites_required=beta_service.invites_required(),
    )


@router.get("/auth/invites/{code}", response_model=InviteCheck)
def check_invite(code: str, db: DB) -> InviteCheck:
    """Is this friends-beta invite usable, and who is it for? (Public, Plan 125.)

    Args:
        code: The invite code from the link.
        db: Database session.

    Returns:
        ``{valid, label}``.
    """
    return beta_service.check_invite(db, code[:40])


@router.get("/auth/{provider}/start")
def start(
    provider: str, invite: Optional[str] = Query(default=None, max_length=40)
) -> RedirectResponse:
    """Redirect the browser to the provider's consent screen.

    Args:
        provider: ``discord`` or ``patreon``.
        invite: A friends-beta invite code for a first sign-in (Plan 125).

    Returns:
        A 302 to the provider.
    """
    try:
        return RedirectResponse(auth_service.start(provider, invite), status_code=302)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/auth/{provider}/callback")
def callback(
    provider: str, request: Request, db: DB, code: str = "", state: str = ""
) -> RedirectResponse:
    """Finish sign-in and hand the session token to the frontend.

    The token rides in the URL fragment (never sent to servers) to
    ``/welcome#token=…`` on the frontend origin.

    Plan 130 — a "Link your Patreon" state lands on ``/plan`` instead: the
    signed link result rides in the fragment (``/plan#patreon=…``) for the
    plan page to confirm with the DM's own session; an error rides in
    ``/plan?patreon_error=…``. No session token is issued for a link.

    Args:
        provider: ``discord`` or ``patreon``.
        request: The incoming request (for the frontend origin).
        db: Database session.
        code: Authorization code.
        state: Signed CSRF state.

    Returns:
        A 302 to the frontend.
    """
    front = _frontend_origin(request)
    if provider == "patreon" and state and auth_service.state_intent(state) == "link":
        if not code:
            msg = "Linking your Patreon was cancelled."
            return RedirectResponse(f"{front}/plan?{urlencode({'patreon_error': msg})}", 302)
        try:
            result = auth_service.complete_patreon_link(db, code, state)
        except (ValueError, RuntimeError) as exc:
            return RedirectResponse(f"{front}/plan?{urlencode({'patreon_error': str(exc)})}", 302)
        return RedirectResponse(f"{front}/plan#{urlencode({'patreon': result})}", 302)
    if not code or not state:
        return RedirectResponse(
            f"{front}/welcome?{urlencode({'error': 'Sign-in was cancelled.'})}", 302
        )
    try:
        token, _user = auth_service.complete(db, provider, code, state)
    except ValueError as exc:
        return RedirectResponse(f"{front}/welcome?{urlencode({'error': str(exc)})}", 302)
    return RedirectResponse(f"{front}/welcome#token={token}", 302)


@router.post("/auth/signup", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, db: DB) -> SessionResponse:
    """Create a name + email + password account and return a session (Plan 73b).

    Args:
        body: Name, email, password.
        db: Database session.

    Returns:
        The session token and profile.
    """
    try:
        token, user = auth_service.signup(
            db, body.name, body.email, body.password, body.claim_code, body.invite_code
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return SessionResponse(token=token, user=auth_service.me(db, user.email))


@router.post("/auth/login", response_model=SessionResponse)
def login(body: LoginRequest, db: DB) -> SessionResponse:
    """Sign in with email + password (Plan 73b).

    Args:
        body: Email and password.
        db: Database session.

    Returns:
        The session token and profile.
    """
    try:
        token, user = auth_service.login(db, body.email, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return SessionResponse(token=token, user=auth_service.me(db, user.email))


@router.get("/auth/me", response_model=UserRead)
def me(db: DB, user: CurrentUser) -> UserRead:
    """The signed-in DM's profile.

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        A UserRead.
    """
    return auth_service.me(db, user)


@router.get("/auth/dev-token")
def dev_token(db: DB, user: CurrentUser) -> dict:
    """Mint a session token for the trusted-header identity (local development only).

    Plan 120 — on a public header-mode deployment the header is whatever the
    caller says it is, so this minted a 30-day token for any email, and the
    token outlived the switch to oauth. Development and tests only now.

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        ``{"token": ...}``.
    """
    if auth_service.auth_mode() == "oauth" or not _is_dev():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not available.")
    from integrations import session_token

    try:
        auth_service.touch_header_user(db, user)
        return {"token": session_token.issue(user), "id": str(uuid.uuid4())}
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
