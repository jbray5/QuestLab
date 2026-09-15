"""Plan 101 — fights of more than two: hot-seat duels and boss battles.

The engine holds one actor and one target at a time. A bigger fight stows the
acting creature back onto the roster and draws the next, so every rule already
written keeps applying. These tests hold that contract down.
"""

import pytest
from sqlmodel import Session

from domain.arena import ArenaAction
from domain.enums import CharacterClass
from services import arena_service as arena
from tests.test_services.test_arena_rules import (  # noqa: F401 — fixtures
    _Fixed,
    _foe,
    _learn,
    _owners_table,
    _pc,
    _Seq,
    _spell,
    _tidy,
)


def _two(db):
    """A sorcerer and a rogue — Chelsea's ask, in miniature."""
    nya, _ = _pc(db, CharacterClass.SORCERER, level=3, subclass="Wild Magic", score_cha=16)
    thane, _ = _pc(db, CharacterClass.ROGUE, level=3, subclass="Soulknife", score_dex=16)
    return nya, thane


class TestADuel:
    """Two characters, one device, passed back and forth."""

    def test_initiative_is_rolled_and_everyone_is_on_the_roster(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, thane = _two(duckdb_session)
        st = arena.start_duel(duckdb_session, [nya.id, thane.id])

        assert st.mode == "duel" and len(st.roster) == 2
        assert sorted(st.order) == [0, 1] and st.turn == 0
        assert all(slot.kind == "pc" and not slot.auto for slot in st.roster)
        # Free-for-all: each side is its own team, so each is the other's enemy.
        assert st.roster[0].team != st.roster[1].team
        assert any("Initiative" in line.text for line in st.log)

    def test_fewer_than_two_is_refused(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, _thane = _two(duckdb_session)
        with pytest.raises(ValueError, match="at least two"):
            arena.start_duel(duckdb_session, [nya.id])

    def test_ending_a_turn_hands_over_instead_of_auto_playing(self, duckdb_session, monkeypatch):
        """Nobody is auto in a duel, so the turn stops at the next human."""
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, thane = _two(duckdb_session)
        st = arena.start_duel(duckdb_session, [nya.id, thane.id])
        first = st.order[st.turn]

        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        second = st.order[st.turn]
        assert second != first, "the turn passed to the other character"
        assert st.phase == "your_turn"
        assert any("you're up" in line.text for line in st.log)

        # And back again, which is a new round.
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        assert st.order[st.turn] == first and st.round == 2

    def test_each_side_keeps_its_own_hit_points(self, duckdb_session: Session, monkeypatch):
        """Damage lands on the target's own record, not the working copy."""
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, thane = _two(duckdb_session)
        st = arena.start_duel(duckdb_session, [nya.id, thane.id])

        actor = st.order[st.turn]
        target_index = st.target_index
        before = st.roster[target_index].pc.hp
        swing = next(a for a in st.pc.attacks if a.cost == "action" and a.damage != "0")
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key=swing.key))

        after = st.roster[target_index].pc.hp
        assert after < before, "the target took the hit"
        assert st.order[st.turn] == actor, "still the attacker's turn"

    def test_a_characters_own_slots_survive_the_other_turn(self, duckdb_session, monkeypatch):
        """Spend a slot, hand over, come back — it is still spent."""
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, thane = _two(duckdb_session)
        st = arena.start_duel(duckdb_session, [nya.id, thane.id])
        # Put the sorcerer up first whichever way initiative fell.
        while st.roster[st.order[st.turn]].pc.character_class.lower() != "sorcerer":
            st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))

        me = st.order[st.turn]
        before = dict(st.pc.slots)
        st = arena.act(
            duckdb_session, st, ArenaAction(kind="feature", key="create_slot", slot_level=1)
        )
        spent = dict(st.roster[me].pc.slots) if st.roster[me].pc else {}
        assert spent != before, "Font of Magic changed the sorcerer's slots"

        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        assert st.order[st.turn] == me, "back round to the sorcerer"
        assert dict(st.pc.slots) == spent, "their own slots came back with them"


class TestABossBattle:
    """Cory's ask: pick your own actions, the referee plays your friends."""

    def test_the_party_stands_with_you_and_only_you_choose(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, thane = _two(duckdb_session)
        boss = _foe(duckdb_session, hp=90, ac=10, name="The Revelmaster")
        st = arena.start_boss(duckdb_session, [nya.id, thane.id], boss.id, controlled=nya.id)

        assert st.mode == "boss" and len(st.roster) == 3
        party = [s for s in st.roster if s.kind == "pc"]
        assert {s.team for s in party} == {0}, "the party shares a side"
        assert sum(1 for s in party if not s.auto) == 1, "exactly one character is yours"
        assert st.roster[-1].kind == "monster" and st.roster[-1].auto

    def test_it_stops_on_your_turn_and_plays_everyone_else(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, thane = _two(duckdb_session)
        boss = _foe(duckdb_session, hp=400, ac=10, name="The Revelmaster")
        st = arena.start_boss(duckdb_session, [nya.id, thane.id], boss.id, controlled=nya.id)

        # Whoever is up when the fight opens must be the one character we drive.
        assert not st.roster[st.order[st.turn]].auto
        controlled = st.order[st.turn]

        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        # The ally and the boss both acted before control came back.
        assert st.order[st.turn] == controlled
        assert any("acts" in line.text for line in st.log)
        assert st.phase == "your_turn"


class TestAiming:
    """With more than one enemy you choose which to swing at."""

    def test_switching_target_and_refusing_a_friend(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, thane = _two(duckdb_session)
        creed, _ = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
        st = arena.start_duel(duckdb_session, [nya.id, thane.id, creed.id])

        me = st.order[st.turn]
        enemies = [i for i in range(len(st.roster)) if i != me]
        assert st.target_index in enemies

        other = next(i for i in enemies if i != st.target_index)
        st = arena.act(duckdb_session, st, ArenaAction(kind="aim", target=other))
        assert st.target_index == other
        assert st.foe.name == st.roster[other].pc.name

        with pytest.raises(ValueError, match="on your side"):
            arena.act(duckdb_session, st, ArenaAction(kind="aim", target=me))

    def test_a_solo_fight_has_nothing_to_aim_at(self, duckdb_session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3)
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session).id)
        with pytest.raises(ValueError, match="only one opponent"):
            arena.act(duckdb_session, st, ArenaAction(kind="aim", target=1))

    def test_an_auto_ally_pays_for_its_spells(self, duckdb_session: Session, monkeypatch):
        """A referee-played caster spends slots like anyone else, and runs dry."""
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        nya, dm = _pc(
            duckdb_session, CharacterClass.SORCERER, level=3, subclass="Wild Magic", score_cha=16
        )
        _learn(
            duckdb_session,
            nya,
            dm,
            _spell(
                duckdb_session,
                "Scorch (auto test)",
                2,
                ["Sorcerer"],
                damage_dice="3d8",
                damage_type="fire",
                save_ability="DEX",
            ),
        )
        creed, _ = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
        boss = _foe(duckdb_session, hp=4000, ac=30, name="The Wall")
        st = arena.start_boss(duckdb_session, [creed.id, nya.id], boss.id, controlled=creed.id)

        ally = next(i for i, s in enumerate(st.roster) if s.auto and s.kind == "pc")
        opening = sum((st.roster[ally].pc.slots or {}).values())
        for _ in range(6):
            if st.phase == "over":
                break
            st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        remaining = sum((st.roster[ally].pc.slots or {}).values())
        assert remaining < opening, "the ally spent slots casting"
        assert remaining >= 0


class TestAFallenCombatant:
    """A creature at 0 HP is skipped — and its seat must stay its own."""

    def test_a_downed_character_does_not_inherit_somebody_elses_sheet(
        self, duckdb_session, monkeypatch
    ):
        """Found by Plan 105's per-line snapshot; the bug predates it.

        ``_stow`` writes the working set into ``roster[order[turn]]``, which is
        only correct while those name the same creature. Skipping a fallen
        combatant moved the turn without drawing anybody, so the next stow put
        the *previous* creature's sheet into the dead one's seat — both seats
        then held one character, and the downed player's bar showed somebody
        else's hit points.

        A paladin and a sorcerer, so a seat that changes hands says so.
        """
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        creed, _ = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
        nya, _ = _pc(duckdb_session, CharacterClass.SORCERER, level=3, score_cha=16)
        boss = _foe(duckdb_session, hp=120, ac=13, name="The Revelmaster")
        st = arena.start_boss(duckdb_session, [creed.id, nya.id], boss.id, controlled=creed.id)

        seated = {
            i: slot.pc.character_class for i, slot in enumerate(st.roster) if slot.kind == "pc"
        }
        assert len(set(seated.values())) == 2, "the two seats start out distinguishable"

        swing = next(a for a in st.pc.attacks if a.cost == "action" and a.damage != "0")
        floored = False
        for _ in range(5):
            if st.phase == "over":
                break
            st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key=swing.key))
            if st.phase == "over":
                break
            st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
            for i, want in seated.items():
                slot = st.roster[i]
                assert slot.pc is not None and slot.pc.character_class == want, (
                    f"seat {i} was a {want} and is now holding a "
                    f"{slot.pc and slot.pc.character_class}'s sheet"
                )
                floored = floored or slot.pc.hp <= 0

        assert floored, "somebody went down, which is what the test is about"
