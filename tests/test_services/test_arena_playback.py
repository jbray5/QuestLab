"""Plan 105 — the log carries its own turn and its own score.

Plan 103 paced the log; this makes the pacing mean something. Each line says
which creature's turn wrote it, and what everybody's hit points were at that
moment, so the phone can reveal a turn at a time with the bars keeping step.
"""

import pytest
from sqlmodel import Session

from domain.arena import ArenaAction
from domain.enums import CharacterClass
from services import arena_service as arena
from tests.test_services.test_arena_rules import (  # noqa: F401 — fixtures
    _Fixed,
    _foe,
    _owners_table,
    _pc,
    _tidy,
)


def _duel(db):
    """Two characters in the ring, dice pinned high."""
    nya, _ = _pc(db, CharacterClass.SORCERER, level=3, subclass="Wild Magic", score_cha=16)
    thane, _ = _pc(db, CharacterClass.ROGUE, level=3, subclass="Soulknife", score_dex=16)
    return arena.start_duel(db, [nya.id, thane.id])


class TestTheScoreOnEveryLine:
    """A line knows what the hit points were when it was written."""

    def test_a_solo_fight_carries_both_sides(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=40, ac=10).id)

        assert all(line.hp is not None and len(line.hp) == 2 for line in st.log)
        assert st.log[-1].hp == [st.pc.hp, st.foe.hp]

    def test_a_roster_fight_carries_everybody(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = _duel(duckdb_session)
        assert all(len(line.hp or []) == len(st.roster) for line in st.log)

    def test_the_blow_lands_on_the_line_that_describes_it(
        self, duckdb_session: Session, monkeypatch
    ):
        """The defender's hit points drop on the attack line, not before it."""
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = _duel(duckdb_session)
        target = st.target_index
        opening = st.log[-1].hp[target]

        swing = next(a for a in st.pc.attacks if a.cost == "action" and a.damage != "0")
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key=swing.key))

        # Whatever was already on screen still reads the old score...
        assert st.log[0].hp[target] == opening
        # ...and the last line of the swing reads the new one.
        assert st.log[-1].hp[target] < opening
        assert st.log[-1].hp[target] == st.roster[target].pc.hp

    def test_a_monsters_turn_does_not_put_its_own_score_on_its_victim(
        self, duckdb_session: Session, monkeypatch
    ):
        """The aliasing trap from Plan 101, now also reachable through the log.

        On a monster's turn the working set inverts — the defender rides as
        ``pc`` and the monster as ``foe`` — so a snapshot that trusted
        ``target_index`` would hand the monster's hit points to the character
        it just hit.
        """
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, _ = _pc(duckdb_session, CharacterClass.SORCERER, level=3, score_cha=16)
        creed, _ = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
        boss = _foe(duckdb_session, hp=200, ac=30, name="The Wall")
        st = arena.start_boss(duckdb_session, [creed.id, nya.id], boss.id, controlled=creed.id)

        boss_index = next(i for i, s in enumerate(st.roster) if s.kind == "monster")
        for _ in range(3):
            if st.phase == "over":
                break
            st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))

        # Nobody but the boss ever shows the boss's hit points, and no character
        # is ever recorded above their own maximum.
        for line in st.log:
            for i, hp in enumerate(line.hp or []):
                slot = st.roster[i]
                if slot.kind == "pc":
                    assert hp <= slot.pc.hp_max, f"{slot.label} logged {hp} HP on: {line.text}"
        assert st.log[-1].hp[boss_index] == st.roster[boss_index].foe.hp


class TestBeats:
    """One creature's turn is one chunk of playback."""

    def test_every_line_of_one_turn_shares_a_beat(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = _duel(duckdb_session)
        opening = st.log[-1].beat

        swing = next(a for a in st.pc.attacks if a.cost == "action" and a.damage != "0")
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key=swing.key))
        assert {line.beat for line in st.log if line.beat >= opening} == {
            opening
        }, "acting inside your own turn does not start a new one"

        before = len(st.log)
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        assert all(line.beat > opening for line in st.log[before:]), "handing over starts a beat"

    def test_a_boss_battle_splits_into_one_beat_per_creature(
        self, duckdb_session: Session, monkeypatch
    ):
        """Ending your turn plays the ally and the boss — each its own chunk."""
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, _ = _pc(duckdb_session, CharacterClass.SORCERER, level=3, score_cha=16)
        creed, _ = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
        boss = _foe(duckdb_session, hp=400, ac=10, name="The Revelmaster")
        st = arena.start_boss(duckdb_session, [creed.id, nya.id], boss.id, controlled=creed.id)

        before = len(st.log)
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        fresh = [line.beat for line in st.log[before:]]
        assert len(set(fresh)) >= 2, "the ally's turn and the boss's are separate chunks"
        assert fresh == sorted(fresh), "beats only ever move forward"

    def test_a_solo_fight_separates_your_turn_from_the_foes(
        self, duckdb_session: Session, monkeypatch
    ):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=400, ac=30).id)

        before = len(st.log)
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        fresh = [line.beat for line in st.log[before:]]
        assert fresh, "the foe's turn wrote something"
        assert min(fresh) > st.log[before - 1].beat, "the foe's turn is its own chunk"
        if st.phase != "over":
            assert max(fresh) > min(fresh), "and rolling back round to you is another"


@pytest.mark.parametrize("mode", ["solo", "duel"])
def test_the_log_never_goes_backwards(duckdb_session: Session, monkeypatch, mode):
    """Beats are monotonic, which is what lets the phone walk them in order."""
    monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
    if mode == "solo":
        pc, _dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=300, ac=30).id)
    else:
        st = _duel(duckdb_session)
    for _ in range(4):
        if st.phase == "over":
            break
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
    beats = [line.beat for line in st.log]
    assert beats == sorted(beats)
