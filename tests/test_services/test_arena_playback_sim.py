"""A readable trace of how a boss battle will actually narrate (Plan 105).

Not an assertion of prose — the referee's wording is free to change. This walks
the log exactly the way the phone does (one beat per chunk, hit points read off
the last line shown) and checks the two properties that make it watchable: the
chunks are whole turns, and nobody's bar moves before the line that explains it.
"""

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


def _chunks(log):
    """Group the log the way the page does: consecutive lines sharing a beat."""
    out: list[list] = []
    for line in log:
        if out and out[-1][0].beat == line.beat:
            out[-1].append(line)
        else:
            out.append([line])
    return out


def test_a_boss_battle_narrates_one_turn_at_a_time(duckdb_session: Session, monkeypatch, capsys):
    """Walk a real fight and hold the properties the playback depends on."""
    monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))
    creed, _ = _pc(duckdb_session, CharacterClass.PALADIN, level=3, score_str=16)
    nya, _ = _pc(duckdb_session, CharacterClass.SORCERER, level=3, score_cha=16)
    boss = _foe(duckdb_session, hp=120, ac=13, name="The Revelmaster")
    st = arena.start_boss(duckdb_session, [creed.id, nya.id], boss.id, controlled=creed.id)

    swing = next(a for a in st.pc.attacks if a.cost == "action" and a.damage != "0")
    for _ in range(4):
        if st.phase == "over":
            break
        st = arena.act(duckdb_session, st, ArenaAction(kind="attack", key=swing.key))
        if st.phase == "over":
            break
        st = arena.act(duckdb_session, st, ArenaAction(kind="end_turn"))

    names = [slot.label for slot in st.roster]
    print("\n--- how this plays out on the phone ---")
    for chunk in _chunks(st.log):
        print(f"\n[beat {chunk[0].beat}]")
        for line in chunk:
            score = ", ".join(f"{n}={h}" for n, h in zip(names, line.hp or []))
            print(f"    {line.text[:72]:<72} | {score}")

    chunks = _chunks(st.log)
    assert len(chunks) >= 4, "several turns went by"

    # Nobody heals in this fight, so every bar must fall and stay fallen. This
    # is the assertion that caught a downed character's seat being overwritten
    # with the previous creature's sheet — their hit points climbed back up.
    for i in range(len(st.roster)):
        seen = [line.hp[i] for line in st.log if line.hp]
        assert seen == sorted(seen, reverse=True), f"{names[i]} (seat {i}) went back up: {seen}"

    # A chunk is one creature's turn, so a line only ever moves the score of
    # somebody involved in it — never more than two seats at once.
    for chunk in chunks:
        for before, after in zip(chunk, chunk[1:]):
            moved = sum(1 for a, b in zip(before.hp or [], after.hp or []) if a != b)
            assert moved <= 2, f"{moved} seats moved on one line: {after.text!r}"

    captured = capsys.readouterr()
    assert "beat" in captured.out
