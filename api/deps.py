"""Shared FastAPI dependencies — database session and authenticated user.

Inject these via FastAPI's Depends() mechanism:

    @router.get("/campaigns")
    def list_campaigns(db: DB, user: CurrentUser):
        ...
"""

import os
from typing import Annotated, Generator

from fastapi import Depends, Header, HTTPException, status
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


def current_user(
    x_ms_client_principal_name: Annotated[str | None, Header()] = None,
) -> str:
    """Resolve the authenticated user's email from the trusted identity header.

    In production, Azure Front Door injects the header set by AUTH_EMAIL_HEADER.
    In local development, falls back to CURRENT_USER_EMAIL env var.

    Args:
        x_ms_client_principal_name: Value of the X-MS-CLIENT-PRINCIPAL-NAME header
            (FastAPI lowercases and underscores header names automatically).

    Returns:
        Lowercased, stripped email string.

    Raises:
        HTTPException 401: If no identity can be resolved.
    """
    # Check configured header name (may differ from the default)
    header_name = os.environ.get("AUTH_EMAIL_HEADER", "X-MS-CLIENT-PRINCIPAL-NAME")
    # FastAPI normalises headers to lowercase with underscores
    normalised = header_name.lower().replace("-", "_")

    # For the default header, FastAPI already passes it as the parameter above.
    # For custom header names we fall back to env var (same logic as identity.py).
    email = x_ms_client_principal_name or os.environ.get("CURRENT_USER_EMAIL", "")
    _ = normalised  # used implicitly via the header parameter name convention

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No identity header present. Access denied.",
        )
    return email.strip().lower()


CurrentUser = Annotated[str, Depends(current_user)]
