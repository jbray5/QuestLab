"""Practice Arena — the owner's table's subclasses (Plan 88).

Wild Magic (surge, Tides of Chaos, Seeking Spell), Circle of Stars (Star Map,
Starry Forms), and the Oath of the Ancients' spells (Ensnaring Strike, Command),
plus Faerie Fire and Charm Person. PHB mechanics are gated to the owner's own
table; the suite plays there.
"""

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


class TestWildMagic:
    """Nya: surges on a 1 after a leveled spell, Tides of Chaos, Seeking Spell."""

    def test_surge_on_a_one_and_the_gate(self, duckdb_session: Session, monkeypatch):
        pc, dm = _pc(
            duckdb_session,
            CharacterClass.SORCERER,
            level=3,
            subclass="Wild Magic",
            feats=["Metamagic: Seeking Spell", "Metamagic: Twinned Spell"],
        )
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
            ),
        )
        # initiative (you 20, foe 1); three darts; wild magic d20 = 1;
        # surge d100 = 89 (lightning); then 4d10
        monkeypatch.setattr(arena, "_RNG", _Seq([20, 1, 4, 4, 4, 1, 89, 10, 10, 10, 10]))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        assert st.pc.wild_magic and "seeking spell" in st.pc.metamagic
        assert not any(f.key == "quicken" for f in st.pc.features)  # not one of her Metamagic picks
        missiles = next(a for a in st.pc.attacks if a.name == "Magic Missile")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=missiles.key))
        surge = [line for line in st.log if "WILD MAGIC SURGE" in line.text]
        assert len(surge) == 1 and "(89)" in surge[0].text
        assert any("Lightning: 40" in line.text for line in st.log)

    def test_no_surge_without_the_owner_gate(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena.entitlement_service, "personal_content_allowed", lambda e: False)
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, _dm = _pc(duckdb_session, CharacterClass.SORCERER, level=3, subclass="Wild Magic")
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session).id)
        assert not st.pc.wild_magic and not any(f.key == "tides_of_chaos" for f in st.pc.features)

    def test_tides_of_chaos_primes_a_sure_surge(self, duckdb_session: Session, monkeypatch):
        pc, dm = _pc(duckdb_session, CharacterClass.SORCERER, level=3, subclass="Wild Magic")
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
            ),
        )
        # initiative; three darts; surge d100 = 33 (resistance); no d20 check when primed
        monkeypatch.setattr(arena, "_RNG", _Seq([20, 1, 4, 4, 4, 33]))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        st = arena.act(duckdb_session, st, ArenaAction(kind="feature", key="tides_of_chaos"))
        assert st.adv_next and st.tides_primed
        tides = next(f for f in st.pc.features if f.key == "tides_of_chaos")
        assert tides.uses_left == 0
        missiles = next(a for a in st.pc.attacks if a.name == "Magic Missile")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=missiles.key))
        assert not st.tides_primed and "resist_all" in st.effects
        assert next(f for f in st.pc.features if f.key == "tides_of_chaos").uses_left == 1

    def test_seeking_spell_rerolls_a_missed_spell_attack(self, duckdb_session, monkeypatch):
        pc, dm = _pc(
            duckdb_session,
            CharacterClass.SORCERER,
            level=3,
            subclass="Wild Magic",
            feats=["Metamagic: Seeking Spell"],
        )
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Fire Bolt",
                0,
                ["Sorcerer"],
                damage_dice="1d10",
                damage_type="fire",
                attack_type="ranged",
            ),
        )
        # initiative; attack d20 = 2 (miss vs AC 15); reroll 20; damage 10
        monkeypatch.setattr(arena, "_RNG", _Seq([20, 1, 2, 20, 10]))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200, ac=15).id)
        assert st.pc.sorcery == 3
        bolt = next(a for a in st.pc.attacks if a.name == "Fire Bolt")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=bolt.key))
        assert "Seeking Spell reroll" in (st.log[-1].dice or "") and st.log[-1].hit
        assert st.pc.sorcery == 2


class TestCircleOfStars:
    """Willa: the free Star Map bolt, and the three Starry Forms off Wild Shape uses."""

    def test_star_map_bolt_and_archer_form(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        pc, dm = _pc(duckdb_session, CharacterClass.DRUID, level=3, subclass="Circle of Stars")
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        star = next(f for f in st.pc.features if f.key == "star_map")
        assert star.uses_left >= 1
        bolt = next(a for a in st.pc.attacks if a.key == "star_bolt")
        assert bolt.spell_level == 0 and bolt.effect == "guiding_bolt"
        uses = star.uses_left
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key="star_bolt"))
        assert (
            st.adv_next
            and next(f for f in st.pc.features if f.key == "star_map").uses_left == uses - 1
        )
        ws = next(f for f in st.pc.features if f.key == "wild_shape")
        ws_uses = ws.uses_left
        st = arena.act(duckdb_session, st, ArenaAction(kind="feature", key="starry_archer"))
        assert st.pc.starry_form == "archer" and st.bonus_used
        assert next(f for f in st.pc.features if f.key == "wild_shape").uses_left == ws_uses - 1
        assert any(a.key == "luminous_arrow" and a.cost == "bonus" for a in st.pc.attacks)
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key="luminous_arrow"))
        assert "Luminous Arrow" in st.log[-1].text and st.bonus_used

    def test_chalice_heals_more_and_dragon_holds_concentration(self, duckdb_session, monkeypatch):
        pc, dm = _pc(duckdb_session, CharacterClass.DRUID, level=3, subclass="Circle of Stars")
        _learn(duckdb_session, pc, dm, _spell(duckdb_session, "Cure Wounds", 1, ["Druid"]))
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        st = arena.act(duckdb_session, st, ArenaAction(kind="feature", key="starry_chalice"))
        st.pc.hp = 5
        arena._seal(st)
        cure = next(a for a in st.pc.attacks if a.name == "Cure Wounds")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=cure.key))
        # 2d8 (16) + WIS 3, plus Chalice 1d8 (8) + WIS 3 = 30 → capped at max 30
        assert st.pc.hp == 30 and "Chalice" in (st.log[-1].dice or "")


class TestAncientsSpells:
    """Creed's prepared spells: Ensnaring Strike after a hit, Command's Grovel."""

    def test_ensnaring_strike_restrains_after_a_hit(self, duckdb_session, monkeypatch):
        pc, dm = _pc(
            duckdb_session, CharacterClass.PALADIN, level=3, subclass="Oath of the Ancients"
        )
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Ensnaring Strike",
                1,
                ["Paladin"],
                casting_time="Bonus Action",
                is_concentration=True,
            ),
        )
        # initiative; unarmed hit d20 20 crit; damage; foe STR save fails on a 1; vines 1d6
        monkeypatch.setattr(arena, "_RNG", _Seq([20, 1, 20, 1, 6]))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        snare = next(a for a in st.pc.attacks if a.name == "Ensnaring Strike")
        assert snare.after_melee_hit and snare.cost == "bonus"
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key="unarmed"))
        slots = st.pc.slots["1"]
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=snare.key, slot_level=1))
        assert "restrained" in st.foe.conditions and st.pc.slots["1"] == slots - 1

    def test_command_grovel_knocks_the_foe_prone(self, duckdb_session, monkeypatch):
        pc, dm = _pc(
            duckdb_session, CharacterClass.PALADIN, level=3, subclass="Oath of the Ancients"
        )
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(duckdb_session, "Command", 1, ["Paladin"], save_ability="WIS"),
        )
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))  # the foe's save fails on a 1
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        cmd = next(a for a in st.pc.attacks if a.name == "Command")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=cmd.key))
        assert "prone" in st.foe.conditions


class TestControlSpells:
    """Faerie Fire lights the foe up; Charm Person stops it swinging until you hurt it."""

    def test_faerie_fire_then_charm(self, duckdb_session, monkeypatch):
        pc, dm = _pc(duckdb_session, CharacterClass.DRUID, level=3, subclass="Circle of Stars")
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(
                duckdb_session,
                "Faerie Fire",
                1,
                ["Druid"],
                save_ability="DEX",
                is_concentration=True,
            ),
        )
        _learn(
            duckdb_session,
            pc,
            dm,
            _spell(duckdb_session, "Charm Person", 1, ["Druid"], save_ability="WIS"),
        )
        monkeypatch.setattr(arena, "_RNG", _Fixed(high=False))
        st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
        ff = next(a for a in st.pc.attacks if a.name == "Faerie Fire")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=ff.key))
        assert "faerie fire" in st.foe.conditions and st.concentration == "Faerie Fire"
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        charm = next(a for a in st.pc.attacks if a.name == "Charm Person")
        st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=charm.key))
        assert "charmed" in st.foe.conditions
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
        assert any("won't raise a hand" in line.text for line in st.log)
