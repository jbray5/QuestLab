"""Plan 102 — a maximize surge has to actually maximize.

Chelsea, mid-fight: "It shows what it's doing which is fun but it doesn't
actually take effect." Her Magic Missile rolled 3d4+3 -> [2,3,4]+3 = 12 with a
maximize surge pending. It should have been 15.

The surge was applied only on the attack-roll path, so it silently did nothing
to any spell that auto-hits or calls for a saving throw.
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


def _sorcerer(db, name, **spell_kw):
    pc, dm = _pc(db, CharacterClass.SORCERER, level=3, subclass="Wild Magic", score_cha=16)
    _learn(db, pc, dm, _spell(db, name, 1, ["Sorcerer"], **spell_kw))
    return pc, dm


def test_magic_missile_is_maximized(duckdb_session: Session, monkeypatch):
    """Chelsea's exact case: 3d4+3 rolling [2,3,4] must pay out 15, not 12."""
    pc, _dm = _sorcerer(duckdb_session, "Magic Missile", damage_dice="1d4+1", damage_type="force")
    # initiative (you 20, foe 1), then the three darts roll 2, 3, 4.
    monkeypatch.setattr(arena, "_RNG", _Seq([20, 1, 2, 3, 4]))
    st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
    st.effects["maximize_next"] = 10
    arena._seal(st)

    missiles = next(a for a in st.pc.attacks if a.name == "Magic Missile")
    st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=missiles.key))

    assert st.foe.hp == 200 - 15, "3d4+3 maximized is 15"
    # A leveled spell logs the Wild Magic check after the damage, so scan.
    assert any("maximized 15" in (line.dice or "") for line in st.log)
    assert "maximize_next" not in st.effects, "the surge is spent"


def test_a_save_spell_is_maximized_before_the_save_halves_it(duckdb_session, monkeypatch):
    """Maximize the dice, then halve — not half of a fresh roll."""
    pc, _dm = _sorcerer(
        duckdb_session,
        "Thunderwave",
        damage_dice="2d8",
        damage_type="thunder",
        save_ability="CON",
    )
    # initiative; 2d8 roll 1,1; then the foe's save is a natural 20 (it saves).
    monkeypatch.setattr(arena, "_RNG", _Seq([20, 1, 1, 1, 20]))
    st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
    st.effects["maximize_next"] = 10
    arena._seal(st)

    wave = next(a for a in st.pc.attacks if a.name == "Thunderwave")
    st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=wave.key))
    # 2d8 maximized = 16, saved for half = 8.
    assert st.foe.hp == 200 - 8
    assert any("maximized 16" in (line.dice or "") for line in st.log)


def test_an_attack_roll_spell_still_works(duckdb_session: Session, monkeypatch):
    """The path that already worked keeps working."""
    pc, dm = _pc(duckdb_session, CharacterClass.SORCERER, level=3, subclass="Wild Magic")
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
    monkeypatch.setattr(arena, "_RNG", _Seq([20, 1, 19, 1]))  # init, then hit, then a 1 for damage
    st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200, ac=10).id)
    st.effects["maximize_next"] = 10
    arena._seal(st)

    bolt = next(a for a in st.pc.attacks if a.name == "Fire Bolt")
    st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=bolt.key))
    assert st.foe.hp == 200 - 10
    assert any("maximized 10" in (line.dice or "") for line in st.log)


def test_no_surge_means_the_dice_stand(duckdb_session: Session, monkeypatch):
    """Without a pending surge nothing is touched."""
    pc, _dm = _sorcerer(duckdb_session, "Magic Missile", damage_dice="1d4+1", damage_type="force")
    monkeypatch.setattr(arena, "_RNG", _Seq([20, 1, 2, 3, 4]))
    st = arena.start(duckdb_session, pc.id, _foe(duckdb_session, hp=200).id)
    missiles = next(a for a in st.pc.attacks if a.name == "Magic Missile")
    st = arena.act(duckdb_session, st, ArenaAction(kind="cast", key=missiles.key))
    assert st.foe.hp == 200 - 12
    assert not any("maximized" in (line.dice or "") for line in st.log)
