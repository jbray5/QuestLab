"""Plan 41 regression tests — combat lifecycle, incremental roster, order, beat survival.

These lock the fixes for the bugs that sent the DM back to pencil-and-paper in
Session 2: roster edits wiping round/conditions/beats, false "it's your turn"
pings, stale combat leaking across sessions, divergent turn order, and the
spurious round bump when the active combatant is defeated/removed.
"""

import queue
import uuid

from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.combat_beat_service as beat_svc
import services.player_service as play_svc
import services.session_service as sess_svc
from domain.combat_beat import CombatBeatCreate, CombatBeatTrigger
from domain.enums import CharacterClass
from domain.session import SessionCombatantCreate, SessionCombatantUpdate, SessionCombatStateWrite
from integrations.event_bus import event_bus


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _campaign_and_session(db: Session, dm: str):
    """Create DM → campaign → adventure → session (Draft)."""
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
    return campaign, adventure, game_session


def _make_pc(db: Session, campaign_id: uuid.UUID, dm: str, name: str = "Hero"):
    return char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm,
        player_name="P",
        character_name=name,
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


def _combatant(sort_index, name, initiative, *, dex=14, hp=20, ctype="monster", character_id=None):
    return SessionCombatantCreate(
        sort_index=sort_index,
        name=name,
        dex_score=dex,
        initiative_roll=initiative,
        hp_current=hp,
        hp_max=hp,
        type=ctype,
        character_id=character_id,
    )


def _run(db, session_id, dm, combatants, active=None, rnd=1):
    return sess_svc.save_combat_state(
        db,
        session_id,
        dm,
        SessionCombatStateWrite(
            round=rnd,
            combat_state="running",
            active_combatant_id=active,
            combatants=combatants,
        ),
    )


def _drain(q) -> list[dict]:
    out = []
    while True:
        try:
            out.append(q.get_nowait())
        except queue.Empty:
            return out


class TestLifecycleState:
    """save_combat_state honors combat_state; player pings only fire when running."""

    def test_seed_idle_has_no_active_and_pings_no_one(self, duckdb_session: Session):
        """Seeding a prep roster (idle) sets no active combatant and pings nobody.

        This is the false-'it's your turn!' fix: the End-Combat auto-reseed
        used to set an active PC and buzz their phone.
        """
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        pc = _make_pc(duckdb_session, campaign.id, dm)

        q = event_bus.subscribe([f"pc:{pc.id}"])
        try:
            state = sess_svc.save_combat_state(
                duckdb_session,
                gs.id,
                dm,
                SessionCombatStateWrite(
                    combat_state="idle",
                    combatants=[_combatant(0, "Hero", 18, ctype="pc", character_id=pc.id)],
                ),
            )
            events = _drain(q)
        finally:
            event_bus.unsubscribe([f"pc:{pc.id}"], q)

        assert state.combat_state == "idle"
        assert state.active_combatant_id is None
        turn_active = [e for e in events if e.get("type") == "pc.turn.changed" and e.get("active")]
        assert turn_active == []

    def test_running_sets_active_and_pings(self, duckdb_session: Session):
        """Rolling initiative (running) selects the first combatant and pings the PC."""
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        pc = _make_pc(duckdb_session, campaign.id, dm)

        q = event_bus.subscribe([f"pc:{pc.id}"])
        try:
            state = _run(
                duckdb_session,
                gs.id,
                dm,
                [_combatant(0, "Hero", 18, ctype="pc", character_id=pc.id)],
            )
            events = _drain(q)
        finally:
            event_bus.unsubscribe([f"pc:{pc.id}"], q)

        assert state.combat_state == "running"
        assert state.active_combatant_id == state.combatants[0].id
        assert any(e.get("type") == "pc.turn.changed" and e.get("active") for e in events)

    def test_complete_session_ends_combat_and_stops_leak(self, duckdb_session: Session):
        """Completing a session mid-fight clears combat so the NEXT session is clean.

        Stale-leak fix: player combat/turn lookups filter combat_state=='running',
        and advancing to Complete flips it to 'ended'.
        """
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        pc = _make_pc(duckdb_session, campaign.id, dm)
        _run(duckdb_session, gs.id, dm, [_combatant(0, "Hero", 18, ctype="pc", character_id=pc.id)])

        # Sanity: while running, the player IS in combat and it's their turn.
        assert play_svc.combat_state(duckdb_session, pc.id)["in_combat"] is True
        assert play_svc.turn_state(duckdb_session, pc.id)["active"] is True

        # Draft → Ready → InProgress → Complete.
        for _ in range(3):
            gs = sess_svc.advance_status(duckdb_session, gs.id, dm)

        assert gs.combat_state == "ended"
        assert play_svc.combat_state(duckdb_session, pc.id)["in_combat"] is False
        assert play_svc.turn_state(duckdb_session, pc.id) == {"active": False}


class TestIncrementalRoster:
    """add_combatant / remove_combatant preserve the fight in progress."""

    def test_add_preserves_round_active_and_orders_newcomer(self, duckdb_session: Session):
        """A mid-fight add keeps round + active pointer and slots the newcomer by initiative."""
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        _run(
            duckdb_session,
            gs.id,
            dm,
            [_combatant(0, "Alpha", 20), _combatant(1, "Beta", 10)],
        )
        # Advance to round 2, Beta up.
        sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)  # -> Beta
        before = sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)  # wrap -> Alpha, round 2
        assert before.round == 2
        active_before = before.active_combatant_id

        after = sess_svc.add_combatant(
            duckdb_session, gs.id, dm, _combatant(99, "Reinforcement", 15)
        )

        assert after.round == 2  # NOT reset to 1
        assert after.active_combatant_id == active_before  # turn pointer intact
        assert [c.name for c in after.combatants] == ["Alpha", "Reinforcement", "Beta"]

    def test_add_preserves_existing_combat_beats(self, duckdb_session: Session):
        """The session-3 bug: adding a combatant must NOT cascade-delete HP beats."""
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        state = _run(duckdb_session, gs.id, dm, [_combatant(0, "Wenneth", 12, hp=50)])
        boss_id = state.combatants[0].id
        beat_svc.create(
            duckdb_session,
            gs.id,
            CombatBeatCreate(
                combatant_id=boss_id,
                trigger_kind=CombatBeatTrigger.HP_LTE,
                trigger_value=25,
                text="The bark stills. She finds Thane's face.",
                sort_index=0,
            ),
            dm,
        )
        assert len(beat_svc.list_for_session(duckdb_session, gs.id, dm)) == 1

        sess_svc.add_combatant(duckdb_session, gs.id, dm, _combatant(1, "Willa", 19, ctype="pc"))

        beats = beat_svc.list_for_session(duckdb_session, gs.id, dm)
        assert len(beats) == 1  # survived the roster edit
        assert beats[0].combatant_id == boss_id

    def test_remove_active_advances_pointer_and_keeps_round(self, duckdb_session: Session):
        """Removing whoever is up advances the pointer to the next living combatant."""
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        state = _run(
            duckdb_session,
            gs.id,
            dm,
            [_combatant(0, "Alpha", 20), _combatant(1, "Beta", 15), _combatant(2, "Gamma", 10)],
            rnd=3,
        )
        active_first = state.active_combatant_id
        assert active_first == state.combatants[0].id  # Alpha up

        after = sess_svc.remove_combatant(duckdb_session, gs.id, active_first, dm)

        assert after.round == 3  # preserved
        assert [c.name for c in after.combatants] == ["Beta", "Gamma"]
        assert after.active_combatant_id == after.combatants[0].id  # Beta now up


class TestTurnAdvance:
    """advance_combat_turn — defeated/removed active must not spuriously bump the round."""

    def test_defeated_active_skips_without_round_bump(self, duckdb_session: Session):
        """Kill the active combatant, End Turn → next combatant, round unchanged."""
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        state = _run(
            duckdb_session,
            gs.id,
            dm,
            [_combatant(0, "Alpha", 20), _combatant(1, "Beta", 15), _combatant(2, "Gamma", 10)],
        )
        assert state.round == 1
        # Alpha (active) is defeated.
        sess_svc.update_combatant(
            duckdb_session, gs.id, state.combatants[0].id, dm, SessionCombatantUpdate(defeated=True)
        )

        after = sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)

        assert after.active_combatant_id == state.combatants[1].id  # Beta
        assert after.round == 1  # NOT bumped to 2

    def test_genuine_wrap_bumps_round(self, duckdb_session: Session):
        """Last combatant → first still advances the round."""
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        state = _run(
            duckdb_session,
            gs.id,
            dm,
            [_combatant(0, "Alpha", 20), _combatant(1, "Beta", 10)],
        )
        sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)  # Alpha -> Beta
        wrapped = sess_svc.advance_combat_turn(duckdb_session, gs.id, dm)  # Beta -> Alpha
        assert wrapped.round == 2
        assert wrapped.active_combatant_id == state.combatants[0].id


class TestInitiativeOrder:
    """An initiative edit reseats sort order so the server turn walk matches the display."""

    def test_initiative_edit_recomputes_order(self, duckdb_session: Session):
        """Editing a combatant's initiative moves it in the turn order."""
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        state = _run(
            duckdb_session,
            gs.id,
            dm,
            [_combatant(0, "Big", 20), _combatant(1, "Small", 5)],
        )
        assert [c.name for c in state.combatants] == ["Big", "Small"]
        small_id = state.combatants[1].id

        sess_svc.update_combatant(
            duckdb_session, gs.id, small_id, dm, SessionCombatantUpdate(initiative_roll=30)
        )

        reordered = sess_svc.load_combat_state(duckdb_session, gs.id, dm)
        assert [c.name for c in reordered.combatants] == ["Small", "Big"]
