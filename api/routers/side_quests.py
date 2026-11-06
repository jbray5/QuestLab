"""Side quests router (Plan 136): the DM's side.

``/campaigns/{id}/side-quests`` and ``/side-quests/{id}``: write quests, send them to characters,
and read what each character did. The campaign's DM only; ``side_quest_service`` checks it. The
player's side lives on the play link (``api/routers/play.py``).
"""

import uuid
from typing import NoReturn

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.side_quest import (
    QuestRunDetail,
    SideQuestConflictError,
    SideQuestCreate,
    SideQuestNotFoundError,
    SideQuestRead,
    SideQuestSend,
    SideQuestSendResult,
    SideQuestUpdate,
)
from services import side_quest_service

router = APIRouter(tags=["side-quests"])

_ERRORS = (SideQuestNotFoundError, SideQuestConflictError, PermissionError, ValueError)


def _http(exc: Exception) -> NoReturn:
    """Answer a service error with its HTTP status and plain message.

    Args:
        exc: The service's exception.

    Raises:
        HTTPException: 404, 409, 403 or 422.
    """
    if isinstance(exc, SideQuestNotFoundError):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, SideQuestConflictError):
        code = status.HTTP_409_CONFLICT
    elif isinstance(exc, PermissionError):
        code = status.HTTP_403_FORBIDDEN
    else:
        code = status.HTTP_422_UNPROCESSABLE_CONTENT
    raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.get("/campaigns/{campaign_id}/side-quests", response_model=list[SideQuestRead])
def list_quests(campaign_id: uuid.UUID, db: DB, user: CurrentUser):
    """A campaign's quests, newest first.

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: The requesting DM.

    Returns:
        The quests.
    """
    try:
        return side_quest_service.list_quests(db, campaign_id, user)
    except _ERRORS as exc:
        _http(exc)


@router.post(
    "/campaigns/{campaign_id}/side-quests",
    response_model=SideQuestRead,
    status_code=status.HTTP_201_CREATED,
)
def create_quest(campaign_id: uuid.UUID, body: SideQuestCreate, db: DB, user: CurrentUser):
    """Save a new draft.

    Args:
        campaign_id: UUID of the campaign.
        body: The quest, which may be unfinished.
        db: Database session.
        user: The requesting DM.

    Returns:
        The new draft.
    """
    try:
        return side_quest_service.create_quest(db, campaign_id, body, user)
    except _ERRORS as exc:
        _http(exc)


@router.get("/side-quests/{quest_id}", response_model=SideQuestRead)
def get_quest(quest_id: uuid.UUID, db: DB, user: CurrentUser):
    """One quest, with its DCs and links.

    Args:
        quest_id: UUID of the quest.
        db: Database session.
        user: The requesting DM.

    Returns:
        The quest.
    """
    try:
        return side_quest_service.get_quest(db, quest_id, user)
    except _ERRORS as exc:
        _http(exc)


@router.patch("/side-quests/{quest_id}", response_model=SideQuestRead)
def update_quest(quest_id: uuid.UUID, body: SideQuestUpdate, db: DB, user: CurrentUser):
    """Change a quest. Once it's sent, only words and pictures may change (409 otherwise).

    Args:
        quest_id: UUID of the quest.
        body: The fields to change.
        db: Database session.
        user: The requesting DM.

    Returns:
        The updated quest.
    """
    try:
        return side_quest_service.update_quest(db, quest_id, body, user)
    except _ERRORS as exc:
        _http(exc)


@router.delete("/side-quests/{quest_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quest(quest_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a quest and its runs. Gold and items already paid stay on the sheets.

    Args:
        quest_id: UUID of the quest.
        db: Database session.
        user: The requesting DM.
    """
    try:
        side_quest_service.delete_quest(db, quest_id, user)
    except _ERRORS as exc:
        _http(exc)


@router.post("/side-quests/{quest_id}/send", response_model=SideQuestSendResult)
def send_quest(quest_id: uuid.UUID, body: SideQuestSend, db: DB, user: CurrentUser):
    """Send a finished quest to characters (409 listing what to fix, if it isn't finished).

    Args:
        quest_id: UUID of the quest.
        body: Who gets it, and an optional Discord post.
        db: Database session.
        user: The requesting DM.

    Returns:
        The quest, how many new runs were made, and any Discord error.
    """
    try:
        return side_quest_service.send_quest(db, quest_id, body, user)
    except _ERRORS as exc:
        _http(exc)


@router.get("/side-quests/{quest_id}/runs", response_model=list[QuestRunDetail])
def list_runs(quest_id: uuid.UUID, db: DB, user: CurrentUser):
    """Everything each character did in a quest.

    Args:
        quest_id: UUID of the quest.
        db: Database session.
        user: The requesting DM.

    Returns:
        One detail per run.
    """
    try:
        return side_quest_service.list_runs(db, quest_id, user)
    except _ERRORS as exc:
        _http(exc)
