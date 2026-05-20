# Plan 00038 — Combat Input Improvements

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-05-19

---

## Purpose

Walkthrough surfaced three combat-input ergonomics issues that compound:

- **P4-1/9** Adding a combatant — even a known PC or NPC — is a four-field
  manual form. When Creed died and was removed, the DM had no path to
  re-add him without server-side curl.
- **P4-2** Initiative scores aren't editable after rolling. If players
  roll real dice and the DM has to enter them, mistakes are permanent
  short of re-rolling everyone.
- **P4-4b** HP adjustment is `−1` per click. 9 damage = 9 clicks. Large
  HP pools (boss monsters at L5+) become unworkable.

---

## Progress

- [x] Step 1: Plan doc
- [ ] Step 2: P4-4b — per-row "amount" input that defaults to 1; the
  existing `−` / `+` buttons apply the typed amount in either direction
- [ ] Step 3: P4-1/9 — "Add from roster" dropdown above the manual
  combatant form. Lists campaign PCs + NPCs (and PCs not currently in
  the tracker). Selecting one pre-fills Name + Type + HP + AC + linkbacks.
- [ ] Step 4: P4-2 — click-to-edit initiative score on each combatant
  row. PATCHes through `patchCombatant` (already exists).
- [ ] Step 5: tsc + commit + push

---

## Decisions

| Date | Decision | Chosen | Reason |
|---|---|---|---|
| 2026-05-19 | Damage input shape | Per-row number input + reuse existing −/+ | Existing buttons are familiar; just give them a typed amount instead of hard-coded 1. No extra UI bloat. |
| 2026-05-19 | Roster dropdown scope | PCs + NPCs only (monsters via Load Encounter) | Monsters already covered by the Load Encounter dropdown. Adding monster search would balloon scope. |
| 2026-05-19 | Init edit gesture | Click-to-edit inline | Drag-to-reorder is harder to get right than just editing the score; sort by score handles ordering for free. |

---

## Files touched

- `frontend/src/pages/SessionHud.tsx` — combat tracker UI (all three changes)
- (Backend already supports per-combatant PATCH via existing `update_combatant`)

---

## Out of scope

- Drag-and-drop initiative reordering (numeric edit is enough)
- Monster catalog search in the add-combatant flow (Load Encounter covers
  the planned-encounter case; ad-hoc monster adds keep the manual form)

---

## Outcomes and Retrospective

_to be written on close_
