# Plan 00058 — The Temple Companion (DM cockpit, Session 5)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

Built and shipped 2026-07-31 (`d7b077b`), five days before the freeze.
Blueprint arrived mid-build, so the canvas is the DM's real scene rather
than a placeholder. Frontend-only; CI green. Pending: the DM's painted
cutaway (set `ART_URL` in `TempleCompanion.tsx`) and the post-fight
scene script (drawer currently carries the pointer only).

**Started:** 2026-07-31
**Last updated:** 2026-07-31
**Implemented by:** Claude Code

---

## Purpose

A DM-only cockpit for the drowned-temple crawl: painted cutaway canvas,
six clickable room pins, and a drawer showing ONE room's full run-content
at a time — read-aloud, mechanics, DCs, stat lines, persistent checkboxes.
Plus a draggable "party is here" marker and a boss tracker (Nerea HP,
damage-triggered phase banners, lair actions, ally toggles, round counter).
The DM's eyes never hunt: click where the party is, everything for that
moment is in the drawer.

Ship before the **Thursday 2026-08-07** freeze. If it slips, Saturday runs
from the printed blueprint + one-pager — so the print view is a first-class
deliverable, not a nicety.

---

## Progress

- [x] Step 0: blueprint hunt + inventory (2026-07-31) — see Surprises
- [ ] Step 1: `templeContent.ts` — rooms/boss data, verbatim
- [ ] Step 2: `templeCss.ts` — cockpit + print stylesheet
- [ ] Step 3: `TempleCanvas.tsx` — placeholder cutaway, pins, party marker
- [ ] Step 4: `BossMode.tsx` — HP, phases, lair actions, allies, rounds
- [ ] Step 5: `TempleCompanion.tsx` — shell, drawer, keys, persistence
- [ ] Step 6: route + nav
- [ ] Step 7: explorable hash deep-links (#covenant/#glyphs/#lantern/#kept)
- [ ] Step 8: typecheck + build + gate + commit

---

## Surprises and Discoveries

- **`Temple_Blueprint_DM.html` is not on this machine.** Searched the repo,
  Downloads, Desktop, Documents — absent (only two 4K temple .mp4 files in
  Downloads). The handoff itself carries the room flow and all room content
  verbatim, so nothing is blocked; only the blueprint's SVG scene (the
  intended placeholder canvas) is missing. Authoring an equivalent
  placeholder cutaway instead — one `CUTAWAY_ART` constant swaps it for the
  DM's painted art when it lands.
- **Zero backend.** Content is DM-only and static; checkbox/tracker state is
  per-campaign localStorage (same pattern as scene presets). No tables, no
  migration, no API — which is exactly the isolation posture this close to
  the freeze.
- The explorable had no deep-link support, so "open explorable → Covenant
  Stone" would have dumped the DM on the room view. Added `#hash` opening to
  `session-05-temple.html` and republished the same artifact URL.
- Tide Gate's tile order ⬟ ● ▲ ✦ = H-O-M-E in the established alphabet —
  continuity with Maren's Table holds, no new glyphs introduced.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-07-31 | Where it lives | in-app route / standalone HTML artifact | in-app DM route | Handoff says "DM-only route, standard auth"; keeps keyboard + persistence + links native |
| 2026-07-31 | Persistence | DB table / localStorage | localStorage per campaign | "Storage pattern of choice"; zero backend risk before freeze; a cleared browser costs only checkbox state |
| 2026-07-31 | Canvas art | wait for DM art / placeholder now | placeholder cutaway SVG now | Unblocks the whole build; art swaps via one constant |
| 2026-07-31 | Phase banners | manual DM toggle / auto by damage | auto by cumulative damage dealt | Handoff says "auto-light by damage dealt"; DM tracks HP anyway |
| 2026-07-31 | Explorable links | plain URL / hash deep-link | hash deep-link | Lands on the exact panel named in the room content |

---

## Context and Orientation

### Files touched
- `frontend/src/components/temple/templeContent.ts` (create)
- `frontend/src/components/temple/templeCss.ts` (create)
- `frontend/src/components/temple/TempleCanvas.tsx` (create)
- `frontend/src/components/temple/BossMode.tsx` (create)
- `frontend/src/pages/TempleCompanion.tsx` (create)
- `frontend/src/App.tsx`, `frontend/src/pages/Layout.tsx` (route + nav only)
- `campaigns/session-05-temple.html` (hash deep-links)

**Untouched:** every backend layer, board, presets, player views, combat,
market, crier, notebook.

### Key terms defined
- **Room** — one stop on the descent: id, numeral, title, kind (puzzle /
  lore / trap / choice / soul / boss), read-aloud, mechanics beats,
  checkboxes, optional explorable link.
- **Beat** — a line in a room's drawer. Some carry a persistent checkbox.
- **Party marker** — a token on the canvas the DM drags or arrow-keys along
  the route; the room it sits on glows.
- **Phase banner** — a boss-mode banner that lights automatically once
  cumulative damage dealt crosses 25 / 50 / 75.

---

## Concrete Steps

### Step 1: Content
**File:** `frontend/src/components/temple/templeContent.ts` · Create
Rooms ①②Ⓣ③④⑤ with read-aloud, mechanics, checkbox ids, colors, and the
boss/ally/lair stat data — **transcribed verbatim from the handoff; nothing
invented or embellished.**
**Verify:** every string traceable to the handoff.

### Step 2: Styles
**File:** `templeCss.ts` · Create
Cockpit grid, pin colors by kind, drawer, stat cards, boss banners, and a
`@media print` block that collapses to the one-page legend (paper fallback).

### Step 3: Canvas
**File:** `TempleCanvas.tsx` · Create
Placeholder cutaway SVG (ship → tide gate → nave → gallery → bell well →
cell → heart), six positioned pins, glow on current room, draggable party
marker snapping to the nearest pin.
**Verify:** clicking a pin opens its drawer; dragging the marker moves it.

### Step 4: Boss mode
**File:** `BossMode.tsx` · Create
Nerea HP tracker (+/−, damage-dealt derived), three auto phase banners,
four lair-action buttons (used-this-round, reset on round advance), Edrik
freed toggle (removes Chains Tighten, shows ally line), Mira toggle with
her own HP tracker, round counter, muted flavor line.

### Step 5: Shell
**File:** `TempleCompanion.tsx` · Create
Canvas + drawer layout, keyboard map (1–5 · T · B · arrows · P),
localStorage persistence per campaign, print view.

### Step 6–8: Route `campaigns/:campaignId/temple`, nav entry, explorable
hash links, typecheck + vite build + gate + commit.

---

## Validation and Acceptance

- [ ] `tsc --noEmit` and `vite build` clean; python gate untouched-but-green
- [ ] Click each pin → correct room content; checkboxes survive reload
- [ ] Keys: 1–5, T, B, arrows, P all work
- [ ] Boss: HP down 25 → banner 1; 50 → banner 2; 75 → endstate; lair
      buttons mark used and reset on round advance; Edrik freed removes
      Chains Tighten and shows his line; Mira card toggles
- [ ] Explorable links land on the named panel
- [ ] **Print view is a clean one-page legend** — the fallback that must
      work even if everything else does not

## Idempotence and Recovery
All file creates; no migration, no server state. Progress boxes are the
restart guide.

## Interfaces and Dependencies
**Produces:** `/campaigns/{id}/temple` DM cockpit.
**Depends on:** campaign route shell; the published temple explorable.
Post-fight scene script arrives separately (pointer only).

## Outcomes and Retrospective
_Fill in after completion._
