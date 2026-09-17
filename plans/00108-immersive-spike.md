# Plan 00108 — Immersive spike: the same tavern, both ways

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-17
**Last updated:** 2026-09-17
**Implemented by:** Claude Code
**Program:** [00107 — The Immersive Table](00107-immersive-table.md)

---

## Purpose
Justin wants to see hybrid (painted map + extruded walls + lit props) against
full-3D (procedural room + photoscanned materials) before choosing. The honest
way to show that is not screenshots of other products — it is *the same scene
both ways, with his own map, in his own browser, on the TV*.

Map: **Margarita-shire (Day)** — the Haunted Dockside Tavern, a Czepeku
interior with rectilinear rooms. (Restwater was the first thought; Justin
pointed out it isn't a Czepeku base, and the point is proving the hybrid on
the library he owns.)

---

## Progress
- [x] Step 1: Trace the taproom, the right wing and the lower block as wall segments (16 segments, 9 torches)
- [x] Step 2: `normalMap.ts` — relief from the map image, in the browser
- [x] Step 3: `Torch`, `Walls`, `Walker` (Soldier.glb placeholder, walks on click)
- [x] Step 4: `HybridScene` + `BuiltScene` sharing the layout, lights and post
- [x] Step 5: `/engine/spike` route; `Board3D` untouched (one lazy import + one route line in `App.tsx`)
- [x] Step 6: Screenshots of both and a mid-walk frame; one tuning pass (camera lower and closer, brick cooled, sconces)
- [ ] Step 7: Deploy; Justin looks on the TV

---

## Surprises and Discoveries
- **The TV machine has a GTX 1080.** Found by asking headless Chrome what its
  WebGL renderer was. Plenty for this.
- **Headless Chrome's `--screenshot --virtual-time-budget` is the wrong tool
  for a WebGL scene.** It returned a black canvas for the built scene at any
  budget while the DOM proved the canvas had mounted and nothing had errored —
  virtual time races ahead of real image decode and GPU upload. Replaced with a
  puppeteer-core harness (scratchpad, not the repo) that waits for the page's
  own loading line to clear plus real seconds, echoes the console, and can
  click the floor to catch the character mid-walk. Every visual check from
  here on goes through it.
- **A black screen tells nobody anything.** The page now catches scene errors
  and prints them in the corner, and shows what is still loading. That is how
  the false alarm above was disproved in one look.
- **R3F's `shadows` boolean sets three's deprecated `PCFSoftShadowMap` and
  re-applies it on every Canvas render**, which in r185 logs a warning per
  frame. Pass `shadows={{ type }}` instead of setting the type in `onCreated`.
- **The React Compiler lint rules shape three.js code more than expected.**
  Mutating a texture returned from `useTexture` is flagged; the clean answer is
  to configure a *clone* inside `useMemo` (a clone shares the image, so it is
  only a second GPU upload). And tiling by cloning textures per wall would have
  been ~48 GPU textures — scaling each wall's UVs against one shared material
  is the right way.
- **The built scene is empty, and that is the finding.** Same walls, same
  torches, same character: the hybrid has a hearth, tables, a rug and barrels
  because the painter drew them; the built floor has boards. Full-3D without a
  large prop library is a corridor with nothing in it.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-17 | Same layout in both scenes | separate showpieces vs. one wall list | one wall list | Apples to apples: the only variable is the floor. |
| 2026-09-17 | Placeholder character | Mixamo (needs an Adobe login) vs. three.js's Soldier.glb from a CDN | Soldier.glb | Real proportions, Idle/Walk/Run clips, no account. Not shipped in the repo — loaded at runtime for the spike only. Real characters come from the Character Creator pipeline. |
| 2026-09-17 | Map at 2K, not 30 MP | — | uploaded a 2K derivative | A 4620×6440 JPEG decoded into a texture is the HUD-lag mistake (Plan 99). |
| 2026-09-17 | Textures | Poly Haven, CC0 | `castle_brick_02_red`, `cobblestone_floor_04`, `weathered_brown_planks` at 1K | CC0, so they can live in `public/` and ship. |

---

## Validation and Acceptance
- [x] Both scenes render with the torches lighting floor, walls and character together — the
      character's shadow falls on the painted boards
- [x] The character turns, walks where the floor is clicked, and idles on arrival
      (mid-walk frame captured by the harness)
- [ ] Justin can say which direction Milestone 4 takes

---

## Outcomes and Retrospective
_To be filled in on completion._
