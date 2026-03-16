# Plan 00007 — Encounter Monster Roster UI

## Status
[x] In progress

**Started:** 2026-03-16
**Last updated:** 2026-03-16
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

The Encounter page lets DMs create encounters but has no way to add monsters to them.
`monster_roster` is a JSON field on every Encounter but the frontend never exposes it.
This plan wires up a full roster builder: search the compendium, add monsters with
counts, view per-monster XP, auto-calculate total XP + difficulty from the party's
levels, and remove monsters — all inline on the Encounter card.

---

## Progress

- [x] Step 1: Write plan
- [x] Step 2: `domain/encounter.py` — add `pc_levels` to `EncounterUpdate`
- [x] Step 3: `db/repos/encounter_repo.py` — skip `pc_levels` in setattr loop
- [x] Step 4: `services/encounter_service.py` — read `pc_levels` from body if not given
- [x] Step 5: `frontend/src/api/types.ts` — add `RosterEntry` type
- [x] Step 6: `frontend/src/pages/Encounters.tsx` — rewrite with roster UI
- [x] Step 7: Build + quality gates pass
- [x] Step 8: Commit & push

---

## Surprises and Discoveries

- `EncounterRepo.update` iterates `model_dump(exclude_unset=True)` and calls `setattr`
  on the ORM object — adding `pc_levels` to `EncounterUpdate` would silently set a
  non-column attribute on the ORM object. Safe to exclude it explicitly in the repo.
- `encounter_service.update_encounter` already accepts `pc_levels` as a separate kwarg
  and uses it to auto-recalculate XP + difficulty when the roster changes.
- The router currently calls `update_encounter(db, id, user, body)` without `pc_levels`.
  Extracting `body.pc_levels` in the service (not the router) keeps the router clean.
- Encounters are scoped to adventures; adventure → campaign_id → characters chain needed
  to get party levels.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-03-16 | pc_levels transport | Query param vs body field vs client-side only | Body field on EncounterUpdate | Consistent with existing pattern; service already has pc_levels kwarg |
| 2026-03-16 | XP calculation | Backend vs frontend | Backend (existing service) | Logic + multiplier table already in encounter_math.py |
| 2026-03-16 | Roster mutation | Save-on-every-change vs explicit Save button | Explicit Save button | Avoids spamming PATCH on every count change |
| 2026-03-16 | Monster search | Inline in card vs modal | Inline panel inside expanded card | Fewer clicks; DM already looking at the encounter |

---

## Context and Orientation

### Files touched
```
domain/encounter.py                       — MODIFY (add pc_levels to EncounterUpdate)
db/repos/encounter_repo.py                — MODIFY (exclude pc_levels from setattr)
services/encounter_service.py             — MODIFY (read pc_levels from body)
frontend/src/api/types.ts                 — MODIFY (add RosterEntry)
frontend/src/pages/Encounters.tsx         — MODIFY (roster UI)
```

### Architecture layers involved
- `domain/` — Pydantic schema change (add optional field)
- `db/repos/` — Repo must not attempt to persist `pc_levels`
- `services/` — Already handles `pc_levels`; pull from body if set
- `frontend/pages/` — UI only; calls existing API

### Key terms defined
- **monster_roster**: JSON list on Encounter, each entry `{monster_id, count, name, xp}`.
  `name` and `xp` are stored for display without re-fetching the full monster.
- **pc_levels**: List of integer levels (1–20) for each attending PC. Used by
  `_compute_xp_and_difficulty` to determine XP thresholds and difficulty tier.
- **RosterEntry**: Frontend type `{monster_id, count, name, xp, cr}`.
- **adjusted_xp**: Raw XP × multiplier (from D&D 5e encounter math). Stored as `xp_budget`.

---

## Concrete Steps

### Step 2: domain/encounter.py — add pc_levels to EncounterUpdate
**File:** `domain/encounter.py`
**Action:** Modify — add `pc_levels: Optional[list[int]] = None` to `EncounterUpdate`
**Verify:** `from domain.encounter import EncounterUpdate; EncounterUpdate(pc_levels=[5,3])`

### Step 3: db/repos/encounter_repo.py — skip pc_levels in setattr
**File:** `db/repos/encounter_repo.py`
**Action:** Modify — in `update()`, skip `pc_levels` key in the setattr loop
**Verify:** `patch = {"monster_roster": [], "pc_levels": [5]}; no AttributeError on commit`

### Step 4: services/encounter_service.py — pull pc_levels from body
**File:** `services/encounter_service.py`
**Action:** Modify — in `update_encounter`, set `pc_levels = pc_levels or update.pc_levels`
**Verify:** PATCH with `{monster_roster:[...], pc_levels:[5,3]}` auto-recalculates xp_budget

### Step 5: frontend/src/api/types.ts — add RosterEntry
**File:** `frontend/src/api/types.ts`
**Action:** Modify — add `RosterEntry` interface with `monster_id, count, name, xp, cr`
**Verify:** TypeScript compiles

### Step 6: frontend/src/pages/Encounters.tsx — roster UI
**File:** `frontend/src/pages/Encounters.tsx`
**Action:** Modify — add:
1. Queries for adventure + characters (to get party levels)
2. `expandedId` state — which encounter card is open
3. Monster search panel: `monstersApi.list({search})` with debounce
4. Add to roster / increment count / remove
5. Save roster button → `encountersApi.update(id, {monster_roster, pc_levels})`
6. Roster display: name, CR, count, per-monster XP, total adjusted XP, difficulty badge

### Step 7: Build + quality gates
**Action:** `black . && isort . && flake8 && interrogate -c pyproject.toml`
         then `cd frontend && npm run build`
**Verify:** Zero errors both sides

---

## Validation and Acceptance

- [ ] `black . && isort . && flake8 && interrogate` pass
- [ ] `npm run build` passes
- [ ] Create an encounter → expand it → search for "goblin" → results appear
- [ ] Add 3 Goblins → XP and difficulty badge update after Save
- [ ] Add a second monster type → roster shows two rows
- [ ] Remove a monster → it disappears from roster
- [ ] Encounter card in collapsed view shows monster count + XP budget

---

## Idempotence and Recovery

No DB migrations. All backend changes are schema-only (new optional field) or logic-only.
Safe to re-run all steps. If Encounters.tsx is partially edited, rewrite from scratch.

---

## Interfaces and Dependencies

**Produces:**
- `PATCH /encounters/:id` now accepts `pc_levels` in body and auto-calculates XP
- Encounters page has full roster builder

**Depends on:**
- `GET /monsters?search=...` — existing endpoint, no changes needed
- `GET /adventures/:id` — to get campaign_id
- `GET /campaigns/:id/characters` — to get party levels

---

## Outcomes and Retrospective

_Fill in after completion._
