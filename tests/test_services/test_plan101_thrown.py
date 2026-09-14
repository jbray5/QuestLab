"""Plan 101 — a thrown weapon can be thrown.

A javelin is a melee weapon that also has a range. The arena offered only the
swing, so Creed's player had no way to hurl one. It now offers both: the swing
(which Divine Smite rides) and the throw (a ranged attack, which it does not).
"""

from sqlmodel import Session

from domain.arena import ArenaAction
from domain.enums import CharacterClass, ItemRarity
from domain.item import ItemCreate
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


def _give(db: Session, pc, dm: str, **item_kw):
    """Create a catalog weapon and equip it on the PC."""
    import services.inventory_service as inv_svc
    import services.item_service as item_svc
    from domain.character import CharacterItemCreate

    item = item_svc.create_item(
        db, ItemCreate(rarity=ItemRarity.COMMON, item_type="Weapon", **item_kw)
    )
    row = inv_svc.add_item(
        db, pc.id, CharacterItemCreate(item_id=item.id, quantity=1, equipped=True), dm
    )
    inv_svc.set_equipped(db, row.id, True, dm)
    return item


JAVELIN = dict(
    name="Javelin",
    weapon_category="Simple Melee",
    damage_die="1d6",
    damage_type="piercing",
    weapon_properties=["Thrown"],
    weapon_range="30/120",
)


def test_a_thrown_weapon_offers_both_the_swing_and_the_throw(duckdb_session: Session, monkeypatch):
    """One javelin, two buttons."""
    monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
    pc, dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
    _give(duckdb_session, pc, dm, **JAVELIN)
    st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)

    swing = next(a for a in st.pc.attacks if a.name == "Javelin")
    throw = next(a for a in st.pc.attacks if a.name == "Javelin (thrown)")
    assert swing.melee is True and throw.melee is False
    assert "30/120" in throw.note and "no smite" in throw.note
    assert swing.damage_type == throw.damage_type == "piercing"


def test_the_swing_smites_and_the_throw_does_not(duckdb_session: Session, monkeypatch):
    """Divine Smite needs a melee hit; hurling the javelin is a ranged attack."""
    pc, dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
    _give(duckdb_session, pc, dm, **JAVELIN)
    monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
    st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=400).id)
    throw = next(a for a in st.pc.attacks if a.name == "Javelin (thrown)")
    swing = next(a for a in st.pc.attacks if a.name == "Javelin")

    # A throw lands but leaves no melee hit behind, so the smite is refused.
    st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key=throw.key))
    assert st.hit_this_turn and not st.melee_hit_this_turn
    try:
        arena.act(duckdb_session, st, ArenaAction(kind="cast", key="divine_smite", slot_level=1))
        raise AssertionError("a thrown javelin should not carry a smite")
    except ValueError as exc:
        assert "melee hit" in str(exc)

    # The swing does leave one.
    st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))
    st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key=swing.key))
    assert st.melee_hit_this_turn
    slots = st.pc.slots["1"]
    st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key="divine_smite", slot_level=1))
    assert st.pc.slots["1"] == slots - 1
    assert any("Divine Smite" in line.text for line in st.log)


def test_a_pure_melee_weapon_gets_no_throw(duckdb_session: Session, monkeypatch):
    """A longsword has no range and so no second button."""
    monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
    pc, dm = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
    _give(
        duckdb_session,
        pc,
        dm,
        name="Longsword",
        weapon_category="Martial Melee",
        damage_die="1d8",
        damage_type="slashing",
        weapon_properties=["Versatile"],
    )
    st = arena.start(duckdb_session, pc.id, _foe(duckdb_session).id)
    assert not any("(thrown)" in a.name for a in st.pc.attacks)
