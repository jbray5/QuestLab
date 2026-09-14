"""Duels fought on separate devices (Plan 104).

The rules never change here: every turn is still computed by
``services/arena_service.py``, which does not know this module exists. All this
service does is decide *who may act*, hold the fight between turns, and tell
both phones when it moved.

Trust model is the arena's and /play's: holding a character's link is the proof
you are that character. Authorization on top of that is one question — is it
your seat's turn? — and it is answered here, not in the UI.
"""

import uuid
from typing import Optional

from sqlmodel import Session

from db.repos.character_repo import CharacterRepo
from db.repos.duel_repo import DuelRepo
from domain.arena import ArenaAction, ArenaState
from domain.character import PlayerCharacter
from domain.duel import Duel, DuelRead, DuelSeat, DuelSummary, state_to_json
from integrations.event_bus import publish_duel_called, publish_duel_updated
from services import arena_service

# A duel nobody has touched for this long has been abandoned — it stops showing
# up as a challenge. Nothing is deleted; the link still works.
_STALE_MINUTES = 240


def _pc_or_raise(db: Session, pc_id: uuid.UUID) -> PlayerCharacter:
    """Fetch a character or raise.

    Args:
        db: Active database session.
        pc_id: UUID of the character.

    Returns:
        The character row.

    Raises:
        ValueError: If no such character exists.
    """
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise ValueError("Character not found.")
    return pc


def _seat_ids(duel: Duel) -> list[uuid.UUID]:
    """The characters with a seat in this duel.

    Args:
        duel: The duel row.

    Returns:
        Seat character UUIDs.
    """
    return [uuid.UUID(str(sid)) for sid in (duel.seat_ids or [])]


def _load(duel: Duel) -> ArenaState:
    """Rehydrate the sealed fight from the row.

    Args:
        duel: The duel row.

    Returns:
        The fight, exactly as the referee last sealed it.

    Raises:
        ValueError: If the row somehow carries no fight.
    """
    if not duel.state:
        raise ValueError("That duel has no fight in it.")
    return ArenaState.model_validate(duel.state)


def _up_pc_id(state: ArenaState) -> Optional[uuid.UUID]:
    """Which character's turn it is, if the fight is still going.

    Args:
        state: The fight.

    Returns:
        The acting character's UUID, or None when the fight is over.
    """
    if state.phase == "over" or not state.roster or not state.order:
        return None
    return state.roster[state.order[state.turn]].pc_id


def _require_seat(duel: Duel, pc_id: uuid.UUID) -> None:
    """Refuse anyone who is not in this duel.

    Args:
        duel: The duel row.
        pc_id: The character asking.

    Raises:
        PermissionError: If that character has no seat.
    """
    if pc_id not in _seat_ids(duel):
        raise PermissionError("You're not in that duel.")


def _project(duel: Duel, state: ArenaState, pc_id: uuid.UUID) -> DuelRead:
    """Build what one player's phone sees.

    Args:
        duel: The duel row.
        state: The fight.
        pc_id: The character asking.

    Returns:
        The duel, with the seats and whose turn it is spelled out.
    """
    up = _up_pc_id(state)
    seats = [
        DuelSeat(
            pc_id=slot.pc_id,
            name=slot.label,
            hp=slot.pc.hp if slot.pc else 0,
            hp_max=slot.pc.hp_max if slot.pc else 0,
            up=slot.pc_id == up,
        )
        for slot in state.roster
        if slot.pc_id is not None
    ]
    return DuelRead(
        id=duel.id,
        host_pc_id=duel.host_pc_id,
        phase=duel.phase,
        seats=seats,
        up_pc_id=up,
        your_turn=up == pc_id,
        updated_at=duel.updated_at,
        state=state,
    )


def start(db: Session, host_pc_id: uuid.UUID, pc_ids: list[uuid.UUID]) -> DuelRead:
    """Call two or more characters out to a duel, each on their own device.

    Args:
        db: Active database session.
        host_pc_id: The character calling it (and holding the link used).
        pc_ids: Everyone in the ring, the host included.

    Returns:
        The opened duel, with initiative already rolled.

    Raises:
        ValueError: With fewer than two characters, or one from another table.
        PermissionError: If the host is not in their own duel.
    """
    seats = list(dict.fromkeys(pc_ids))
    if len(seats) < 2:
        raise ValueError("A duel needs at least two characters.")
    if host_pc_id not in seats:
        raise PermissionError("You have to be in your own duel.")
    host = _pc_or_raise(db, host_pc_id)
    for seat in seats:
        other = _pc_or_raise(db, seat)
        if other.campaign_id != host.campaign_id:
            raise ValueError("Everyone in a duel has to be at the same table.")

    state = arena_service.start_duel(db, seats)
    duel = DuelRepo.create(
        db,
        Duel(
            campaign_id=host.campaign_id,
            host_pc_id=host_pc_id,
            seat_ids=[str(s) for s in seats],
            state=state_to_json(state),
            phase="live",
        ),
    )
    for seat in seats:
        if seat != host_pc_id:
            publish_duel_called(seat, duel.id, host.character_name)
    publish_duel_updated(duel.id, _up_pc_id(state))
    return _project(duel, state, host_pc_id)


def read(db: Session, duel_id: uuid.UUID, pc_id: uuid.UUID) -> DuelRead:
    """The current fight, for one of the phones watching it.

    Args:
        db: Active database session.
        duel_id: UUID of the duel.
        pc_id: The character asking (the capability).

    Returns:
        The duel as that player sees it.

    Raises:
        ValueError: If the duel is gone.
        PermissionError: If that character has no seat.
    """
    duel = DuelRepo.get(db, duel_id)
    if duel is None:
        raise ValueError("That duel is over or was never here.")
    _require_seat(duel, pc_id)
    return _project(duel, _load(duel), pc_id)


def act(db: Session, duel_id: uuid.UUID, pc_id: uuid.UUID, action: ArenaAction) -> DuelRead:
    """Take one action in a server-held duel, if it is your turn.

    The whole point of the check below: a capability URL is a secret, not a
    permission. Holding your own link proves you are you — it does not entitle
    you to act on somebody else's turn, so the server decides that, not the
    screen.

    Args:
        db: Active database session.
        duel_id: UUID of the duel.
        pc_id: The character acting.
        action: What they chose.

    Returns:
        The duel after the action.

    Raises:
        ValueError: If the duel is gone, over, or the action is illegal.
        PermissionError: If it isn't that character's turn.
    """
    duel = DuelRepo.get(db, duel_id)
    if duel is None:
        raise ValueError("That duel is over or was never here.")
    _require_seat(duel, pc_id)
    state = _load(duel)
    if state.phase == "over":
        raise ValueError("That duel is finished.")
    up = _up_pc_id(state)
    if up != pc_id:
        name = next((slot.label for slot in state.roster if slot.pc_id == up), "the other side")
        raise PermissionError(f"It's {name}'s turn.")

    state = arena_service.act(db, state, action)
    duel.state = state_to_json(state)
    if state.phase == "over":
        duel.phase = "over"
    duel = DuelRepo.save(db, duel)
    publish_duel_updated(duel.id, _up_pc_id(state))
    return _project(duel, state, pc_id)


def end(db: Session, duel_id: uuid.UUID, pc_id: uuid.UUID) -> DuelRead:
    """Walk out of a duel. Anyone in it can call it off.

    Args:
        db: Active database session.
        duel_id: UUID of the duel.
        pc_id: The character ending it.

    Returns:
        The closed duel.

    Raises:
        ValueError: If the duel is gone.
        PermissionError: If that character has no seat.
    """
    duel = DuelRepo.get(db, duel_id)
    if duel is None:
        raise ValueError("That duel is over or was never here.")
    _require_seat(duel, pc_id)
    state = _load(duel)
    if state.phase != "over":
        # Flee is the engine's own way to close a fight, and it reseals — no
        # hand-editing a sealed document from out here.
        state = arena_service.act(db, state, ArenaAction(kind="flee"))
    duel.state = state_to_json(state)
    duel.phase = "over"
    duel = DuelRepo.save(db, duel)
    publish_duel_updated(duel.id, None)
    return _project(duel, state, pc_id)


def called_for(db: Session, pc_id: uuid.UUID) -> list[DuelSummary]:
    """The live duels this character has a seat in — the challenge banner.

    Args:
        db: Active database session.
        pc_id: UUID of the character asking.

    Returns:
        Live duels they are in, newest first.

    Raises:
        ValueError: If the character does not exist.
    """
    pc = _pc_or_raise(db, pc_id)
    out: list[DuelSummary] = []
    for duel in DuelRepo.list_recent_for_campaign(db, pc.campaign_id, _STALE_MINUTES):
        if duel.phase != "live" or pc_id not in _seat_ids(duel):
            continue
        try:
            state = _load(duel)
        except ValueError:
            continue
        host = next((slot.label for slot in state.roster if slot.pc_id == duel.host_pc_id), "")
        out.append(
            DuelSummary(
                id=duel.id,
                host_pc_id=duel.host_pc_id,
                host_name=host,
                phase=duel.phase,
                seats=[slot.label for slot in state.roster],
                your_turn=_up_pc_id(state) == pc_id,
                updated_at=duel.updated_at,
            )
        )
    return out
