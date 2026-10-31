"""Shared FastAPI dependencies — database session and authenticated user.

Inject these via FastAPI's Depends() mechanism:

    @router.get("/campaigns")
    def list_campaigns(db: DB, user: CurrentUser):
        ...
"""

import os
import uuid
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
    # demo data.
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
    email = request.headers.get(header_name) or ""
    if not email and os.environ.get("ENV", "").strip().lower() != "production":
        # Local-dev fallback only (Plan 120): a stray env var must never stand in
        # for an identity on a production deployment.
        email = os.environ.get("CURRENT_USER_EMAIL", "")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No identity header present. Access denied.",
        )
    return email.strip().lower()


CurrentUser = Annotated[str, Depends(current_user)]


def play_pc_id(pc_id: str, db: DB) -> uuid.UUID:
    """Resolve the ``{pc_id}`` segment of a player link to the PC's UUID (SEC-002).

    The segment is the PC's ``play_token`` (or, during the grace period, the
    UUID of a PC made before tokens). Every ``/play/{pc_id}/…``,
    ``/stream/pc/{pc_id}`` and duel route depends on this, so the services
    below keep taking a UUID.

    Args:
        pc_id: The link secret from the path.
        db: Database session.

    Returns:
        The PC's UUID.

    Raises:
        HTTPException 404: No character has that link.
        HTTPException 410: An old link that was replaced; the detail names the
            campaign so the page can offer the join page.
    """
    from services.player_service import PlayLinkReplaced, resolve_play_key

    try:
        return resolve_play_key(db, pc_id)
    except PlayLinkReplaced as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "link_replaced", "campaign_id": str(exc.campaign_id)},
        )
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found.")


PlayPcId = Annotated[uuid.UUID, Depends(play_pc_id)]
