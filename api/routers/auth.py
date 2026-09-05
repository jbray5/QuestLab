"""Auth router (Plan 73) — sign in with Discord or Patreon, signed sessions.

Public: ``/auth/providers``, ``/auth/{provider}/start``, ``/auth/{provider}/callback``.
Signed-in: ``/auth/me``, ``/auth/patreon/link``.
"""

import os
import uuid
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from api.deps import DB, CurrentUser
from domain.user import (
    AiPlan,
    AiPlans,
    AuthProviders,
    LoginRequest,
    SessionResponse,
    SignupRequest,
    UserRead,
)
from integrations import oauth
from services import auth_service, entitlement_service

router = APIRouter(tags=["auth"])


def _frontend_origin(request: Request) -> str:
    env = os.environ.get("FRONTEND_ORIGIN", "").strip().rstrip("/")
    if env:
        return env
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    return origin.rstrip("/") or "http://localhost:5173"


@router.get("/auth/providers", response_model=AuthProviders)
def providers() -> AuthProviders:
    """Which sign-in methods and AI policy this deployment runs.

    Returns:
        The provider list, auth mode, Patreon page, and AI gate mode.
    """
    return AuthProviders(
        providers=oauth.configured_providers(),
        password_signup=bool(os.environ.get("APP_SECRET", "").strip()),
        mode=auth_service.auth_mode(),
        patreon_url=os.environ.get("PATREON_URL", "").strip() or None,
        ai_gate=entitlement_service.gate_mode(),
    )


@router.get("/auth/plans", response_model=AiPlans)
def plans() -> AiPlans:
    """The AI tier table (Plan 77) — public, for the paywall and the guide.

    Returns:
        Gate mode, the Patreon page, and every tier with price, allowance and scope.
    """
    return AiPlans(
        gate=entitlement_service.gate_mode(),
        patreon_url=os.environ.get("PATREON_URL", "").strip() or None,
        plans=[AiPlan(**p) for p in entitlement_service.plans()],
    )


@router.get("/auth/{provider}/start")
def start(provider: str) -> RedirectResponse:
    """Redirect the browser to the provider's consent screen.

    Args:
        provider: ``discord`` or ``patreon``.

    Returns:
        A 302 to the provider.
    """
    try:
        return RedirectResponse(auth_service.start(provider), status_code=302)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/auth/{provider}/callback")
def callback(
    provider: str, request: Request, db: DB, code: str = "", state: str = ""
) -> RedirectResponse:
    """Finish sign-in and hand the session token to the frontend.

    The token rides in the URL fragment (never sent to servers) to
    ``/welcome#token=…`` on the frontend origin.

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
        token, user = auth_service.signup(db, body.name, body.email, body.password)
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
    """The signed-in DM's profile and AI entitlement.

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        A UserRead.
    """
    from services.auth_service import me as _me

    admins = {
        e.strip().lower()
        for e in os.environ.get("BOOTSTRAP_ADMIN_EMAILS", "").split(",")
        if e.strip()
    }
    return _me(db, user, is_admin=user in admins)


@router.get("/auth/patreon/link")
def link_patreon(user: CurrentUser) -> RedirectResponse:
    """Attach Patreon membership to the signed-in account.

    Args:
        user: Authenticated DM email.

    Returns:
        A 302 to Patreon's consent screen.
    """
    try:
        return RedirectResponse(auth_service.start("patreon", link_email=user), status_code=302)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/auth/dev-token")
def dev_token(db: DB, user: CurrentUser) -> dict:
    """Mint a session token for the trusted-header identity (header mode only).

    Lets a personal deployment try the token path before flipping
    ``AUTH_MODE=oauth``. Refused in oauth mode.

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        ``{"token": ...}``.
    """
    if auth_service.auth_mode() == "oauth":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not available.")
    from integrations import session_token

    try:
        auth_service.touch_header_user(db, user)
        return {"token": session_token.issue(user), "id": str(uuid.uuid4())}
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
