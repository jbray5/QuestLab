# Plan 00110 — Milestone 2: atmosphere on the live table

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-17
**Last updated:** 2026-09-17
**Implemented by:** Claude Code
**Program:** [00107 — The Immersive Table](00107-immersive-table.md)

---

## Purpose
Milestone 1 made the engine a table. Milestone 2 makes it *the room the
players are in*: what the DM has not revealed is dark, the weather the DM
picked is in the air, and when the turn passes the camera cuts to whoever is
up instead of waiting for a button. This is the "whoa" milestone in Plan 107.

Every input already exists on the projection or the table stream — fog and
reveals, darkness, weather, the active token, the scene title, pings, hit
effects. Nothing is added server-side.

---

## Progress
- [x] Step 1: Fog of war — a soft-edged mask from the revealed regions and brush reveals; the unrevealed floor goes dark and nothing stands in it; the party always shown, as on the 2D table
- [x] Step 2: Weather — the DM's preset in the air: embers, fireflies, dust, rain, snow; rain and snow overcast the light
- [x] Step 3: The director — on a turn change the camera glides to the active figure, keeping the DM's bearing; "Follow the turn" holds it still; "Frame the turn" fires it by hand
- [x] Step 4: Cinema — the scene title card, DM pings rippling on the floor, damage and healing floating over the figure that took it and a flinch; the DM's light tokens as lanterns
- [x] Step 5: Verified against the "Into the Fey" session with fog on, two reveals, fireflies, then rain — the session put back exactly; gate green

---

## Surprises and Discoveries
- **Fog of war is a canvas.** The DM's reveals are polygons and circles in
  picture pixels; drawn black onto a white canvas with a blur, they become an
  alpha map for a dark plane over the floor — a soft-edged hole wherever the
  DM has revealed. The same shapes, as a point test, decide what may stand:
  a wall, a torch, a table or a figure whose spot is unrevealed is simply not
  rendered. No shader touched any material.
- **The 2D table already had the rule for tokens under fog** — hide anyone
  who isn't the party and isn't revealed — and it is the right rule, so the
  engine follows it rather than inventing a second one.
- **The DM's light tokens are torches.** The 3D board treated `kind: "light"`
  tokens as torches; the engine now does too, as lanterns on posts, so a
  light the DM drops on the table lights the room here as well.
- **The React Compiler's rules keep shaping this code**: no `Math.random`
  in render (weather scatters from a hash), no `setState` in an effect (the
  title card is keyed by its text and animates itself out), no ref reads in
  render (the arrival title is state set once).
- **Not exercised alone:** the glide on a turn change and a live ping. Both
  ride events the Table View already handles; the glide's math is the same as
  "frame the turn", which does work. They want two screens and a DM.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-17 | Fog of war in 3D | (a) shader on every material (b) a dark plane over the floor with the mask as alpha, and nothing rendered where unrevealed | (b) | (a) is a week of shader work across props, walls, water and figures; (b) is a canvas and a visibility test, and reads the same from the TV. |
| 2026-09-17 | Figures under fog | show / hide | hide | A token the players cannot see is one they cannot see. The Table View hides them; so does this. |
| 2026-09-17 | The camera on a turn | cut vs. glide | glide, ~1.2 s | A hard cut on a TV reads as a glitch; a glide reads as a director. |
| 2026-09-17 | Weather | one particle system per preset | Sparkles for embers/fireflies/dust; a falling point cloud for rain and snow | The presets already exist on the table; the engine matches them rather than inventing its own. |

---

## Context and Orientation
- `frontend/src/engine/fogOfWar.ts` — the mask and the reveal test
- `frontend/src/engine/Weather.tsx`
- `frontend/src/engine/Director.tsx` — the camera glide
- `frontend/src/engine/Fx.tsx` — pings, floating numbers, the title card
- `frontend/src/engine/Scene.tsx`, `Party.tsx`, `EngineTable.tsx` — wired

---

## Validation and Acceptance
- [x] Fog on with two reveals: the revealed ground lit, the rest dark, the party shown, Edrik shown inside his reveal
- [x] Weather set to fireflies: fireflies; to rain: rain, overcast
- [ ] Advance the turn: the camera glides to the new figure — *Justin, on the TV*
- [ ] A DM ping lands where the DM clicked; damage floats over the right figure — *Justin, on the TV*
- [x] Gate green

---

## Outcomes and Retrospective
_To be filled in on completion._
