"""Tests for Plan 00028 — turn-state lookup + event emissions on combat advance."""

import queue
import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.player_service as play_svc
import services.session_service as sess_svc
from domain.enums import CharacterClass
from domain.session import SessionCombatantCreate, SessionCombatStateWrite
from integrations.event_bus import event_bus


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _setup_session_with_pc(db: Session):
    """Spin up DM → campaign → adventure → session → one PC + one NPC combatant."""
    dm = _dm()
    campaign = camp_svc.create_campaign(db, name="C", setting="R", tone="T", dm_email=dm)
    adventure = adv_svc.create_adventure(
        db,
        campaign_id=campaign.id,
        title="Adv",
        synopsis="s",
        tier="Tier1",
        act_count=3,
        dm_email=dm,
    )
    game_session = sess_svc.create_session(
        db,
        adventure_id=adventure.id,
        session_number=1,
        title="S1",
        dm_email=dm,
        date_planned=None,
        attending_pc_ids=[],
    )
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Hero",
        race="Human",
        character_class=CharacterClass.FIGHTER,
        level=3,
        score_str=14,
        score_dex=14,
        score_con=14,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=24,
        hp_current=24,
        ac=15,
        speed=30,
    )
    return dm, campaign, adventure, game_session, pc


def _seed_combat(db, session_id, dm, pc_id, *, active_is_pc: bool = True):
    """Persist a 2-combatant tracker (combat running): the PC + a goblin NPC.

    With combat_state="running" and no explicit active_combatant_id,
    save_combat_state picks the lowest-sort_index combatant as active, so we
    control "who goes first" by swapping the sort_index per ``active_is_pc``.
    """
    pc_sort = 0 if active_is_pc else 1
    npc_sort = 1 if active_is_pc else 0
    pc_combatant = SessionCombatantCreate(
        sort_index=pc_sort,
        name="Hero",
        dex_score=14,
        initiative_roll=18,
        hp_current=24,
        hp_max=24,
        type="pc",
        character_id=pc_id,
    )
    npc_combatant = SessionCombatantCreate(
        sort_index=npc_sort,
        name="Goblin",
        dex_score=14,
        initiative_roll=12,
        hp_current=7,
        hp_max=7,
        type="monster",
    )
    payload = SessionCombatStateWrite(
        round=1,
        combat_state="running",
        active_combatant_id=None,
        combatants=[pc_combatant, npc_combatant],
    )
    return sess_svc.save_combat_state(db, session_id, dm, payload)


class TestTurnStateLookup:
    """player_service.turn_state finds the active session for a PC."""

    def test_no_active_combat(self, duckdb_session: Session):
        """Fresh PC with no combat → active=False."""
        dm, _c, _a, _s, pc = _setup_session_with_pc(duckdb_session)
        del dm  # unused
        result = play_svc.turn_state(duckdb_session, pc.id)
        assert result == {"active": False}

    def test_pc_is_active_combatant(self, duckdb_session: Session):
        """PC is at sort_index 0 → turn_state.active is True."""
        dm, _c, _a, game_session, pc = _setup_session_with_pc(duckdb_session)
        _seed_combat(duckdb_session, game_session.id, dm, pc.id, active_is_pc=True)

        result = play_svc.turn_state(duckdb_session, pc.id)
        assert result["active"] is True
        assert result["session_id"] == str(game_session.id)
        assert result["round"] == 1
        assert result["active_combatant_name"] == "Hero"

    def test_pc_not_active_combatant(self, duckdb_session: Session):
        """PC exists in tracker but a goblin is up → active=False."""
        dm, _c, _a, game_session, pc = _setup_session_with_pc(duckdb_session)
        _seed_combat(duckdb_session, game_session.id, dm, pc.id, active_is_pc=False)

        result = play_svc.turn_state(duckdb_session, pc.id)
        assert result == {"active": False}

    def test_unknown_pc_raises(self, duckdb_session: Session):
        """Bad pcId raises ValueError → 404 at the API layer."""
        with pytest.raises(ValueError):
            play_svc.turn_state(duckdb_session, uuid.uuid4())


class TestTurnChangeEvents:
    """advance_combat_turn / save_combat_state / clear_combat_state emit pc.turn.changed."""

    def test_advance_emits_turn_active_when_pc_is_next(self, duckdb_session: Session):
        """Advance from NPC → PC publishes pc.turn.changed (active=True) on pc:{id}."""
        dm, _c, _a, game_session, pc = _setup_session_with_pc(duckdb_session)
        # Seed with goblin up first; PC second.
        _seed_combat(duckdb_session, game_session.id, dm, pc.id, active_is_pc=False)

        q = event_bus.subscribe([f"pc:{pc.id}"])
        try:
            sess_svc.advance_combat_turn(duckdb_session, game_session.id, dm)
            # Drain — we expect one or more events; the most recent should be turn-active=True.
            received = []
            while True:
                try:
                    received.append(q.get_nowait())
                except queue.Empty:
                    break
            turn_events = [e for e in received if e["type"] == "pc.turn.changed"]
            assert any(e["active"] is True for e in turn_events)
        finally:
            event_bus.unsubscribe([f"pc:{pc.id}"], q)

    def test_advance_emits_turn_inactive_when_pc_was_up(self, duckdb_session: Session):
        """Advance from PC → NPC publishes pc.turn.changed (active=False)."""
        dm, _c, _a, game_session, pc = _setup_session_with_pc(duckdb_session)
        # PC up first; goblin second.
        _seed_combat(duckdb_session, game_session.id, dm, pc.id, active_is_pc=True)

        q = event_bus.subscribe([f"pc:{pc.id}"])
        try:
            sess_svc.advance_combat_turn(duckdb_session, game_session.id, dm)
            received = []
            while True:
                try:
                    received.append(q.get_nowait())
                except queue.Empty:
                    break
            turn_events = [e for e in received if e["type"] == "pc.turn.changed"]
            assert any(e["active"] is False for e in turn_events)
        finally:
            event_bus.unsubscribe([f"pc:{pc.id}"], q)

    def test_clear_combat_emits_turn_inactive(self, duckdb_session: Session):
        """clear_combat_state emits turn-inactive for the PC that was up."""
        dm, _c, _a, game_session, pc = _setup_session_with_pc(duckdb_session)
        _seed_combat(duckdb_session, game_session.id, dm, pc.id, active_is_pc=True)

        q = event_bus.subscribe([f"pc:{pc.id}"])
        try:
            sess_svc.clear_combat_state(duckdb_session, game_session.id, dm)
            received = []
            while True:
                try:
                    received.append(q.get_nowait())
                except queue.Empty:
                    break
            turn_events = [e for e in received if e["type"] == "pc.turn.changed"]
            assert any(e["active"] is False for e in turn_events)
        finally:
            event_bus.unsubscribe([f"pc:{pc.id}"], q)

    def test_save_combat_emits_turn_active_for_new_first(self, duckdb_session: Session):
        """Initiative roll that puts the PC first → emits turn-active on pc:{id}."""
        dm, _c, _a, game_session, pc = _setup_session_with_pc(duckdb_session)

        q = event_bus.subscribe([f"pc:{pc.id}"])
        try:
            _seed_combat(duckdb_session, game_session.id, dm, pc.id, active_is_pc=True)
            received = []
            while True:
                try:
                    received.append(q.get_nowait())
                except queue.Empty:
                    break
            turn_events = [e for e in received if e["type"] == "pc.turn.changed"]
            assert any(e["active"] is True for e in turn_events)
        finally:
            event_bus.unsubscribe([f"pc:{pc.id}"], q)
