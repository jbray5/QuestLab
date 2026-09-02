# Plan 00065 — Token State FX

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-01
**Last updated:** 2026-09-01
**Implemented by:** Claude Code

---

## Purpose

Field Guide #8: table state should be visible ON the board, not just in
the HUD. Condition marks (poisoned, prone, restrained, stunned…) and
concentration render as always-visible FX on the projector and 3D board
— the whole table sees who's poisoned without asking.

---

## Progress
- [x] Step 0: plan (2026-09-01)
- [x] Step 1: backend (2026-09-01) — projection tokens enriched with `conditions`
      (from SessionCombatant, matched by ref_id ↔ combatant id or
      character_id) + `concentrating` (PC.concentration_on); always
      overwritten at build time so stored tokens can't go stale
- [x] Step 2: 2D MapCanvas (2026-09-01) — concentration shimmer ring, poisoned green
      pulse, prone tilt, restrained dashed ring, condition pip row
- [x] Step 3: 3D board (2026-09-01) — prone standees lie down, condition glow tint
- [x] Step 4: tests + gate green (738 passed); ship + live verify below

---

## Surprises and Discoveries
- (none yet)

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 09-01 | Where conditions live on the wire | new endpoint / enrich projection tokens | enrich tokens | zero new surface; projection already flows to both boards live |
| 09-01 | Player safety | show all conditions / hide some | show all | 5e table conditions are public information at a physical table |

---

## Context and Orientation
- Conditions: `SessionCombatant.conditions` JSON (domain/session.py).
- Tokens: `domain/table_state.py::Token` (ref_id links combatant/PC).
- Projection build: services/table_service.py get_table_projection.
- 2D: frontend/src/components/table/MapCanvas.tsx; 3D: Board3D.tsx.

## Validation and Acceptance
- [ ] Poisoning a combatant in the HUD shows FX on 2D + 3D within a beat
- [ ] Prone standees visibly tilt; concentration shimmers
- [ ] pytest + tsc + build green; live screenshots

## Idempotence and Recovery
Additive field + visuals; progress boxes are the restart guide.
