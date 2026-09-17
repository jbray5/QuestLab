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
- [x] Step 7: Deploy; Justin looks on the TV — "FUCK YES"
- [x] Step 8 (second pass): furniture and a bar in both scenes (Poly Haven CC0 photoscans off their
      CDN), a hearth with fire, the combat grid with cell-snapped walking — Justin: "I really want
      the second one to be the standard, but I don't want to lose all the cool details from the map"
      and "will I still be controlling movement on a grid?"

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
- **Poly Haven's glTFs point at textures that aren't where the glTF says.** The
  files reference `textures/x.jpg` beside the model; the CDN keeps them in a
  separate `Models/jpg/1k/<model>/` tree. Every prop loaded untextured and
  silently flat — the cabinet included, though its base colour hid it. A
  scoped `setURLModifier` on the loading manager rewrites just that host and
  path shape. Found because the harness echoes the page console.
- **Every `Barrel_0x` on Poly Haven is an oil drum.** Tags say so; the render
  said so louder. Only `wine_barrel_01` is wood.
- **The sanity check found what the eye can't.** Justin: "we need like a
  sanity check for each map — what is normal spacing for doorways, what makes
  sense for a building." The first run on Restwater: every interior door I had
  traced from the painted door arcs was 2–3 ft wide, so the flood fill reported
  320 of 384 cells unreachable from the hall — the house was sealed. Both maps'
  walls sat ~2 ft off their cell edges because the painted buildings were never
  aligned to their own grids. In the built route the picture is only a
  blueprint, so the fix is free: walls snap to cell edges, a door is one cell,
  a sconce hugs its wall. Restwater's walls are now written *on the grid*
  (column/row fractions) rather than traced, which is what a builder would do
  and what Milestone 4's editor should produce.
- **A floating-point crumb sealed a bedroom.** With the walls written on the
  grid, one room still came back unreachable while the check also reported a
  5 ft doorway right there. A wall end of `-5.000000000000001` was landing in
  the cell before it under `Math.floor`. The rasterizer needs a tolerance.
- **Fewer rooms, and a way down.** Justin: "fewer rooms in the bathhouse and
  ideally would love a ladder down to her creepy abode." The bathhouse is now
  a store, two bedrooms, the hall, a kitchen and a back room, with a trapdoor
  and ladder in the back room's corner and a sickly green light seeping up.
  The abode below is built from the Session 7 notes and only from them — the
  hidden floor door, the ladder, a cache, the letters to and from Tavish — as
  one low green-lit chamber with an inner room. The notes say the door is
  hidden under abjuration until found; the engine shows it for now, and
  revealing it becomes a DM control later. Maps now link: click the hatch and
  the engine switches to the map below; the ladder there comes back up.
- **"More cave like. Full of green hag trinkets and decor. More menacing."**
  The abode is a cavern now: a ring of rock at odd angles (walls take
  diagonals), a rock floor, fog more than twice as thick as a night outdoors,
  root clusters hung upside down through the roof, a stone fire pit with her
  pot on it throwing red against her green lamps, jars, baskets, a bucket, a
  dead branch or two, a mossy boulder, the letters on a table with a dagger
  stuck upright in it, the cache in a nook at the back. All Poly Haven, all
  CC0, ~50 MB from their CDN on first open — Milestone 4 hosts optimized props
  ourselves. Two things it taught: a model with no 1K glTF (`decorative_book_
  set_01`) would have blanked the whole scene through the error boundary, so
  the registry is worth validating at build time; and the check needed to
  know that beyond a cave's walls is rock (`solid`), or it reports the earth
  as unreachable rooms.
- **A picture's lanterns are not sconces.** The three lamps beside the pools
  are posts standing on their own; the check needed a `kind` to know that.
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
- [x] The same furniture stands in both scenes, so "hybrid + props" and "built + props" are
      compared directly — Justin's "torn" is now a look, not a guess
- [x] Movement snaps to cells; the destination cell is marked; the walk plays between cells
- [x] Justin can say which direction Milestone 4 takes — "I've seen enough. Let's go this
      route." Then, sharper: "I want the built scene not hybrid with furniture." **Built, with
      furniture, is the standard.** The painted map is the blueprint the props are placed from.
- [x] Third pass: the scene is data (`MapDef`), Restwater is the second map, the pools are
      reflective water with ripples and steam ("I love the steam"), and a sanity check lints
      every map the way a builder would — doorway widths, walls meeting at corners, walls on
      cell edges, sconces on walls, props out of walls, every cell reachable from the start

---

## Outcomes and Retrospective
_To be filled in on completion._
