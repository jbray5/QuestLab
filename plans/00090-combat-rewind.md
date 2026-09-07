# Plan 00090 — Combat tracker: step back through initiative

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-07)

**Started:** 2026-09-07 · **Implemented by:** Claude Code

## Purpose
Justin: "Need an option in actual combat to go backwards through initiative
if I accidentally advance it." End Turn (and the E hotkey) had no undo: a
slip moved the turn pointer, pinged the wrong player's phone, and could bump
the round, with no way back except rebuilding the roster.

## Shipped
- **`rewind_combat_turn`** in `services/session_service.py`: the mirror of
  `advance_combat_turn`. Walks the full initiative order backwards to the
  previous non-defeated combatant; stepping past the top of the order steps
  the round back; the first turn of round 1 is refused ("nothing to go back
  to"). Emits the same turn-changed events, so the players' phones and the
  projector follow the correction.
- **`POST /sessions/{id}/combat/rewind`** beside `/combat/advance` (422 on
  the first turn, 403 when the DM doesn't own the campaign).
- **Every surface that offers Next Turn now offers Back**: the Session HUD
  ("← Back" beside "End Turn →", and **Shift+E** as the keyboard undo for E),
  the session runner, and the board's combat tracker.

## Verification
- `tests/test_services/test_session_service.py::TestRewindCombatTurn`: back
  to the previous combatant; round 2's first turn back to round 1's last;
  round 1's first turn refused; a defeated combatant skipped on the way back
  without touching the round.
- Prod: a throwaway session with three combatants — advance, advance, rewind
  landed on the second combatant at round 1; advance to wrap (round 2), rewind
  returned to the third combatant at round 1; rewind from the first turn of
  round 1 returned 422 with the message. The HUD bundle carries "← Back".
