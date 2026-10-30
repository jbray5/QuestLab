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


def start(
    db: Session,
    host_pc_id: uuid.UUID,
    pc_ids: list[uuid.UUID],
    monster_id: Optional[uuid.UUID] = None,
) -> DuelRead:
    """Call two or more characters into a fight, each on their own device.

    Args:
        db: Active database session.
        host_pc_id: The character calling it (and holding the link used).
        pc_ids: Everyone in the ring, the host included.
        monster_id: A boss for the party to fight together (Plan 116), or
            None for everyone against everyone.

    Returns:
        The opened fight, with initiative already rolled.

    Raises:
        ValueError: With fewer than two characters, one from another table,
            or a boss that isn't in the catalog.
        PermissionError: If the host is not in their own fight.
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

    if monster_id is not None:
        state = arena_service.start_boss(db, seats, monster_id, controlled=None)
    else:
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

    return _save_and_tell(db, duel, arena_service.act(db, state, action), pc_id)


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
        try:
            # Flee is the engine's own way to close a fight, and it reseals —
            # no hand-editing a sealed document from out here.
            state = arena_service.act(db, state, ArenaAction(kind="flee"))
        except ValueError:
            # A deploy that changes the fight's shape invalidates the seal on
            # anything already in flight. Walking out has to work anyway, or
            # the row is a live duel nobody can ever close.
            pass
    duel.state = state_to_json(state)
    duel.phase = "over"
    duel = DuelRepo.save(db, duel)
    publish_duel_updated(duel.id, None)
    return _project(duel, state, pc_id)


def _live_or_raise(db: Session, duel_id: uuid.UUID, pc_id: uuid.UUID) -> Duel:
    """A live duel this character sits in, or the refusal that explains why not.

    Args:
        db: Active database session.
        duel_id: UUID of the duel.
        pc_id: The character asking.

    Returns:
        The duel row.

    Raises:
        ValueError: If the duel is gone or finished.
        PermissionError: If that character has no seat.
    """
    duel = DuelRepo.get(db, duel_id)
    if duel is None:
        raise ValueError("That duel is over or was never here.")
    _require_seat(duel, pc_id)
    if duel.phase != "live":
        raise ValueError("That duel is finished.")
    return duel


def _seat_index(state: ArenaState, pc_id: uuid.UUID) -> int:
    """Roster index of a character's seat.

    Args:
        state: The fight.
        pc_id: The character.

    Returns:
        Their roster index.

    Raises:
        PermissionError: If they have no seat in this fight.
    """
    for i, slot in enumerate(state.roster):
        if slot.pc_id == pc_id:
            return i
    raise PermissionError("They're not in that duel.")


def hand_over(db: Session, duel_id: uuid.UUID, pc_id: uuid.UUID, seat_pc_id: uuid.UUID) -> DuelRead:
    """Let the referee play a seat whose person has stepped away (Plan 116).

    You may hand over your own seat at any time, or whoever is up right now —
    a phone that died mid-fight must not stall everybody else. Nobody may
    hand over a seat that is merely waiting its turn.

    Args:
        db: Active database session.
        duel_id: UUID of the duel.
        pc_id: The character asking (the capability).
        seat_pc_id: The seat to hand to the referee.

    Returns:
        The duel after the hand-over (and the turn it plays, if that seat was up).

    Raises:
        ValueError: If the duel is gone or finished, or the engine refuses.
        PermissionError: If the asker has no seat, or it is someone else's
            seat that isn't up.
    """
    duel = _live_or_raise(db, duel_id, pc_id)
    state = _load(duel)
    if seat_pc_id != pc_id and seat_pc_id != _up_pc_id(state):
        raise PermissionError("You can hand over your own seat, or whoever is up right now.")
    state = arena_service.referee_takes(db, state, _seat_index(state, seat_pc_id))
    return _save_and_tell(db, duel, state, pc_id)


def take_back(db: Session, duel_id: uuid.UUID, pc_id: uuid.UUID) -> DuelRead:
    """Play your own seat again after the referee covered it (Plan 116).

    Args:
        db: Active database session.
        duel_id: UUID of the duel.
        pc_id: The character coming back (the capability).

    Returns:
        The duel; this character's next turn waits for them.

    Raises:
        ValueError: If the duel is gone or finished, or the seat was never handed over.
        PermissionError: If that character has no seat.
    """
    duel = _live_or_raise(db, duel_id, pc_id)
    state = _load(duel)
    state = arena_service.player_returns(db, state, _seat_index(state, pc_id))
    return _save_and_tell(db, duel, state, pc_id)


def _save_and_tell(db: Session, duel: Duel, state: ArenaState, pc_id: uuid.UUID) -> DuelRead:
    """Store the fight, close the row if it ended, and nudge every phone.

    Args:
        db: Active database session.
        duel: The duel row.
        state: The fight after the change.
        pc_id: The character who made it.

    Returns:
        The duel as that character sees it.
    """
    duel.state = state_to_json(state)
    if state.phase == "over":
        duel.phase = "over"
    duel = DuelRepo.save(db, duel)
    publish_duel_updated(duel.id, _up_pc_id(state))
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
                seats=[slot.label for slot in state.roster if slot.kind == "pc"],
                your_turn=_up_pc_id(state) == pc_id,
                updated_at=duel.updated_at,
                mode=state.mode,
                boss=next((s.label for s in state.roster if s.kind == "monster"), ""),
            )
        )
    return out
