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
from datetime import UTC, date, datetime
from typing import Any, Optional

from sqlmodel import Session as DBSession

from db.repos.adventure_repo import AdventureRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.encounter_repo import EncounterRepo
from db.repos.item_repo import ItemRepo
from db.repos.monster_repo import MonsterRepo
from db.repos.session_repo import SessionCombatantRepo, SessionRepo, SessionRunbookRepo
from domain.enums import SessionStatus
from domain.session import Session as GameSession
from domain.session import (
    SessionCombatant,
    SessionCombatantUpdate,
    SessionCombatStateRead,
    SessionCombatStateWrite,
    SessionCreate,
    SessionRunbook,
    SessionRunbookCreate,
    SessionRunbookUpdate,
    SessionUpdate,
)
from integrations.event_bus import (
    publish_pc_combat_updated,
    publish_pc_turn_changed,
    publish_session_combat_updated,
)

MAX_SESSIONS_PER_ADVENTURE = 20


def _emit_turn_change(
    db: DBSession,
    previous_active_id: Optional[uuid.UUID],
    new_active_id: Optional[uuid.UUID],
    session_id: uuid.UUID,
    combat_round: int,
) -> None:
    """Emit pc.turn.changed events for previous + new active combatants (Plan 00028).

    If either side maps to a PC (via SessionCombatant.character_id), publish
    a turn-state change event on that PC's topic. Skipped entries (None,
    monsters/NPCs without character_id) silently no-op.

    Args:
        db: Active database session.
        previous_active_id: ID of the combatant whose turn just ended.
        new_active_id: ID of the combatant whose turn just began.
        session_id: UUID of the session.
        combat_round: Current combat round number.
    """
    if previous_active_id and previous_active_id != new_active_id:
        prev = SessionCombatantRepo.get_by_id(db, previous_active_id)
        if prev and prev.character_id:
            publish_pc_turn_changed(prev.character_id, active=False)
    if new_active_id:
        new = SessionCombatantRepo.get_by_id(db, new_active_id)
        if new and new.character_id:
            publish_pc_turn_changed(
                new.character_id,
                active=True,
                session_id=session_id,
                round=combat_round,
                active_combatant_name=new.name,
            )


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


def patch_runbook(
    db: DBSession,
    session_id: uuid.UUID,
    dm_email: str,
    update: SessionRunbookUpdate,
) -> SessionRunbook:
    """Apply a partial update to an existing runbook (Plan 38 inline edit).

    Lets the DM edit any AI-generated field — opening_scene, scenes,
    npc_dialog, encounter_flows, closing_hooks, xp_awards, loot_awards
    — without re-generating the whole runbook. Only fields set on the
    update payload are touched; the rest of the runbook is preserved.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        update: Partial update payload (any subset of runbook fields).

    Returns:
        The updated SessionRunbook.

    Raises:
        ValueError: If the session or runbook does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    get_session(db, session_id, dm_email)  # verify ownership
    runbook = SessionRunbookRepo.get_by_session(db, session_id)
    if runbook is None:
        raise ValueError(f"No runbook saved for session {session_id}.")
    patch = update.model_dump(exclude_unset=True)
    for key, value in patch.items():
        setattr(runbook, key, value)
    db.add(runbook)
    db.commit()
    db.refresh(runbook)
    return runbook


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


# ---------------------------------------------------------------------------
# Session runner helpers — data loading for the live session UI
# ---------------------------------------------------------------------------


def get_campaign_id_for_adventure(db: DBSession, adventure_id: uuid.UUID) -> uuid.UUID:
    """Return the campaign_id for a given adventure.

    Args:
        db: Active database session.
        adventure_id: UUID of the adventure.

    Returns:
        UUID of the parent campaign.

    Raises:
        ValueError: If the adventure does not exist.
    """
    adv = AdventureRepo.get_by_id(db, adventure_id)
    if adv is None:
        raise ValueError(f"Adventure {adventure_id} not found.")
    return adv.campaign_id


def list_pcs_for_campaign(db: DBSession, campaign_id: uuid.UUID) -> list:
    """Return all player characters in a campaign.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.

    Returns:
        List of PlayerCharacter ORM objects.
    """
    return CharacterRepo.list_by_campaign(db, campaign_id)


def list_encounters_for_adventure(db: DBSession, adventure_id: uuid.UUID) -> list:
    """Return all encounters in an adventure.

    Args:
        db: Active database session.
        adventure_id: UUID of the adventure.

    Returns:
        List of Encounter ORM objects.
    """
    return EncounterRepo.list_by_adventure(db, adventure_id)


def get_monsters_by_ids(db: DBSession, monster_ids: list[uuid.UUID]) -> dict:
    """Batch-load monster stat blocks by a list of IDs.

    Args:
        db: Active database session.
        monster_ids: UUIDs of the monsters to fetch.

    Returns:
        Dict mapping monster UUID to MonsterStatBlock (missing IDs omitted).
    """
    result = {}
    for mid in monster_ids:
        monster = MonsterRepo.get_by_id(db, mid)
        if monster:
            result[mid] = monster
    return result


# ---------------------------------------------------------------------------
# Combat persistence — live initiative tracker survives browser refresh
# ---------------------------------------------------------------------------


def load_combat_state(
    db: DBSession, session_id: uuid.UUID, dm_email: str
) -> SessionCombatStateRead:
    """Return the persisted combat state for a session.

    Includes the combatant roster (in initiative order), current round, and
    the id of the combatant whose turn it is.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.

    Returns:
        SessionCombatStateRead with combatants, round, and active combatant id.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = get_session(db, session_id, dm_email)
    combatants = SessionCombatantRepo.list_for_session(db, session_id)
    return SessionCombatStateRead.model_validate(
        {
            "session_id": session_id,
            "round": game_session.combat_round,
            "active_combatant_id": game_session.combat_active_combatant_id,
            "combatants": combatants,
        }
    )


def save_combat_state(
    db: DBSession,
    session_id: uuid.UUID,
    dm_email: str,
    payload: SessionCombatStateWrite,
) -> SessionCombatStateRead:
    """Replace the entire combat state for a session in one transaction.

    Used when fresh initiative is rolled. Existing combatants are removed.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        payload: Full combat snapshot to persist.

    Returns:
        The newly-persisted combat state.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = get_session(db, session_id, dm_email)
    previous_active_id = game_session.combat_active_combatant_id
    created = SessionCombatantRepo.replace_all(db, session_id, payload.combatants)

    # Resolve active_combatant_id — if caller passed an id that doesn't
    # match any new row, fall back to the first combatant (lowest sort_index).
    valid_ids = {row.id for row in created}
    active_id = payload.active_combatant_id if payload.active_combatant_id in valid_ids else None
    if active_id is None and created:
        active_id = created[0].id

    # SessionUpdate doesn't expose combat_* columns, so mutate directly.
    game_session.combat_round = payload.round
    game_session.combat_active_combatant_id = active_id
    db.add(game_session)
    db.commit()
    db.refresh(game_session)

    # Plan 28 — initiative just (re)rolled. The previous active combatant
    # ID likely points at a deleted row (replace_all wipes); guard against
    # that lookup and just emit the new active turn to whoever's up first.
    _emit_turn_change(
        db,
        previous_active_id if previous_active_id in valid_ids else None,
        active_id,
        session_id,
        game_session.combat_round,
    )

    return SessionCombatStateRead.model_validate(
        {
            "session_id": session_id,
            "round": game_session.combat_round,
            "active_combatant_id": game_session.combat_active_combatant_id,
            "combatants": created,
        }
    )


def update_combatant(
    db: DBSession,
    session_id: uuid.UUID,
    combatant_id: uuid.UUID,
    dm_email: str,
    update: SessionCombatantUpdate,
) -> SessionCombatant:
    """Patch a single combatant in a session's tracker.

    Args:
        db: Active database session.
        session_id: UUID of the parent session.
        combatant_id: UUID of the combatant row.
        dm_email: Email of the requesting DM.
        update: Partial update payload.

    Returns:
        Updated SessionCombatant row.

    Raises:
        ValueError: If the session or combatant is not found, or the
            combatant does not belong to the session.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = get_session(db, session_id, dm_email)  # ownership check
    combatant = SessionCombatantRepo.get_by_id(db, combatant_id)
    if combatant is None or combatant.session_id != session_id:
        raise ValueError(f"Combatant {combatant_id} not found in session {session_id}.")
    updated = SessionCombatantRepo.update_one(db, combatant, update)
    # Plan 37 — if this combatant is backed by a PC, fan out a
    # pc.combat.updated event so the player's phone refetches the
    # conditions strip + temp HP.
    if updated.character_id:
        adventure = AdventureRepo.get_by_id(db, game_session.adventure_id)
        if adventure is not None:
            publish_pc_combat_updated(updated.character_id, adventure.campaign_id)
    return updated


def clear_combat_state(db: DBSession, session_id: uuid.UUID, dm_email: str) -> int:
    """Wipe the combatant roster and reset round state for a session.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.

    Returns:
        Number of combatant rows deleted.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = get_session(db, session_id, dm_email)
    # Plan 37 — clear the turn banner for EVERY attending PC, not just the
    # PCs who happen to be in the combatant list right now. Edge case the
    # narrower version missed: a PC was added to combat, became the active
    # combatant (active=True published), was then REMOVED mid-fight by the
    # DM (no active=False published), and now they're not in the combatants
    # list at end-of-combat. Their phone is stuck with a stale active=True.
    # Belt-and-suspenders: publish active=False for the union of (current
    # combatants ∪ attending PCs).
    all_combatants = SessionCombatantRepo.list_for_session(db, session_id)
    combatant_pc_ids: set[uuid.UUID] = {
        c.character_id for c in all_combatants if c.character_id is not None
    }
    attending_pc_ids: set[uuid.UUID] = {
        uuid.UUID(str(pid)) for pid in (game_session.attending_pc_ids or [])
    }
    pc_ids_to_clear: list[uuid.UUID] = list(combatant_pc_ids | attending_pc_ids)
    count = SessionCombatantRepo.clear_for_session(db, session_id)
    game_session.combat_round = 1
    game_session.combat_active_combatant_id = None
    db.add(game_session)
    db.commit()
    for pc_id in pc_ids_to_clear:
        publish_pc_turn_changed(pc_id, active=False)
    # Plan 37 — notify any other HUD tabs / observers that combat is over
    # so they re-hydrate from the now-empty server state.
    adventure = AdventureRepo.get_by_id(db, game_session.adventure_id)
    if adventure is not None:
        publish_session_combat_updated(session_id, adventure.campaign_id)
    return count


def record_item_handout(
    db: DBSession,
    session_id: uuid.UUID,
    pc_id: uuid.UUID,
    item_id: uuid.UUID,
    dm_email: str,
) -> GameSession:
    """Log an item handed from the DM to a PC during a session.

    Appends a single timestamped line to the session's ``actual_notes``,
    format: ``[YYYY-MM-DD HH:MM] Gave <item> to <pc>``. Idempotent only by
    timestamp — clicking twice in the same minute creates two lines, which
    is intentional (DM may give two of the same item).

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        pc_id: UUID of the player character receiving the item.
        item_id: UUID of the magic item being handed out.
        dm_email: Email of the requesting DM.

    Returns:
        Updated GameSession with the appended notes line.

    Raises:
        ValueError: If the session, PC, or item is not found, or if the PC
            does not belong to the same campaign as the session.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = get_session(db, session_id, dm_email)
    item = ItemRepo.get_by_id(db, item_id)
    if item is None:
        raise ValueError(f"Item {item_id} not found.")
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise ValueError(f"Player character {pc_id} not found.")

    # Verify the PC belongs to the same campaign as the session.
    campaign_id = get_campaign_id_for_adventure(db, game_session.adventure_id)
    if pc.campaign_id != campaign_id:
        raise ValueError(f"Player character {pc_id} does not belong to this session's campaign.")

    stamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M")
    line = f"[{stamp}] Gave {item.name} to {pc.character_name}"
    current = game_session.actual_notes or ""
    new_notes = f"{current}\n{line}".strip() if current else line
    updated = SessionRepo.update(db, game_session, SessionUpdate(actual_notes=new_notes))

    # Plan 00019 — also create or increment the PC's inventory row. Import
    # locally to avoid an import cycle (inventory_service imports nothing from
    # session_service, but services/__init__ would otherwise re-export both).
    from services import inventory_service

    inventory_service.add_handout(db, character_id=pc_id, item_id=item_id, dm_email=dm_email)
    return updated


def advance_combat_turn(
    db: DBSession, session_id: uuid.UUID, dm_email: str
) -> SessionCombatStateRead:
    """Advance the turn pointer to the next non-defeated combatant.

    Increments ``combat_round`` when the pointer wraps back to the first
    non-defeated combatant in the initiative order.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.

    Returns:
        Updated combat state.

    Raises:
        ValueError: If the session does not exist or has no combatants.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = get_session(db, session_id, dm_email)
    combatants = SessionCombatantRepo.list_for_session(db, session_id)
    if not combatants:
        raise ValueError("No combatants in tracker — roll initiative first.")

    alive = [c for c in combatants if not c.defeated]
    if not alive:
        # everyone is down — keep the state as-is; caller decides what to do
        return load_combat_state(db, session_id, dm_email)

    current_id = game_session.combat_active_combatant_id
    alive_ids = [c.id for c in alive]
    if current_id not in alive_ids:
        next_idx = 0
    else:
        cur_pos = alive_ids.index(current_id)
        next_idx = (cur_pos + 1) % len(alive)
    next_combatant = alive[next_idx]

    new_round = game_session.combat_round + (1 if next_idx == 0 else 0)
    previous_active_id = current_id
    game_session.combat_round = new_round
    game_session.combat_active_combatant_id = next_combatant.id
    db.add(game_session)
    db.commit()
    db.refresh(game_session)

    _emit_turn_change(db, previous_active_id, next_combatant.id, session_id, new_round)

    return load_combat_state(db, session_id, dm_email)
