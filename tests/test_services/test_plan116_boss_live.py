"""Plan 116 — boss battles with everyone on their own phone.

Plan 104 put duels on separate devices. A boss battle was still one phone: the
holder drove one character and the referee played the rest. Now every
character can be played by its own person, the referee plays only the
monster, a seat whose phone died can be handed to the referee, and a heal can
land on a friend.
"""

import pytest
from sqlmodel import Session

from domain.arena import ArenaAction
from domain.enums import CharacterClass
from services import arena_service as arena
from services import duel_service
from tests.test_services.test_arena_rules import (  # noqa: F401 — fixtures
    _MADE,
    _Fixed,
    _foe,
    _learn,
    _owners_table,
    _spell,
    _tidy,
)
from tests.test_services.test_duel_service import _table


@pytest.fixture(autouse=True)
def _steady_dice(monkeypatch):
    """Fix the dice so a scripted fight lands the same way every run."""
    monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))


class _Last(_Fixed):
    """Max faces, but a choice always takes the last option."""

    def choice(self, seq):
        return seq[-1]


def _boss(db, hp=400):
    """A boss that hits softly, so a scripted fight doesn't end on its own."""
    return _foe(
        db,
        hp=hp,
        ac=10,
        name="The Revelmaster",
        actions=[{"name": "Slap", "desc": "+0 to hit, 1d1 bludgeoning"}],
    )


def _index_of(state, pc_id) -> int:
    return next(i for i, slot in enumerate(state.roster) if slot.pc_id == pc_id)


class TestEveryoneOnTheirOwnPhone:
    """The party against one monster, each player taking their own turns."""

    def test_nobody_is_auto_but_the_boss(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        boss = _boss(duckdb_session)
        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id], boss.id)

        st = duel.state
        assert st.mode == "boss"
        people = [s for s in st.roster if s.kind == "pc"]
        monsters = [s for s in st.roster if s.kind == "monster"]
        assert len(people) == 2 and not any(s.auto for s in people)
        assert len(monsters) == 1 and monsters[0].auto and monsters[0].team == 1
        assert all(s.team == 0 for s in people), "the party is one side"
        assert duel.up_pc_id in (nya.id, thane.id), "a person is always up, never the boss"

    def test_only_the_seat_that_is_up_may_act(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        duel = duel_service.start(
            duckdb_session, nya.id, [nya.id, thane.id], _boss(duckdb_session).id
        )
        waiting = next(s.pc_id for s in duel.seats if s.pc_id != duel.up_pc_id)
        with pytest.raises(PermissionError, match="turn"):
            duel_service.act(duckdb_session, duel.id, waiting, ArenaAction(kind="end_turn"))

    def test_the_boss_takes_its_turn_between_the_people(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        boss = _boss(duckdb_session)
        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id], boss.id)
        for _ in range(4):
            duel = duel_service.act(
                duckdb_session, duel.id, duel.up_pc_id, ArenaAction(kind="end_turn")
            )
            assert duel.up_pc_id in (nya.id, thane.id)
        slaps = [line for line in duel.state.log if "Slap" in line.text]
        assert len(slaps) >= 2, "the referee played the boss round after round"
        assert duel.state.round >= 3

    def test_the_banner_says_it_is_a_boss_fight(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        boss = _boss(duckdb_session)
        duel_service.start(duckdb_session, nya.id, [nya.id, thane.id], boss.id)

        (call,) = duel_service.called_for(duckdb_session, thane.id)
        assert call.mode == "boss"
        assert call.boss.startswith("The Revelmaster")
        assert set(call.seats) == {"Duellist 1", "Duellist 2"}, "only the people, not the boss"

    def test_an_unknown_boss_is_refused(self, duckdb_session: Session):
        import uuid

        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        with pytest.raises(ValueError, match="not found"):
            duel_service.start(duckdb_session, nya.id, [nya.id, thane.id], uuid.uuid4())


class TestTheBossSpreadsItsHits:
    """It used to swing at the first seat every single turn."""

    def test_the_boss_picks_its_victim(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Last(high=True))
        nya, thane, creed = _table(
            duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE, CharacterClass.PALADIN
        )
        st = arena.start_boss(
            duckdb_session, [nya.id, thane.id, creed.id], _boss(duckdb_session).id, None
        )
        boss_index = next(i for i, s in enumerate(st.roster) if s.kind == "monster")
        # Walk the turn order to the boss and check who it went for.
        st.turn = st.order.index(boss_index)
        arena._draw(st)
        assert st.target_index == _index_of(st, creed.id), "a choice, not always seat one"


class TestSteppingAway:
    """A phone dies mid-fight. Everybody else must not be stuck."""

    def test_whoever_is_up_can_be_handed_to_the_referee(self, duckdb_session: Session):
        nya, thane, creed = _table(
            duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE, CharacterClass.PALADIN
        )
        duel = duel_service.start(
            duckdb_session, nya.id, [nya.id, thane.id, creed.id], _boss(duckdb_session).id
        )
        gone = duel.up_pc_id
        helper = next(s.pc_id for s in duel.seats if s.pc_id != gone)

        duel = duel_service.hand_over(duckdb_session, duel.id, helper, gone)

        slot = duel.state.roster[_index_of(duel.state, gone)]
        assert slot.auto, "the referee plays them now"
        assert duel.up_pc_id != gone, "their turn was played and the fight moved on"
        assert any("referee plays" in line.text for line in duel.state.log)

    def test_a_seat_that_is_only_waiting_cannot_be_taken(self, duckdb_session: Session):
        nya, thane, creed = _table(
            duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE, CharacterClass.PALADIN
        )
        duel = duel_service.start(
            duckdb_session, nya.id, [nya.id, thane.id, creed.id], _boss(duckdb_session).id
        )
        up = duel.up_pc_id
        others = [s.pc_id for s in duel.seats if s.pc_id != up]
        with pytest.raises(PermissionError, match="your own seat"):
            duel_service.hand_over(duckdb_session, duel.id, others[0], others[1])

    def test_you_can_hand_over_yourself_and_come_back(self, duckdb_session: Session):
        nya, thane, creed = _table(
            duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE, CharacterClass.PALADIN
        )
        duel = duel_service.start(
            duckdb_session, nya.id, [nya.id, thane.id, creed.id], _boss(duckdb_session).id
        )
        me = next(s.pc_id for s in duel.seats if s.pc_id != duel.up_pc_id)
        duel = duel_service.hand_over(duckdb_session, duel.id, me, me)
        assert duel.state.roster[_index_of(duel.state, me)].auto

        duel = duel_service.take_back(duckdb_session, duel.id, me)
        assert not duel.state.roster[_index_of(duel.state, me)].auto
        with pytest.raises(ValueError, match="already playing"):
            duel_service.take_back(duckdb_session, duel.id, me)

    def test_the_last_person_cannot_leave_the_referee_alone(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        duel = duel_service.start(
            duckdb_session, nya.id, [nya.id, thane.id], _boss(duckdb_session).id
        )
        first = next(s.pc_id for s in duel.seats if s.pc_id != duel.up_pc_id)
        duel = duel_service.hand_over(duckdb_session, duel.id, first, first)
        last = next(s.pc_id for s in duel.seats if s.pc_id != first)
        with pytest.raises(ValueError, match="stay in the fight"):
            duel_service.hand_over(duckdb_session, duel.id, last, last)


def _up_as(db, st, pc_id):
    """End turns until ``pc_id`` is up (the soft boss never ends the fight)."""
    for _ in range(12):
        if st.roster[st.order[st.turn]].pc_id == pc_id:
            return st
        st = arena.act(db, st, ArenaAction(kind="end_turn"))
    raise AssertionError("never came round")


class TestHealingAFriend:
    """Co-op is the point of a party fight."""

    def test_lay_on_hands_on_a_friend(self, duckdb_session: Session):
        creed, nya = _table(duckdb_session, CharacterClass.PALADIN, CharacterClass.SORCERER)
        st = arena.start_boss(duckdb_session, [creed.id, nya.id], _boss(duckdb_session).id, None)
        st = _up_as(duckdb_session, st, creed.id)
        friend = _index_of(st, nya.id)
        st.roster[friend].pc.hp = 10
        mine = st.pc.hp
        arena._seal(st)

        st = arena.act(
            duckdb_session, st, ArenaAction(kind="feature", key="lay_on_hands", target=friend)
        )
        assert st.roster[friend].pc.hp == 15, "five points from the pool, on Nya"
        assert st.pc.hp == mine, "not on Creed"
        assert st.target_index is not None and st.roster[st.target_index].kind == "monster"
        assert any("Duellist 2 is at 15" in line.text for line in st.log)

    def test_a_healing_spell_gets_a_friend_back_up(self, duckdb_session: Session):
        creed, nya = _table(duckdb_session, CharacterClass.PALADIN, CharacterClass.SORCERER)
        dm = next(email for cid, email in _MADE if cid == creed.campaign_id)
        _learn(
            duckdb_session,
            creed,
            dm,
            _spell(duckdb_session, "Cure Wounds", 1, ["Paladin", "Cleric"]),
        )
        st = arena.start_boss(duckdb_session, [creed.id, nya.id], _boss(duckdb_session).id, None)
        st = _up_as(duckdb_session, st, creed.id)
        friend = _index_of(st, nya.id)
        st.roster[friend].pc.hp = 0
        arena._seal(st)

        cure = next(a for a in st.pc.attacks if a.name == "Cure Wounds")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=cure.key, target=friend))
        assert st.roster[friend].pc.hp > 0
        assert any("Back on their feet" in line.text for line in st.log)

    def test_a_heal_cannot_be_aimed_at_the_boss(self, duckdb_session: Session):
        """Aiming a heal at the other side just aims; the heal lands on you."""
        creed, nya = _table(duckdb_session, CharacterClass.PALADIN, CharacterClass.SORCERER)
        st = arena.start_boss(duckdb_session, [creed.id, nya.id], _boss(duckdb_session).id, None)
        st = _up_as(duckdb_session, st, creed.id)
        boss_index = next(i for i, s in enumerate(st.roster) if s.kind == "monster")
        st.pc.hp = 10
        boss_hp = st.roster[boss_index].foe.hp
        arena._seal(st)

        st = arena.act(
            duckdb_session, st, ArenaAction(kind="feature", key="lay_on_hands", target=boss_index)
        )
        assert st.pc.hp == 15 and st.roster[boss_index].foe.hp == boss_hp
