"""The friends beta (Plan 125): feedback from any DM screen.

Signed-in DMs send notes; admins read them under ``/api/admin/feedback``.
"""

from fastapi import APIRouter, BackgroundTasks, status

from api.deps import DB, CurrentUser
from domain.beta import FeedbackCreate
from services import beta_service

router = APIRouter(tags=["beta"])


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
def send_feedback(
    body: FeedbackCreate, db: DB, user: CurrentUser, background: BackgroundTasks
) -> dict:
    """Store a feedback note and ping the feedback channel after responding.

    Args:
        body: Kind, text, page and viewport.
        db: Database session.
        user: The signed-in DM.
        background: Runs the Discord ping after the response is sent.

    Returns:
        ``{"id": <note id>}``.
    """
    note = beta_service.submit_feedback(db, user, body)
    background.add_task(beta_service.notify, note, beta_service.display_name_for(db, user))
    return {"id": str(note.id)}
