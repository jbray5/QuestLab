"""SessionBrief service — auth + lifecycle for the glanceable DM brief (Plan 43).

Thin orchestration over ai_service.generate_dm_brief and the brief repo. Every
public function enforces session ownership via session_service.get_session.
"""

import uuid
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.session_brief_repo import SessionBriefRepo
from domain.session_brief import SessionBrief, SessionBriefUpdate
from services import ai_service, session_service


def get_brief(db: DBSession, session_id: uuid.UUID, dm_email: str) -> Optional[SessionBrief]:
    """Return the persisted brief for a session (owner only), or None.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.

    Returns:
        The SessionBrief, or None if one has not been generated yet.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    session_service.get_session(db, session_id, dm_email)  # ownership + existence
    return SessionBriefRepo.get_by_session(db, session_id)


def generate_brief(
    db: DBSession, session_id: uuid.UUID, dm_email: str, notes: Optional[str] = None
) -> SessionBrief:
    """Generate a fresh brief via the AI and persist it (overwriting any prior).

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        notes: Optional DM planning notes to weave into the brief.

    Returns:
        The newly-persisted SessionBrief.

    Raises:
        ValueError: If the session/adventure/campaign is not found.
        PermissionError: If the DM does not own the campaign.
    """
    session_service.get_session(db, session_id, dm_email)  # ownership check
    payload = ai_service.generate_dm_brief(db, session_id, dm_email, extra_notes=notes)
    return SessionBriefRepo.create(db, payload)


def update_brief(
    db: DBSession, session_id: uuid.UUID, dm_email: str, update: SessionBriefUpdate
) -> SessionBrief:
    """Apply inline edits to the brief (owner only).

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        update: Partial update payload.

    Returns:
        The updated SessionBrief.

    Raises:
        ValueError: If the session or brief does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    session_service.get_session(db, session_id, dm_email)  # ownership check
    brief = SessionBriefRepo.get_by_session(db, session_id)
    if brief is None:
        raise ValueError("No brief exists for this session yet — generate one first.")
    return SessionBriefRepo.update(db, brief, update)
