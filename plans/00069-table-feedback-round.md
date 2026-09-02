# Plan 00069 — Table Feedback Round

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-02
**Last updated:** 2026-09-02
**Implemented by:** Claude Code

---

## Purpose

Justin's live feedback on the productization drop:
1. HUD "Join QR" showed the code on HIS screen — he wants it summoned
   ONTO the projector so players scan the big screen.
2. Conditions did nothing on the projector: party-card condition chips
   are client-only React state (never persisted), and the projection
   only enriched conditions while combat_state == "running".
3. Dice should LOOK like dice — a real d20 tumbling across the board,
   Roll20-style, not a rounded chip.
4. Hero renders read "blah" — bump identity renders to quality=high;
   model-quality exploration tracked separately.

---

## Progress
- [ ] Step 1: QR-to-projector — `join_qr_on` on TableState (+ migration
      0038) and projection; TableView/3D render the overlay while on;
      HUD button becomes a toggle (with copy-link kept)
- [ ] Step 2: conditions — HUD party-card toggles write through to the
      persisted combatant row (by character_id) when one exists;
      projection enriches conditions whenever combatant rows exist
      (turn glow stays gated on running)
- [ ] Step 3: 3D dice — three.js overlay in DiceCinematic: real
      polyhedron (d4/d6/d8/d12/d20; d10/d100 as bipyramid) tumbling and
      bouncing across the board, settling, then the number slams onto
      the top face (avoids per-face UV numbering; result is stamped at
      rest so it can never show wrong)
- [ ] Step 4: identity renders at quality=high
- [ ] Step 5: gate + ship + live verify

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 09-02 | QR summon | transient event / state field | `join_qr_on` state field | survives projector reloads; toggle semantics |
| 09-02 | PC conditions home | new PC column / write-through to combatant | write-through | conditions are combat-table state; one source of truth |
| 09-02 | Die numbering | per-face UV atlas / stamp on settle | stamp on settle | UV-correct polyhedra are a library unto themselves; a stamped result can never contradict the roll |

---

## Validation and Acceptance
- [ ] HUD toggle puts the QR on /table/{id} live; toggle off clears it
- [ ] Party-card poison chip → green pulse on the projector within a beat
- [ ] d20 visibly rolls across the board and settles; result stamps
- [ ] pytest + tsc + build green; live screenshots
