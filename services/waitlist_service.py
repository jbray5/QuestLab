"""Waitlist service — public beta interest capture (Plan 54).

Unauthenticated by design (it's a landing-page form); the only defenses
needed are input validation and idempotency.
"""

import re

from sqlmodel import Session as DBSession

from db.repos.waitlist_repo import WaitlistRepo
from domain.waitlist import WaitlistCreate, WaitlistEntry, WaitlistRead

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def join(db: DBSession, data: WaitlistCreate) -> WaitlistRead:
    """Add an email to the waitlist (idempotent).

    Args:
        db: Active database session.
        data: The signup payload.

    Returns:
        WaitlistRead with ``already_registered`` set on repeat signups.

    Raises:
        ValueError: If the email doesn't look like an email.
    """
    email = data.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise ValueError("That doesn't look like an email address.")
    existing = WaitlistRepo.find_by_email(db, email)
    if existing is not None:
        return WaitlistRead(email=email, already_registered=True)
    WaitlistRepo.create(db, WaitlistEntry(email=email, source=(data.source or "landing")[:100]))
    return WaitlistRead(email=email)
