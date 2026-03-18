# Plan 00008 — HUD Encounter Import

## Status
[x] In progress

**Started:** 2026-03-16
**Last updated:** 2026-03-16
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

The Session HUD has a manual combat tracker. DMs have already designed encounters
with specific monster rosters. This plan connects the two: a "Load Encounter" button
in the HUD combat panel lets the DM pick any encounter from the adventure, and
instantly adds all its monsters as individual combatants (Goblin 1, Goblin 2, etc.)
with HP and AC pre-filled from the roster. The party PCs remain in the tracker.

---

## Progress

- [x] Step 1: Write plan
- [x] Step 2: Add `hp` and `ac` to `RosterEntry` in types.ts
- [x] Step 3: Update Encounters.tsx roster editor to save hp/ac from monster search results
- [x] Step 4: Add encounters query + Load Encounter UI to SessionHud.tsx
- [x] Step 5: Build passes
- [ ] Step 6: Commit & push

---

## Surprises and Discoveries

- RosterEntry currently lacks hp and ac — must be backfilled from the monster stat
  block when adding to roster. Older roster entries without hp/ac default to 10.
- Each monster with count > 1 becomes N individual combatants ("Goblin 1", "Goblin 2").
- Adventures endpoint: GET /adventures/:id/encounters — already exists.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-03-16 | HP/AC source | Fetch monster stat block live vs store in roster | Store in roster | Avoids N API calls in HUD; roster editor already has full Monster object |
| 2026-03-16 | Load UI | Dropdown select vs button per encounter | Dropdown | Cleaner when adventure has 5+ encounters |

---

## Context and Orientation

### Files touched
```
frontend/src/api/types.ts              — MODIFY (add hp, ac to RosterEntry)
frontend/src/pages/Encounters.tsx      — MODIFY (save hp, ac when adding monster)
frontend/src/pages/SessionHud.tsx      — MODIFY (load encounter → combat tracker)
```

### Architecture layers involved
- `frontend/pages/` only — no backend changes needed
- Uses existing `GET /adventures/:id/encounters` endpoint

---

## Concrete Steps

### Step 2: types.ts
Add `hp: number` and `ac: number` to `RosterEntry`. Both optional with fallback 10.

### Step 3: Encounters.tsx
When addMonster() is called, include `hp: m.hp_average, ac: m.ac` in the new entry.

### Step 4: SessionHud.tsx
- Add query: `encountersApi.list(session.adventure_id)`
- Add state: `loadEncounterId` (selected encounter id)
- In combat panel header, add a `<select>` of encounters + "Load" button
- Load: for each roster entry, push `count` combatants of type "monster" with
  name `"{name} {i+1}"` (or just `"{name}"` when count=1), hp from roster, ac from roster
- After loading, automatically sort by initiative placeholder (0) ready to roll

---

## Validation and Acceptance

- [ ] `npm run build` passes
- [ ] HUD combat panel shows encounter dropdown
- [ ] Selecting encounter + Load adds monsters as individual combatants
- [ ] HP and AC pre-filled from roster data
- [ ] Multiple monsters of same type numbered sequentially
- [ ] Party PCs remain in tracker after loading encounter

---

## Interfaces and Dependencies

**Produces:** HUD can import any encounter from the adventure into live combat
**Depends on:** Plan 00007 roster entries having hp/ac fields (added by this plan)
