"""Waitlist router — public landing-page signup (Plan 54)."""

from fastapi import APIRouter, HTTPException, status

from api.deps import DB
from domain.waitlist import WaitlistCreate, WaitlistRead
from services import waitlist_service

router = APIRouter(tags=["waitlist"])


@router.post("/waitlist", response_model=WaitlistRead, status_code=status.HTTP_201_CREATED)
def join_waitlist(body: WaitlistCreate, db: DB) -> WaitlistRead:
    """Join the beta waitlist (idempotent, unauthenticated).

    Args:
        body: Email + optional source tag.
        db: Database session.

    Returns:
        Acknowledgement (flags repeat signups).
    """
    try:
        return waitlist_service.join(db, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
