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
    header_name = os.environ.get("AUTH_EMAIL_HEADER", "X-MS-CLIENT-PRINCIPAL-NAME")
    email = request.headers.get(header_name) or os.environ.get("CURRENT_USER_EMAIL", "")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No identity header present. Access denied.",
        )
    return email.strip().lower()


CurrentUser = Annotated[str, Depends(current_user)]
