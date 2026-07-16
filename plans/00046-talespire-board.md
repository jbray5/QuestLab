# Plan 00046 — TaleSpire-Style Board (branch: feat/board-talespire)

## Status
[x] Not started  [ ] In progress  [ ] Blocked  [ ] Complete

**Branch:** `feat/board-talespire` — experimental; `main` stays Saturday-stable.
**Created:** 2026-07-16, after the heightmap-terrain experiment was reverted on
prod (kept in code, dormant — no map carries a heightmap now).

---

## Why the heightmap approach hit its ceiling
A heightfield is 2.5D: one height per point, painted pixels pushed straight
up. Verdict from live testing (owner, 2026-07-16):
- Features painted with visible sides (monolith, tree trunks) extrude
  "lying down"; strict-ortho art helps but can't create free-standing
  geometry, overhangs, or vertical faces.
- The pipeline is fragile to tonal quirks: a slightly-light road became a
  raised dike after percentile normalization + mesa sharpening amplified it.
- Great for gentle relief (hills, hollows); wrong tool for the "walk around
  the monolith" 360° feel the owner wants.

## The TaleSpire-like target
The board as a diorama of **flat(ish) ground + upright props**: tall features
stand as true vertical elements you can orbit, tokens walk *between* them.

## Architecture sketch (to be refined on this branch)

1. **Ground/prop separation (AI):** run the map through gpt-image-1 edit
   twice — (a) "repaint with all tall features removed, continuous ground
   only" → the ground layer the board drapes flat (or with GENTLE relief);
   (b) diff original vs ground layer → connected blobs = tall-feature
   footprints (deterministic, no vision-model JSON parsing needed).
2. **Prop sprites:** per footprint, classify coarsely (tree / stone /
   structure by color+shape heuristics or one cheap vision call), then
   reuse the minifig pipeline: transparent upright cut-out sprites
   ("ancient mossy standing stone, front view, die-cut game asset…") —
   or a small pre-generated shared prop library (fastest, most consistent).
3. **Data:** `battle_maps.props` JSON — `[{id, kind, x, y, scale,
   sprite_url}]` (additive migration when it lands on main).
4. **Render:** ground plane + billboard cut-out props (double-billboard
   cross-quads for near-360 solidity), fake contact shadows, existing
   lighting/weather/backdrop stack unchanged. Tokens keep the flat grid.
5. **Editor affordances:** drag/scale/delete props on the DM board; "🌲
   Auto-props" button runs the pipeline; manual "+ Prop" from the library.

## Environment / workflow rules for this branch
- `main` auto-deploys to prod (Render API + Vercel). **Do not merge until
  after Saturday 2026-07-18.**
- Vercel builds a **preview URL per push** to this branch — frontend
  experiments are safely viewable there.
- The preview frontend talks to the **prod API/DB**. Therefore: frontend-
  first experimentation; any schema change stays on the branch (never run
  alembic against prod from here) and lands as an additive migration only
  at merge time. If the branch runs long, spin a true dev stack (second
  Render service + dev Postgres) — decision deferred.

## First milestones
- [ ] 1. Prototype: hardcoded prop list on the Waystone Midday map —
      billboard cut-out sprites for the two stones + a few trees; judge the
      look before building the pipeline.
- [ ] 2. Ground-layer generation + footprint diff (client-side prototype).
- [ ] 3. Prop sprite generation (shared library first).
- [ ] 4. props JSON + editor + auto-props endpoint (backend, merge-gated).
