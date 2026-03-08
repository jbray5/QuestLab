"""Session service — business logic and authorization for Session and Runbook operations.

Rules enforced here:
- A DM must own the parent campaign (via adventure) to manage sessions.
- session_number must be >= 1 and unique within an adventure.
- At most 20 sessions per adventure.
- A session can have at most one runbook (overwrite on regenerate).
- Status transitions are linear: Draft → Ready → InProgress → Complete.
"""

import random
import uuid
from datetime import date
from typing import Any, Optional

from sqlmodel import Session as DBSession

from db.repos.adventure_repo import AdventureRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.session_repo import SessionRepo, SessionRunbookRepo
from domain.enums import SessionStatus
from domain.session import Session as GameSession
from domain.session import (
    SessionCreate,
    SessionRunbook,
    SessionRunbookCreate,
    SessionUpdate,
)

MAX_SESSIONS_PER_ADVENTURE = 20


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _assert_adventure_owner(db: DBSession, adventure_id: uuid.UUID, dm_email: str) -> None:
    """Verify the DM owns the campaign that contains this adventure.

    Args:
        db: Active database session.
        adventure_id: UUID of the adventure.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the adventure or its campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    adventure = AdventureRepo.get_by_id(db, adventure_id)
    if adventure is None:
        raise ValueError(f"Adventure {adventure_id} not found.")
    campaign = CampaignRepo.get_by_id(db, adventure.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign for adventure {adventure_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to access this adventure's sessions.")


def _assert_session_owner(db: DBSession, game_session: GameSession, dm_email: str) -> None:
    """Verify the DM owns the session's adventure's campaign.

    Args:
        db: Active database session.
        game_session: GameSession ORM object.
        dm_email: Email of the requesting DM.
    """
    _assert_adventure_owner(db, game_session.adventure_id, dm_email)


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------


def list_sessions(db: DBSession, adventure_id: uuid.UUID, dm_email: str) -> list[GameSession]:
    """List all sessions in an adventure, ordered by session number.

    Args:
        db: Active database session.
        adventure_id: UUID of the parent adventure.
        dm_email: Email of the requesting DM.

    Returns:
        List of GameSession ORM objects.

    Raises:
        ValueError: If the adventure or campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    _assert_adventure_owner(db, adventure_id, dm_email)
    return SessionRepo.list_by_adventure(db, adventure_id)


def get_session(db: DBSession, session_id: uuid.UUID, dm_email: str) -> GameSession:
    """Fetch a single session by ID.

    Args:
        db: Active database session.
        session_id: UUID of the session.
        dm_email: Email of the requesting DM.

    Returns:
        GameSession ORM object.

    Raises:
        ValueError: If not found.
        PermissionError: If the DM does not own the parent campaign.
    """
    game_session = SessionRepo.get_by_id(db, session_id)
    if game_session is None:
        raise ValueError(f"Session {session_id} not found.")
    _assert_session_owner(db, game_session, dm_email)
    return game_session


def create_session(
    db: DBSession,
    adventure_id: uuid.UUID,
    session_number: int,
    title: str,
    dm_email: str,
    date_planned: Optional[date] = None,
    attending_pc_ids: Optional[list[uuid.UUID]] = None,
    actual_notes: Optional[str] = None,
) -> GameSession:
    """Create a new game session.

    Args:
        db: Active database session.
        adventure_id: UUID of the parent adventure.
        session_number: Sequential session number (>= 1).
        title: Session title.
        dm_email: Email of the owning DM.
        date_planned: Optional planned date for the session.
        attending_pc_ids: UUIDs of player characters attending this session.
        actual_notes: Optional DM notes taken after the session.

    Returns:
        Newly created GameSession ORM object.

    Raises:
        ValueError: If validation fails or session limit reached.
        PermissionError: If DM does not own the campaign.
    """
    title = title.strip()
    if not title:
        raise ValueError("Session title cannot be empty.")
    if session_number < 1:
        raise ValueError("Session number must be >= 1.")

    _assert_adventure_owner(db, adventure_id, dm_email)

    existing = SessionRepo.list_by_adventure(db, adventure_id)
    if len(existing) >= MAX_SESSIONS_PER_ADVENTURE:
        raise ValueError(f"Adventure already has {MAX_SESSIONS_PER_ADVENTURE} sessions (maximum).")

    payload = SessionCreate(
        adventure_id=adventure_id,
        session_number=session_number,
        title=title,
        date_planned=date_planned,
        attending_pc_ids=attending_pc_ids or [],
        actual_notes=actual_notes,
    )
    return SessionRepo.create(db, payload)


def update_session(
    db: DBSession,
    session_id: uuid.UUID,
    dm_email: str,
    update: SessionUpdate,
) -> GameSession:
    """Partially update a session.

    Args:
        db: Active database session.
        session_id: UUID of the session.
        dm_email: Email of the requesting DM.
        update: Partial update payload.

    Returns:
        Updated GameSession ORM object.

    Raises:
        ValueError: If not found.
        PermissionError: If DM does not own the campaign.
    """
    game_session = SessionRepo.get_by_id(db, session_id)
    if game_session is None:
        raise ValueError(f"Session {session_id} not found.")
    _assert_session_owner(db, game_session, dm_email)
    return SessionRepo.update(db, game_session, update)


def delete_session(db: DBSession, session_id: uuid.UUID, dm_email: str) -> bool:
    """Delete a session and its runbook.

    Args:
        db: Active database session.
        session_id: UUID of the session.
        dm_email: Email of the requesting DM.

    Returns:
        True if deleted.

    Raises:
        ValueError: If not found.
        PermissionError: If DM does not own the campaign.
    """
    game_session = SessionRepo.get_by_id(db, session_id)
    if game_session is None:
        raise ValueError(f"Session {session_id} not found.")
    _assert_session_owner(db, game_session, dm_email)
    # Cascade delete the runbook first
    runbook = SessionRunbookRepo.get_by_session(db, session_id)
    if runbook:
        SessionRunbookRepo.delete(db, runbook)
    return SessionRepo.delete(db, game_session)


# ---------------------------------------------------------------------------
# Runbook CRUD
# ---------------------------------------------------------------------------


def get_runbook(db: DBSession, session_id: uuid.UUID, dm_email: str) -> Optional[SessionRunbook]:
    """Return the runbook for a session if one exists.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.

    Returns:
        SessionRunbook if found, else None.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If DM does not own the campaign.
    """
    game_session = get_session(db, session_id, dm_email)
    _ = game_session  # ownership already verified
    return SessionRunbookRepo.get_by_session(db, session_id)


def save_runbook(
    db: DBSession,
    session_id: uuid.UUID,
    dm_email: str,
    runbook_data: SessionRunbookCreate,
) -> SessionRunbook:
    """Save (or overwrite) the runbook for a session.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        runbook_data: Validated runbook creation payload.

    Returns:
        Persisted SessionRunbook ORM object.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If DM does not own the campaign.
    """
    get_session(db, session_id, dm_email)  # verify ownership
    return SessionRunbookRepo.create(db, runbook_data)


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------

_STATUS_TRANSITIONS: dict[SessionStatus, SessionStatus] = {
    SessionStatus.DRAFT: SessionStatus.READY,
    SessionStatus.READY: SessionStatus.IN_PROGRESS,
    SessionStatus.IN_PROGRESS: SessionStatus.COMPLETE,
}


def advance_status(db: DBSession, session_id: uuid.UUID, dm_email: str) -> GameSession:
    """Advance a session's status to the next state in the lifecycle.

    Lifecycle: Draft → Ready → InProgress → Complete.
    A Complete session cannot be advanced further.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.

    Returns:
        Updated GameSession with the new status.

    Raises:
        ValueError: If the session is not found or is already Complete.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = get_session(db, session_id, dm_email)
    next_status = _STATUS_TRANSITIONS.get(game_session.status)
    if next_status is None:
        raise ValueError(
            f"Session is already {game_session.status.value} and cannot be advanced further."
        )
    return SessionRepo.update(db, game_session, SessionUpdate(status=next_status))


# ---------------------------------------------------------------------------
# Initiative roller
# ---------------------------------------------------------------------------


def roll_initiative(combatants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Roll initiative for a list of combatants and return them sorted highest first.

    Each input combatant dict must have:
      - ``name`` (str)
      - ``dex_score`` (int) — raw ability score (modifier = (score - 10) // 2)
      - ``hp`` (int) — current hit points
      - ``max_hp`` (int) — maximum hit points
      - ``type`` (str) — ``'pc'`` or ``'monster'``

    Adds to each returned dict:
      - ``roll`` — the d20 result (1–20)
      - ``initiative`` — roll + DEX modifier
      - ``active`` — False (caller sets True for the current turn)
      - ``defeated`` — True if hp <= 0

    Sorting: highest initiative first. Ties broken by DEX score, then randomly.

    Args:
        combatants: List of combatant info dicts.

    Returns:
        New list of combatant dicts with initiative fields added, sorted descending.

    Raises:
        ValueError: If any combatant is missing a required field.
    """
    required = {"name", "dex_score", "hp", "max_hp", "type"}
    for i, c in enumerate(combatants):
        missing = required - c.keys()
        if missing:
            raise ValueError(f"Combatant [{i}] missing fields: {missing}")

    rolled = []
    for c in combatants:
        dex_mod = (int(c["dex_score"]) - 10) // 2
        d20 = random.randint(1, 20)
        initiative = d20 + dex_mod
        rolled.append(
            {
                **c,
                "roll": d20,
                "initiative": initiative,
                "active": False,
                "defeated": int(c["hp"]) <= 0,
            }
        )

    # Sort: initiative desc, then dex_score desc, then random tiebreak
    rolled.sort(
        key=lambda x: (x["initiative"], x["dex_score"], random.random()),
        reverse=True,
    )
    return rolled


# ---------------------------------------------------------------------------
# Session notes
# ---------------------------------------------------------------------------


def update_notes(db: DBSession, session_id: uuid.UUID, dm_email: str, notes: str) -> GameSession:
    """Persist DM notes taken during or after a session.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        notes: Free-text notes to store on the session.

    Returns:
        Updated GameSession ORM object.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = get_session(db, session_id, dm_email)
    return SessionRepo.update(db, game_session, SessionUpdate(actual_notes=notes or None))
