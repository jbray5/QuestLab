# Plan 00006 — Session HUD

## Status
[x] In progress

**Started:** 2026-03-15
**Last updated:** 2026-03-15
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

DMs running hybrid sessions (physical minis/maps + digital tool) need a single persistent
screen that shows everything needed mid-session without page navigation: party HP/conditions,
current scene from the AI runbook, an initiative/combat tracker, a dice roller, and a quick
rules reference. The existing SessionRunner page mixes prep-view and run-view awkwardly; this
HUD is a separate purpose-built page at `/sessions/:sessionId/hud`.

All HUD state that is transient (conditions, spell slots, dice, initiative) lives in React
local state — it resets each session which is correct. Persistent state (HP changes, session
notes) is written through existing API endpoints.

---

## Progress

- [x] Step 1: Write plan
- [x] Step 2: Create `frontend/src/pages/SessionHud.tsx`
- [x] Step 3: Add route in `frontend/src/App.tsx`
- [x] Step 4: Add HUD button to `Sessions.tsx`
- [x] Step 5: Add HUD link to `SessionRunner.tsx`
- [x] Step 6: Verify build passes (`npm run build`)
- [x] Step 7: Commit & push

---

## Surprises and Discoveries

- Sessions have `attending_pc_ids` (UUIDs) but no direct link to campaign_id — need to
  GET /adventures/:id to find campaign_id, then GET /campaigns/:id/characters.
- Runbook may not exist yet for a session — HUD must gracefully handle missing runbook
  with a "Generate runbook first" prompt that links to SessionRunner.
- `hp_current` is a persisted field on PlayerCharacter — PATCH /characters/:id is the
  right write path for HP changes in the HUD.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-03-15 | HP tracking | Session-local only vs persist via API | Persist via PATCH /characters/:id | Hybrid play: HP carries between tool and physical table |
| 2026-03-15 | Conditions | Persist vs local state | Local state (ephemeral) | Conditions clear end of session, no backend needed |
| 2026-03-15 | Spell slots | Persist vs local state | Local state per-caster map | Resets per session, no schema change needed |
| 2026-03-15 | Initiative tracker | Re-use SessionRunner component vs rebuild | Rebuild inline in HUD | SessionRunner version is tightly coupled to its page state |
| 2026-03-15 | Layout | Single column vs multi-panel | Multi-panel (CSS grid) | DM needs everything visible simultaneously |

---

## Context and Orientation

### Files touched
```
frontend/src/pages/SessionHud.tsx     — CREATE (main new page)
frontend/src/App.tsx                  — MODIFY (add route)
frontend/src/pages/Sessions.tsx       — MODIFY (add HUD button)
frontend/src/pages/SessionRunner.tsx  — MODIFY (add HUD link)
```

### Architecture layers involved
- `frontend/src/pages/` — UI only, no business logic
- All data reads/writes go through `frontend/src/api/` clients
- No backend changes required

### Key terms defined
- **HUD** — Heads-Up Display; single persistent screen kept open during play
- **Runbook** — AI-generated session plan (opening, scenes, NPC dialog, encounter flows)
- **Condition** — D&D 5e status effect (Blinded, Charmed, etc.) applied to a creature
- **Attending PCs** — subset of campaign characters playing in a specific session
- **Ephemeral state** — React useState, lost on page reload (intentional for conditions/slots/dice)

---

## Concrete Steps

### Step 1: Write plan
**File:** `plans/00006-session-hud.md`
**Action:** Create
**Verify:** File exists with this content

### Step 2: Create SessionHud.tsx
**File:** `frontend/src/pages/SessionHud.tsx`
**Action:** Create
**Details:** See implementation. Layout: CSS grid 3-column on wide screens, stacked on narrow.
- Left panel: Party Tracker (HP, AC, passive perception, conditions, spell slots)
- Center panel: Scene Navigator (runbook scenes, read-aloud, DM notes, prev/next)
- Right panel: Combat (initiative tracker, round counter, conditions per combatant)
- Bottom bar: Dice Roller + Quick Rules Reference (collapsible accordions)
**Verify:** Page renders at `/sessions/[id]/hud` without errors

### Step 3: Add route
**File:** `frontend/src/App.tsx`
**Action:** Modify — add `<Route path="/sessions/:sessionId/hud" element={<SessionHud />}/>`
**Verify:** Navigating to the URL renders the page

### Step 4: Add HUD button in Sessions.tsx
**File:** `frontend/src/pages/Sessions.tsx`
**Action:** Modify — add "🖥 HUD" button next to existing "▶ Run" button
**Verify:** Button visible in session list, navigates to HUD

### Step 5: Add HUD link in SessionRunner.tsx
**File:** `frontend/src/pages/SessionRunner.tsx`
**Action:** Modify — add "Open HUD" link/button in the page header
**Verify:** Link visible, navigates correctly

### Step 6: Build check
**Action:** `cd frontend && npm run build`
**Verify:** Zero TypeScript errors, build succeeds

### Step 7: Commit & push
**Verify:** `git log --oneline -1` shows new commit on main

---

## Validation and Acceptance

- [ ] `cd frontend && npm run build` — zero errors
- [ ] Navigate to `/sessions/:id/hud` — page loads with 3 panels
- [ ] Party panel shows all attending PCs with HP bars, editable HP
- [ ] Clicking a condition tag adds/removes it from a PC
- [ ] Scene panel shows runbook scenes with prev/next navigation
- [ ] Dice roller produces results for all die types
- [ ] Quick reference accordion opens/closes for Conditions, Actions, Death Saves
- [ ] HUD button visible on Sessions page
- [ ] HUD link visible on SessionRunner page

---

## Idempotence and Recovery

All steps are safe to re-run. If interrupted mid-file, delete the partial file and
re-create from scratch. No DB migrations or destructive operations.

---

## Interfaces and Dependencies

**Produces:**
- New page `/sessions/:sessionId/hud`
- Entry point buttons on Sessions and SessionRunner pages

**Depends on:**
- `GET /sessions/:id` — session data (attending_pc_ids, adventure_id, status)
- `GET /adventures/:id` — to resolve campaign_id
- `GET /campaigns/:id/characters` — character list
- `GET /sessions/:id/runbook` — AI runbook (optional)
- `PATCH /characters/:id` — HP persistence
- Existing API clients: sessions.ts, adventures.ts, characters.ts

---

## Outcomes and Retrospective

_Fill in after completion._
