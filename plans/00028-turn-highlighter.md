# Plan 00028 — Turn Highlighter (player-view "It's your turn!")

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-16
**Last updated:** 2026-05-16

---

## Purpose

Close the live-sync loop: when the DM advances initiative on the HUD,
the active player's phone glows "⚔ It's your turn!" within ~1s. Without
this, the player view shows their sheet but doesn't surface when they
should be acting.

---

## Progress

- [x] Step 1: Backend — `SessionCombatantRepo.find_active_for_character`
  + `player_service.turn_state` + `/api/play/{pcId}/turn-state` — 2026-05-16
- [x] Step 2: Emit `pc.turn.changed` events on advance / save / clear
  combat state in `session_service` — 2026-05-16
- [x] Step 3: Backend tests — 8 new tests; full suite 522✓ — 2026-05-16
- [x] Step 4: Frontend `TurnState` type + `playApi.turnState()` — 2026-05-16
- [x] Step 5: `TurnBanner` in `PlayerView` with shimmering gold gradient
  + box-shadow pulse + brief phone vibrate on activation — 2026-05-16
- [x] Step 6: Quality gate green — 2026-05-16

---

## Architecture

```
DM clicks "Advance Turn" on HUD
   ↓
session_service.advance_combat_turn (or save_combat_state, clear_combat_state)
   ↓
_emit_turn_change(previous_active, new_active, …)
   ↓
publish_pc_turn_changed → event_bus → pc:{pcId} topic
   ↓
EventSource on player phone receives "pc.turn.changed"
   ↓
PlayerView writes {active: true/false, round, ...} into React-Query cache
   ↓
TurnBanner renders glowing "It's your turn!" + navigator.vibrate(60,40,60)
```

Initial load: `GET /api/play/{pcId}/turn-state` populates the same query
key so the banner is correct on first paint or after a network blip.

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-16 | Lookup path | (a) Iterate sessions per adventure per campaign, (b) Direct JOIN | (b) | Added `find_active_for_character` to SessionCombatantRepo. One query, joins `sessions.combat_active_combatant_id` to `SessionCombatant.character_id`. Returns `(GameSession, SessionCombatant)` or None. |
| 2026-05-16 | Event payload | (a) Just "refetch" trigger, (b) Embed turn details | (b) | Sending `{active, session_id, round, active_combatant_name}` lets the client toggle the banner instantly without a follow-up GET. Falls back to the GET on reconnect / first load. |
| 2026-05-16 | Phone vibrate | (a) No, (b) Yes on activation only | (b) | Players can ignore the page; the buzz is the table cue. Web-Vibration API is graceful-noop on iOS / unsupported browsers. |
| 2026-05-16 | Visual style | (a) Static badge, (b) Shimmering gold gradient + pulse | (b) | This is the user-facing "polish" opportunity. Cinzel Decorative font + linear-gradient shine + box-shadow pulse looks at-the-table appropriate without being obnoxious. |

---

## Outcomes and Retrospective

**Files added / changed:**

Backend
- `db/repos/session_repo.py` — `SessionCombatantRepo.find_active_for_character`
- `integrations/event_bus.py` — `publish_pc_turn_changed`
- `services/session_service.py` — `_emit_turn_change` helper + wire-ups
  in `advance_combat_turn`, `save_combat_state`, `clear_combat_state`
- `services/player_service.py` — `turn_state(db, pc_id)`
- `api/routers/play.py` — `GET /play/{pc_id}/turn-state`
- `tests/test_services/test_turn_state.py` — 8 tests

Frontend
- `frontend/src/api/play.ts` — `TurnState` type + `playApi.turnState()`
- `frontend/src/pages/PlayerView.tsx`:
  - `useQuery(["play-turn-state", pcId])` for initial load
  - SSE handler for `pc.turn.changed` writes the cache directly (no
    refetch round-trip)
  - `TurnBanner` component renders only when `active=true` — sticky at
    the top of the player view, shimmering gold gradient, pulsing
    box-shadow, brief phone vibrate on activation

**Surprises:** initial test failure on Pydantic tier enum (expected
`Tier1` not `TIER1`); fixed.

**Tech debt:** none.