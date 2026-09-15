# Plan 00105 — Playback in chunks, with the hit points keeping up

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-09-14
**Last updated:** 2026-09-14
**Implemented by:** Claude Code

---

## Purpose
Plan 103 paced the log a line at a time. Justin, after running a boss battle:
"The playback should happen in chunks. Give a bit to digest each turn and
reflect the HP as it happens."

Two faults, one root. The server settles a whole batch of turns in one reply —
in a boss battle that is the ally's turn *and* the boss's — and the page has no
idea where one creature's turn ends and the next begins, so it dribbles the
lines out at a fixed cadence with no rhythm. And every number outside the log
(hit point bars, the roster's skulls, the new hit buzz) snaps to the final
state the instant the reply lands, ahead of the narration describing it.

So: the log learns which turn each line belongs to and what everybody's hit
points were when it was written. The page then reveals a turn at a time and
draws the bars from the line it is showing, not from the end of the fight.

---

## Progress
- [x] Step 1: `ArenaLogLine.beat` + `ArenaLogLine.hp`, `ArenaState.beat`
- [x] Step 2: `_log` stamps both; beat advances where a new creature takes over
- [x] Step 3: Fix the aliasing trap so the snapshot is right on a monster's turn
- [x] Step 4: Frontend reveals a beat at a time (`CHUNK_MS = 1150`)
- [x] Step 5: Bars, skulls and the hit buzz read the revealed line
- [x] Step 6: **Fixed the seat-swapping bug the snapshot exposed (predates this plan)**
- [x] Step 7: Tests (11 new), gate green
- [ ] Step 8: Watch a real boss battle narrate on prod

---

## Surprises and Discoveries

**The snapshot found a real bug that predates this plan.** Printing everyone's
hit points against every line made it obvious within one trace: a character who
drops to 0 stops being `_living`, so `advance_turn` skips them with `continue`
— moving the turn *without drawing anybody*. The next pass's `_stow` then wrote
the previous creature's sheet into the fallen one's seat. Both seats ended up
holding one character:

```
act 1: roster hp=[2, 30, 104]  ids=[...539504, ...748560]
act 2: roster hp=[2,  2,  88]  ids=[...536064, ...536064]   <- one object, two seats
```

It has been there since Plan 101 and nobody caught it, because the symptom —
a downed player's bar wearing somebody else's numbers — only shows on a screen
that draws the whole roster, and only in the window where one character is down
and another is still up. The fix is to put the working set away the moment its
owner is done rather than at the top of the next pass, with a `drawn` flag for
the case where nobody was loaded at all.

**Two assertions missed it before one caught it.** "Hit points never climb"
passed, because both seats shared an object and fell together. "Never exceeds
your own maximum" passed, because both characters had the same maximum. What
finally pinned it was asserting the seat still holds *its own character*: a
paladin's seat must never come back holding a sorcerer's sheet. When a test
passes against deliberately reverted code, the test is wrong, not the code —
worth reverting and re-running every time, which is how this one got found.

**A chunk boundary is not a quiet moment.** The first line of a beat often
carries damage (the attack line *is* the first line of that turn), so "the
score at the end of one chunk equals the score at the start of the next" is
false by design. The property that actually holds is monotonicity across the
whole log.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-14 | Where turn boundaries come from | (a) frontend guesses from the text (b) the server stamps each line | (b) | The referee already knows whose turn it is. Pattern-matching "you're up" in prose is a guess that breaks the first time the wording changes. |
| 2026-09-14 | Where mid-fight hit points come from | (a) replay the dice on the client (b) stamp a snapshot per line | (b) | The client must never re-run rules — one referee, and it is the server. A snapshot is a fact, not a re-derivation. |
| 2026-09-14 | Chunk size | (a) one line (b) one creature's turn (c) one whole reply | (b) | What Justin asked for, and it matches how the table reads: a turn is the unit of attention. |
| 2026-09-14 | First chunk of a batch | (a) same pause as the rest (b) immediate | (b) | The first beat is almost always the player's own action. Making them wait a second to see their own attack land is the snappiness Plan 103 was careful to keep. |

---

## Context and Orientation

### Files touched
- `domain/arena.py` — `ArenaLogLine.beat`, `ArenaLogLine.hp`, `ArenaState.beat`
- `services/arena_service.py` — `_log`, `_hp_now`, `_draw`, `_foe_turn`, `advance_turn`, `act`
- `services/duel_service.py` — `end()` survives a state it can no longer verify
- `frontend/src/pages/Arena.tsx` — chunked reveal; bars and buzz read the revealed line

### Key terms defined
- **Beat** — one creature's turn. Every log line written during it carries the
  same beat number, and the page reveals a whole beat at once.
- **Snapshot** — the hit points of everyone in the fight at the moment a line
  was written, in roster order (or `[you, foe]` in a solo fight).

### The aliasing trap (why Step 3 exists)
The roster usually holds the *same objects* the engine is working on, so
reading hit points off it is live. The exception is a character being swung at:
the engine sees them through a converted copy (`_as_foe`), so their slot is
stale until the next stow. Worse, on a monster's turn the roles invert — the
working set holds the defender as `pc` and the monster as `foe` — so
"`target_index` means `state.foe`" is true on a player's turn and backwards on
a monster's. This is the same trap that put a monster's hit points onto the
character it hit in Plan 101.

---

## Validation and Acceptance
- [x] A boss battle splits into one chunk per creature (traced in
      `test_arena_playback_sim.py`, which prints the whole narration)
- [x] The bars fall in step with the line describing the blow, not before it
- [x] The buzz reads the same figures the bars do, so it fires with the line
- [x] `prefers-reduced-motion` still shows the whole fight at once
- [x] Gate green: 945 pytest, black/isort/flake8/interrogate/pip-audit, eslint/build
- [ ] Justin watches a real boss battle narrate on his phone

---

## Interfaces and Dependencies
**Depends on:** Plan 103 (paced playback), Plan 101 (the roster), Plan 104.
**Breaking:** the seal covers the whole state, so adding fields invalidates
fights already in progress on a phone. The existing "this fight expired — start
over" path catches it; `duel_service.end` needs the same mercy.

---

## Outcomes and Retrospective

**What shipped.** The log is no longer a flat list of strings: each line knows
whose turn wrote it and what the score was at that moment. That one addition
paid for three things at once — chunked playback, bars that move with the
narration, and a hit buzz that fires on the line describing the hit rather than
a second ahead of it.

**The finding worth carrying forward:** making the state *visible* found a bug
that reading the code had not. The seat-swapping fault had survived Plan 101's
whole test suite, a prod verification run, and two sessions of my own reading.
It took one printed trace — every combatant's hit points against every line —
to make it obvious in seconds. When a subsystem is hard to reason about, the
cheapest next move is often to render its state and look at it, not to stare
harder at the code.

**Second, smaller finding:** a regression test is only a regression test once
you have watched it fail. Two plausible assertions passed against deliberately
reverted code before the third one caught the fault, and each of those would
have shipped as false comfort.
