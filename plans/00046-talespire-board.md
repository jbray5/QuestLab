# Plan 00046 — TaleSpire-Style Board (branch: feat/board-talespire)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

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

## Shipped 2026-07-16 late (owner: "GO NUTS") — merged to prod
- Diorama scenes to production (Green + Midday, per-map scene table).
- Synced weather (migration 0025) — players' views render the DM's sky.
- Procedural WebAudio ambience (wind/birds/crickets/rain/fire crackle),
  zero assets, on the DM board + players' 3D view.
- Cinematic intro sweep on the players' view; ⚔ turn banner lower-third.
- Night starfield; prop wind-sway; token sizing hotkeys [ ].
- SCENES presets bar — one-click map+darkness+weather+title changes
  (localStorage per session); Saturday is four buttons.

## Shipped 2026-07-17 — wave 2, "the director's console" (prod @ 16d4fe2)
- 🌲 DIORAMIFY productized: image_tools (pure-python codec + footprint
  diff, treeline splitting, unit-tested), migration 0026
  (ground_url + props), POST /battle-maps/{id}/props, DB dioramas render
  on the board AND the players' view. Any map, one click, 1–3 min.
- FX broadcast channel: CAST palette (fire/frost/heal/arcane/ping) —
  bursts erupt on every screen; damage numbers broadcast to players.
- Soundboard: synthesized 🐺 howl / ⛈ thunder / 🎻 sting on all devices.
- 📏 measure ruler (cells + feet); overcast light tint for rain/snow.
- Terrain slider removed (owner call — flat board + props).

## Shipped 2026-07-17 — wave 3, "living skies" (prod @ 680bc54)
- Procedural sky dome: bucketed day↔night gradient with a real sun and
  moon that arc with the darkness slider; lightning flash rides the ⛈
  stinger (light + thunder land together on every screen).
- Flyers: seeded birds by day, bats by night (hidden in rain/snow).
- Bloom joined the Cinema post stack (torches/sun glow).
- Heightmap terrain fully excised from the render path (`ZERO_HEIGHT`,
  no `useHeightField`), `tableApi.generateTerrain` removed, and every
  prod map's `heightmap_url` nulled. Backend endpoint kept dormant.

## Wave 3 paradigm slice — branch only (feat/board-talespire @ b96e611)
- **POSSESS MODE**: double-click any figure (or select + 👁 Possess) and
  the camera snaps to its shoulder — eye-level inside the diorama, orbit
  constrained to a head-turn (polar/zoom clamps), target glued to the
  figure's head so it tracks movement. Esc / exit chip returns to the
  table. DM board + players' 3D Table View (players can possess too —
  "see through your character's eyes").
- **ScenicBand**: a 360° treeline ring (BackSide cylinder, ×3 repeat,
  blob-hosted strip) between board edge and sky on dioramified maps, so
  eye-level views get layered depth instead of bare dome.
- Judge on the Vercel preview; merge decision after Saturday.

## First milestones
- [ ] 1. Prototype: hardcoded prop list on the Waystone Midday map —
      billboard cut-out sprites for the two stones + a few trees; judge the
      look before building the pipeline.
- [ ] 2. Ground-layer generation + footprint diff (client-side prototype).
- [ ] 3. Prop sprite generation (shared library first).
- [ ] 4. props JSON + editor + auto-props endpoint (backend, merge-gated).
