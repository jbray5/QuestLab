"""CombatBeat service — auth and lifecycle for state-triggered combat beats.

Plan 40 Change 3.

The trigger-evaluation logic — *given the current combat state, which
pending beats should fire?* — lives client-side in the HUD. The backend
just records authoring intent and the fire/dismiss timestamps. The
client posts a fire request when it observes the trigger condition.

Authorization: every public function checks the caller owns the parent
session's campaign via the existing ``_assert_session_owner`` helper.
"""

import uuid
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.combat_beat_repo import CombatBeatRepo
from db.repos.session_repo import SessionRepo
from domain.combat_beat import (
    CombatBeat,
    CombatBeatCreate,
    CombatBeatTrigger,
    CombatBeatUpdate,
)
from services.session_service import _assert_session_owner


def _get_beat_or_raise(
    db: DBSession, beat_id: uuid.UUID, dm_email: str
) -> CombatBeat:
    """Fetch a beat and authorize the caller, or raise.

    Args:
        db: Active database session.
        beat_id: UUID of the beat to fetch.
        dm_email: Email of the requesting DM.

    Returns:
        The beat row.

    Raises:
        ValueError: If the beat or its session does not exist.
        PermissionError: If the DM does not own the parent campaign.
    """
    beat = CombatBeatRepo.get_by_id(db, beat_id)
    if beat is None:
        raise ValueError(f"Combat beat {beat_id} not found.")
    game_session = SessionRepo.get_by_id(db, beat.session_id)
    if game_session is None:
        raise ValueError(f"Session {beat.session_id} not found.")
    _assert_session_owner(db, game_session, dm_email)
    return beat


def list_for_session(
    db: DBSession, session_id: uuid.UUID, dm_email: str
) -> list[CombatBeat]:
    """List every beat for a session, ordered by sort_index then created_at.

    Args:
        db: Active database session.
        session_id: UUID of the parent game session.
        dm_email: Email of the requesting DM.

    Returns:
        Beats in display order.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = SessionRepo.get_by_id(db, session_id)
    if game_session is None:
        raise ValueError(f"Session {session_id} not found.")
    _assert_session_owner(db, game_session, dm_email)
    return CombatBeatRepo.list_for_session(db, session_id)


def create(
    db: DBSession,
    session_id: uuid.UUID,
    body: CombatBeatCreate,
    dm_email: str,
) -> CombatBeat:
    """Create a beat attached to a session (and optionally a combatant).

    Args:
        db: Active database session.
        session_id: UUID of the parent game session.
        body: Authoring payload.
        dm_email: Email of the requesting DM.

    Returns:
        The persisted beat.

    Raises:
        ValueError: If the session does not exist, or the trigger kind
            and combatant_id are inconsistent (HP triggers need a
            combatant; round triggers must NOT have one).
        PermissionError: If the DM does not own the campaign.
    """
    game_session = SessionRepo.get_by_id(db, session_id)
    if game_session is None:
        raise ValueError(f"Session {session_id} not found.")
    _assert_session_owner(db, game_session, dm_email)

    if body.trigger_kind is CombatBeatTrigger.HP_LTE and body.combatant_id is None:
        raise ValueError("hp_lte triggers must specify a combatant_id.")
    if body.trigger_kind is CombatBeatTrigger.ROUND_GTE and body.combatant_id is not None:
        raise ValueError("round_gte triggers are session-scoped; omit combatant_id.")

    beat = CombatBeat(
        session_id=session_id,
        combatant_id=body.combatant_id,
        trigger_kind=body.trigger_kind,
        trigger_value=body.trigger_value,
        text=body.text,
        sort_index=body.sort_index,
    )
    return CombatBeatRepo.create(db, beat)


def update(
    db: DBSession,
    beat_id: uuid.UUID,
    body: CombatBeatUpdate,
    dm_email: str,
) -> CombatBeat:
    """Partial-update a beat's authoring fields.

    Args:
        db: Active database session.
        beat_id: UUID of the beat.
        body: Partial update.
        dm_email: Email of the requesting DM.

    Returns:
        The refreshed beat.
    """
    beat = _get_beat_or_raise(db, beat_id, dm_email)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(beat, key, value)
    return CombatBeatRepo.update(db, beat)


def fire(db: DBSession, beat_id: uuid.UUID, dm_email: str) -> CombatBeat:
    """Mark a beat as fired (idempotent — second call is a no-op).

    Args:
        db: Active database session.
        beat_id: UUID of the beat.
        dm_email: Email of the requesting DM.

    Returns:
        The refreshed beat.
    """
    beat = _get_beat_or_raise(db, beat_id, dm_email)
    return CombatBeatRepo.mark_fired(db, beat)


def dismiss(db: DBSession, beat_id: uuid.UUID, dm_email: str) -> CombatBeat:
    """Mark a beat as dismissed (DM has delivered or skipped it).

    Args:
        db: Active database session.
        beat_id: UUID of the beat.
        dm_email: Email of the requesting DM.

    Returns:
        The refreshed beat.
    """
    beat = _get_beat_or_raise(db, beat_id, dm_email)
    return CombatBeatRepo.mark_dismissed(db, beat)


def reset(db: DBSession, beat_id: uuid.UUID, dm_email: str) -> CombatBeat:
    """Re-arm a beat — clears fired_at and dismissed_at so it can fire again.

    Useful if the DM accidentally dismisses one or wants to re-fire it
    after a HP/round state oscillation.

    Args:
        db: Active database session.
        beat_id: UUID of the beat.
        dm_email: Email of the requesting DM.

    Returns:
        The refreshed beat.
    """
    beat = _get_beat_or_raise(db, beat_id, dm_email)
    return CombatBeatRepo.reset(db, beat)


def delete(db: DBSession, beat_id: uuid.UUID, dm_email: str) -> bool:
    """Delete a beat row entirely.

    Args:
        db: Active database session.
        beat_id: UUID of the beat.
        dm_email: Email of the requesting DM.

    Returns:
        True.
    """
    beat = _get_beat_or_raise(db, beat_id, dm_email)
    return CombatBeatRepo.delete(db, beat)


def get(
    db: DBSession, beat_id: uuid.UUID, dm_email: str
) -> Optional[CombatBeat]:
    """Fetch a single beat, with auth.

    Args:
        db: Active database session.
        beat_id: UUID of the beat.
        dm_email: Email of the requesting DM.

    Returns:
        The beat (raises if not found / unauthorized).
    """
    return _get_beat_or_raise(db, beat_id, dm_email)
