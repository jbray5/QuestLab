"""Practice Arena — every spell slot accounted for (Plan 89).

Upcasting scales the dice to the slot spent, pact slots feed Shield and
Hellish Rebuke, Font of Magic trades sorcery points for slots and back, the
sheet's already-spent slots carry into the ring, and a Wild Magic "regain a
slot" only returns one that was spent.
"""

import pytest
from sqlmodel import Session

from domain.arena import ArenaAction
from domain.enums import CharacterClass
from services import arena_service as arena
from services import spellcasting_service
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


def _tough(st):
    """Give the practice PC enough HP that the foe's turns don't end the test."""
    st.pc.hp = st.pc.hp_max = 200
    arena._seal(st)
    return st


class TestUpcasting:
    """A higher slot buys more dice, darts, or healing — and the log says which slot."""

    def test_magic_missile_at_level_two_fires_four_darts(
        self, duckdb_session: Session, monkeypatch
    ):
        pc, dm = _pc(duckdb_session, CharacterClass.SORCERER, level=3)
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Magic Missile",
                1,
                ["Sorcerer"],
                damage_dice="1d4+1",
                damage_type="force",
                higher_levels="The spell creates one more dart for each spell slot level above 1.",
            ),
        )
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        assert st.pc.slots == {"1": 4, "2": 2} and st.pc.slots_max == {"1": 4, "2": 2}
        missiles = next(a for a in st.pc.attacks if a.name == "Magic Missile")
        assert missiles.upcast == "count" and "one more per slot level" in missiles.note
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=missiles.key, slot_level=2))
        assert st.foe.hp == 200 - 20  # four darts at 4+1
        assert st.pc.slots == {"1": 4, "2": 1} and st.stats.slots_spent == 1
        assert "(level 2 slot)" in st.log[-1].text and st.log[-1].dice.startswith("4d4+4")

    def test_cure_wounds_at_level_two_heals_four_d8(self, duckdb_session: Session, monkeypatch):
        pc, dm = _pc(duckdb_session, CharacterClass.CLERIC, level=3, score_wis=16)
        _learn(duckdb_session, pc, dm, _spell(duckdb_session, "Cure Wounds", 1, ["Cleric"]))
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        st = _tough(st)
        st.pc.hp = 1
        arena._seal(st)
        cure = next(a for a in st.pc.attacks if a.name == "Cure Wounds")
        assert cure.upcast == "2d8"
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=cure.key, slot_level=2))
        assert st.pc.hp == 1 + 32 + st.pc.mods["wis"]
        assert st.log[-1].dice.startswith("4d8") and "(level 2 slot)" in st.log[-1].text
        assert st.pc.slots["2"] == 1 and st.pc.slots["1"] == 4

    def test_a_scaling_save_spell_from_the_catalog_text(self, duckdb_session: Session, monkeypatch):
        pc, dm = _pc(duckdb_session, CharacterClass.BARD, level=3, score_cha=16)
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Thunderwave",
                1,
                ["Bard"],
                damage_dice="2d8",
                damage_type="thunder",
                save_ability="CON",
                higher_levels="The damage increases by 1d8 for each spell slot level above 1.",
            ),
        )
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))  # the foe's save fails on a 1
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        wave = next(a for a in st.pc.attacks if a.name == "Thunderwave")
        assert wave.upcast == "1d8"
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=wave.key, slot_level=2))
        assert st.log[-1].dice.endswith("3d8 → [1, 1, 1] = 3") and st.foe.hp == 197


class TestPactSlots:
    """A warlock's only slots are pact slots: Shield and Hellish Rebuke must use them."""

    def test_shield_then_hellish_rebuke_from_level_two_pact_slots(
        self, duckdb_session, monkeypatch
    ):
        pc, dm = _pc(duckdb_session, CharacterClass.WARLOCK, level=3, score_cha=16)
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Shield",
                1,
                ["Warlock"],
                casting_time="Reaction, which you take when you are hit",
            ),
        )
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Hellish Rebuke",
                1,
                ["Warlock"],
                damage_dice="2d10",
                damage_type="fire",
                save_ability="DEX",
                casting_time="Reaction, which you take in response to taking damage",
            ),
        )
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        assert st.pc.slots == {"2": 2} and "reaction:shield" in st.pc.feats
        st = _tough(st)
        # Foe d20 = 12 → 16 vs AC 15: a hit that Shield's +5 turns away, paid with a pact slot.
        monkeypatch.setattr(arena, "_RNG", _Seq([12]))
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        foe_line = next(line for line in reversed(st.log) if line.who == "foe")
        assert "Shield (reaction, a level-2 slot)" in foe_line.text and st.pc.slots == {"2": 1}
        # Next round the foe rolls a 20 (Shield can't stop it); Hellish Rebuke answers with 3d10.
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        rebuke = next(
            line for line in st.log if "Hellish Rebuke (reaction, level 2 slot)" in line.text
        )
        assert rebuke.dice and "3d10" in rebuke.dice
        assert st.pc.slots == {"2": 0} and st.stats.slots_spent == 2


class TestFontOfMagic:
    """Sorcery points into slots and back, at the 2024 prices and level gates."""

    def test_make_a_slot_then_convert_one_back(self, duckdb_session: Session, monkeypatch):
        pc, _dm = _pc(duckdb_session, CharacterClass.SORCERER, level=3)
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        st = _tough(st)
        assert st.pc.sorcery == 3 and st.pc.sorcery_max == 3
        assert {f.key for f in st.pc.features} >= {"create_slot", "convert_slot"}
        with pytest.raises(ValueError, match="needs sorcerer level 5"):
            arena.act(
                duckdb_session, st, ArenaAction(kind="feature", key="create_slot", slot_level=3)
            )
        st = arena.act(
            duckdb_session, st, ArenaAction(kind="feature", key="create_slot", slot_level=1)
        )
        assert st.pc.sorcery == 1 and st.pc.slots["1"] == 5 and st.pc.slots_max["1"] == 5
        assert st.bonus_used
        with pytest.raises(ValueError, match="bonus action"):
            arena.act(
                duckdb_session, st, ArenaAction(kind="feature", key="convert_slot", slot_level=2)
            )
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        st = arena.act(
            duckdb_session, st, ArenaAction(kind="feature", key="convert_slot", slot_level=2)
        )
        assert st.pc.slots["2"] == 1 and st.pc.sorcery == 3  # +2, capped at the maximum
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        with pytest.raises(ValueError, match="already full"):
            arena.act(
                duckdb_session, st, ArenaAction(kind="feature", key="convert_slot", slot_level=1)
            )
        st.pc.sorcery = 1
        arena._seal(st)
        with pytest.raises(ValueError, match="costs 2 sorcery points"):
            arena.act(
                duckdb_session, st, ArenaAction(kind="feature", key="create_slot", slot_level=1)
            )


class TestTheSheetAndTheSurge:
    """What was spent at the table stays spent; a surge only returns a spent slot."""

    def test_slots_spent_on_the_sheet_carry_into_the_ring(self, duckdb_session, monkeypatch):
        pc, dm = _pc(duckdb_session, CharacterClass.CLERIC, level=3)
        spellcasting_service.expend_slot(duckdb_session, pc.id, 1, dm)
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session).id)
        assert st.pc.slots == {"1": 3, "2": 2} and st.pc.slots_max == {"1": 4, "2": 2}

    def test_regain_slot_needs_a_spent_slot(self, duckdb_session: Session, monkeypatch):
        pc, _dm = _pc(duckdb_session, CharacterClass.SORCERER, level=3, subclass="Wild Magic")
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session).id)
        monkeypatch.setattr(arena, "_RNG", _Seq([97]))
        arena._surge(st)
        assert st.pc.slots == {"1": 4, "2": 2} and "nothing to regain" in st.log[-1].text
        arena._spend_slot(st, 2)
        monkeypatch.setattr(arena, "_RNG", _Seq([97]))
        arena._surge(st)
        assert st.pc.slots == {"1": 4, "2": 2} and "level-2 slot returns" in st.log[-1].text
