"""Plan 100 — Dragonborn Breath Weapon in the Practice Arena.

Creed's player asked where his breath weapon was: the arena built weapons,
spells and class features but no species traits at all.
"""

import pytest
from sqlmodel import Session

import services.character_service as char_svc
from domain.arena import ArenaAction
from domain.character import PlayerCharacterUpdate
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


def _dragonborn(db, notes=None, level=3, score_con=13):
    pc, dm = _pc(db, CharacterClass.PALADIN, level=level, score_con=score_con)
    patch = {"race": "Dragonborn"}
    if notes is not None:
        patch["notes"] = notes
    updated = char_svc.update_character(db, pc.id, dm, PlayerCharacterUpdate(**patch))
    return updated, dm


class TestTheBreathIsThere:
    """It shows up on the grid with the right save, dice and uses."""

    def test_a_level_three_dragonborn_gets_it(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _dragonborn(duckdb_session, notes="Species: Fire breath weapon, Fire resistance.")
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        breath = next(a for a in st.pc.attacks if a.key == "breath_weapon")
        # DC 8 + CON mod (+1) + PB (2) = 11; 1d10 below level 5; half on a save.
        assert breath.save_dc == 11 and breath.save_ability == "dex"
        assert breath.damage == "1d10" and breath.damage_type == "fire"
        assert breath.half_on_save and breath.cost == "action"
        uses = next(f for f in st.pc.features if f.key == "breath_weapon")
        assert uses.uses_left == 2  # proficiency bonus per long rest

    def test_a_non_dragonborn_gets_nothing(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3)
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session).id)
        assert not any(a.key == "breath_weapon" for a in st.pc.attacks)

    def test_the_dice_scale_with_level(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _dragonborn(duckdb_session, level=5)
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        assert next(a for a in st.pc.attacks if a.key == "breath_weapon").damage == "2d10"


class TestTheAncestry:
    """The damage type is read off the sheet; fire when the sheet is silent."""

    @pytest.mark.parametrize(
        "notes,expected",
        [
            ("Species: Fire breath weapon, Fire resistance.", "fire"),
            ("Breath weapon: lightning, 30-ft line.", "lightning"),
            ("A cold breath and a cold heart.", "cold"),
            ("Nothing about ancestry here.", "fire"),
        ],
    )
    def test_read_from_the_sheet(self, duckdb_session: Session, monkeypatch, notes, expected):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _dragonborn(duckdb_session, notes=notes)
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        breath = next(a for a in st.pc.attacks if a.key == "breath_weapon")
        assert breath.damage_type == expected and expected in breath.name


class TestSpendingIt:
    """Two uses, then it is refused; the counter is not a clickable feature."""

    def test_it_burns_a_use_and_runs_out(self, duckdb_session: Session, monkeypatch):
        pc, _dm = _dragonborn(duckdb_session, notes="Species: Fire breath weapon.")
        # initiative (you 20, foe 1), then the foe fails every save on a 1.
        monkeypatch.setattr(arena, "_RNG", _Seq([20, 1]))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=400).id)
        st.pc.hp = st.pc.hp_max = 400
        arena._seal(st)

        for expected_left in (1, 0):
            st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="breath_weapon"))
            assert next(f for f in st.pc.features if f.key == "breath_weapon").uses_left == (
                expected_left
            )
            assert "Breath Weapon" in st.log[-1].text
            st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))

        with pytest.raises(ValueError, match="No Breath Weapon uses left"):
            arena.act(duckdb_session, st, ArenaAction(kind="attack", key="breath_weapon"))

    def test_the_counter_points_at_the_attack(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _dragonborn(duckdb_session)
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        with pytest.raises(ValueError, match="Use the Breath Weapon attack"):
            arena.act(duckdb_session, st, ArenaAction(kind="feature", key="breath_weapon"))
