# Plan 00066 — Dice on the Table

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-01
**Last updated:** 2026-09-01
**Implemented by:** Claude Code

---

## Purpose

Field Guide #6: a player taps a die on their phone and the whole table
watches it land on the projector. Server-rolled (authoritative RNG — no
"trust me it was a 20"), broadcast on the table topic, rendered as a
cinematic tumble + result stamp on both player surfaces. DM broadcast
rolls (Plan 39) join the same cinematic.

---

## Progress
- [x] Step 0: plan (2026-09-01)
- [x] Step 1: backend (2026-09-01) — POST /play/{pc_id}/roll (die, count, modifier,
      label): server rolls, resolves the PC's live session (IN_PROGRESS
      newest → newest), publishes `table.roll` on the table topic +
      `dice.rolled` back to the roller's own stream
- [x] Step 2: TableView + Table3DView (2026-09-01) — DiceCinematic overlay (tumbling
      die, result stamp, crit/fumble flourish); "table.roll" in the SSE
      allowlist
- [x] Step 3: PlayerView — 🎲 sheet with SHAKE-TO-ROLL (device motion,
      iOS permission flow, tap fallback) — Justin's mid-build idea
- [x] Step 4: tests + gate green (743 passed); ship + live verify below

---

## Surprises and Discoveries
- (none yet)

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 09-01 | Who rolls | client / server | server (SystemRandom) | table trust; phones just ask |
| 09-01 | Physics | cannon-es physics / canned cinematic | canned cinematic | the moment is shared suspense, not simulation; 1/10th the risk |
| 09-01 | Live session resolution | explicit session pick / infer | infer: IN_PROGRESS newest, else newest | zero player friction; a roll to an unprojected table is harmless |

---

## Context and Orientation
- DM broadcast rolls: Plan 39 (`dice.rolled` on pc streams).
- Table topic events: integrations/event_bus.py; frontend allowlist in
  hooks/useEventStream.ts (MUST add new event names there).
- Player sheet: frontend/src/pages/PlayerView.tsx.

## Validation and Acceptance
- [ ] Tap d20 on the phone → projector plays the tumble and result
- [ ] Crit (nat 20) and fumble (nat 1) get distinct flourishes
- [ ] pytest + tsc + build green; live screenshots

## Idempotence and Recovery
Additive route + UI; progress boxes are the restart guide.
