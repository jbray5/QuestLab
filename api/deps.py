"""Shared FastAPI dependencies — database session and authenticated user.

Inject these via FastAPI's Depends() mechanism:

    @router.get("/campaigns")
    def list_campaigns(db: DB, user: CurrentUser):
        ...
"""

import os
from typing import Annotated, Generator

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from db.base import get_engine


def get_db() -> Generator[Session, None, None]:
    """Yield a SQLModel database session, closing it after the request.

    Yields:
        Active SQLModel Session bound to the configured engine.
    """
    engine = get_engine()
    with Session(engine) as session:
        yield session


DB = Annotated[Session, Depends(get_db)]


def current_user(request: Request) -> str:
    """Resolve the authenticated user's email from the trusted identity header.

    In production, Azure Front Door injects the header named by AUTH_EMAIL_HEADER
    (default: X-MS-CLIENT-PRINCIPAL-NAME).
    In local development, falls back to CURRENT_USER_EMAIL env var.

    Args:
        request: The incoming HTTP request (used to read the configured header).

    Returns:
        Lowercased, stripped email string.

    Raises:
        HTTPException 401: If no identity can be resolved.
    """
    # Plan 54 — public demo deployments pin EVERY visitor to one shared
    # demo identity, ignoring the client header entirely. The demo runs on
    # its own service + database, so this identity can only ever touch
    # demo data (and the AI kill switch is thrown there besides).
    if os.environ.get("DEMO_MODE", "").strip().lower() in ("1", "true", "yes"):
        return os.environ.get("DEMO_DM_EMAIL", "demo@questlab.app").strip().lower()

    # Plan 73 — signed session tokens (OAuth sign-in). A valid bearer token
    # wins in every mode; in AUTH_MODE=oauth it is the ONLY accepted identity.
    bearer = request.headers.get("authorization", "")
    if bearer.lower().startswith("bearer "):
        from integrations import session_token

        claims = session_token.verify(bearer[7:].strip())
        if claims is not None:
            return str(claims["sub"]).strip().lower()
        if os.environ.get("AUTH_MODE", "header").strip().lower() == "oauth":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session expired. Sign in again.",
            )

    if os.environ.get("AUTH_MODE", "header").strip().lower() == "oauth":
        # Public deployments never trust a client-supplied header — the
        # honor-system identity is exactly what a public link cannot have.
        # (Azure Front Door deployments keep header mode; the header is
        # injected by the edge there, not by the browser.)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
        )

    header_name = os.environ.get("AUTH_EMAIL_HEADER", "X-MS-CLIENT-PRINCIPAL-NAME")
    email = request.headers.get(header_name) or os.environ.get("CURRENT_USER_EMAIL", "")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No identity header present. Access denied.",
        )
    return email.strip().lower()


CurrentUser = Annotated[str, Depends(current_user)]


def ai_user(user: CurrentUser, db: DB) -> str:
    """Resolve the DM AND check they may run an AI generation right now (Plan 73).

    Args:
        user: Authenticated DM email.
        db: Database session.

    Returns:
        The DM email, when entitled.

    Raises:
        HTTPException 402: When the AI gate requires Patreon membership.
        HTTPException 429: When today's generation quota is spent.
    """
    from services import entitlement_service

    ent = entitlement_service.check_ai(db, user)
    if not ent.allowed:
        raise HTTPException(
            status_code=(
                status.HTTP_429_TOO_MANY_REQUESTS
                if ent.reason == "daily_limit"
                else status.HTTP_402_PAYMENT_REQUIRED
            ),
            detail={"code": ent.reason, "patreon_url": ent.patreon_url},
        )
    entitlement_service.record_ai(db, user)
    return user


AiUser = Annotated[str, Depends(ai_user)]


def gate_ai_for_pc(db: Session, pc_id) -> str:
    """Player-facing AI (the forge) is charged to, and gated on, the campaign owner.

    Args:
        db: Database session.
        pc_id: UUID of the player character.

    Returns:
        The owner's email.

    Raises:
        HTTPException 402/429: As ``ai_user``.
        HTTPException 404: If the PC is unknown.
    """
    from services import entitlement_service

    owner = entitlement_service.owner_email_for_pc(db, pc_id)
    if owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found.")
    ent = entitlement_service.check_ai(db, owner)
    if not ent.allowed:
        raise HTTPException(
            status_code=(
                status.HTTP_429_TOO_MANY_REQUESTS
                if ent.reason == "daily_limit"
                else status.HTTP_402_PAYMENT_REQUIRED
            ),
            detail={"code": ent.reason, "patreon_url": ent.patreon_url},
        )
    entitlement_service.record_ai(db, owner)
    return owner
