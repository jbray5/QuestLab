# Plan 00107 — The Immersive Table (program)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-17
**Last updated:** 2026-09-17
**Implemented by:** Claude Code

This is a *program* — a months-scale build made of several ExecPlans. It holds
the decisions and the milestone map; each milestone gets its own numbered plan.

---

## Purpose
Justin: "I want a much more immersive tabletop experience for my players. I
don't care what we have to do or provision or how long it takes to build." The
reference is TaleSpire, with one correction — "I don't want ours to look like
toys or miniatures. I'd rather 3D models of the players that walk when they
move."

Stood up **alongside** the current board. Nothing in `Board3D.tsx`, the Table
View, or the HUD is altered or torn down. The new engine is another client of
the same table state.

---

## What TaleSpire has that we don't (the diagnosis)
Looking at the two screenshots side by side, the gap is not a better map:

1. **Geometry with height** — walls, arches, a raised platform. Light needs
   surfaces to hit.
2. **Real lighting** — the torches are light sources that throw warm pools,
   cast shadows, and glint on wet stone.
3. **Post-processing** — bloom on flame, fog in the far corridor, a vignette,
   a warm grade.
4. **A low, close camera** — eye level with the scene, not a surveyor's view.

Nearly all the immersion is 2, 3 and 4; geometry is what makes them land.

**Why our "popups on a flat map looked goofy":** every material in the current
board is `meshBasicMaterial` — *unlit*. The map ignores light, the standees
ignore light, and the one torch `PointLight` in there illuminates nothing. The
map has its painted light, each standee has its portrait's painted light, and
none of them agree. The design principle for the new engine follows directly:
**nothing unlit, ever.** One set of lights, everything casts on everything.

**The "toy" look** comes from specific, avoidable things: tilt-shift depth of
field (the miniature-photography trick), bases under figures, glossy
painted-plastic materials, frozen poses, over-scaled props. We use matte PBR,
true-scale proportions, idle/walk animation, no base (a soft ground ring only
on selection), and DoF only as a cinematic accent.

---

## Milestones

| # | Milestone | Plan | What the players see |
|---|---|---|---|
| 0 | **Spike** — the same tavern both ways, in the browser; then Restwater, its pools, the abode below, furniture, the grid, the sanity check | [00108](00108-immersive-spike.md) | A choice made: built + props |
| 1 | Parity — engine joins a session, renders today's map + tokens live | 00109 | The table, in the new renderer |
| 2 | Atmosphere — lights, fog, post, a cinematic camera that cuts to whoever's turn it is | 00110 | "Whoa" |
| 3 | Characters — animated models for the party and monster types; a move becomes a walk | 00111 | Their character walking across the room |
| 4 | Height — DM-painted walls extruded, doors, props, navmesh so walks go *around* things | 00112 | The room is a room |
| 5 | Full 3D tile building (optional; decided by the spike) | — | — |

Milestone 2 is where it lands. Aim there first, then 3.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-17 | Engine | (a) Godot 4 native app for the TV (b) three.js in the browser (c) Unity | **(b)** | Justin: "can't I just run it in the browser and over screen share?" — yes. The board is *already* React Three Fiber + drei + postprocessing; Godot's only edge was built-in tooling and its web export can't run the renderer features we'd pick it for. Browser also means remote players open the immersive view directly at full quality rather than a compressed Discord stream. |
| 2026-09-17 | Where it lives | (a) new app in `engine/` (b) new component tree in the existing frontend | (b) `frontend/src/engine/` | Shares the API client and the event stream; deploys with everything else; `Board3D.tsx` untouched. "Alongside" without a second build pipeline. |
| 2026-09-17 | Renderer backend for the spike | (a) WebGPU (`three/webgpu` + TSL post) (b) WebGL2 + pmndrs postprocessing | (b) for now | The postprocessing stack already in the app is WebGL-only; the spike should answer the *design* question, not port a pipeline. WebGPU is a later, contained swap. |
| 2026-09-17 | Content strategy | (a) full 3D tiles from day one (b) hybrid: keep the painted maps as the ground, extrude DM-painted walls, place lit props | (b) first, (a) decided by the spike | 42 Czepeku maps are the art Justin owns and they are good. An engine with nothing to render is an empty room. |
| 2026-09-17 | Player likenesses | (a) parametric builder (b) commission (c) generate | Humanoids: (a) Reallusion Character Creator, driven by Justin. Creed (dragonborn) and Steven (gnome): buy a rigged model or commission first; generate last. | Justin: "In, but as non-AI as possible." Four of six are humanoid and a person with the portraits does that better than code. |
| 2026-09-17 | Animation | Mixamo rigs + clips → Blender → glTF | — | Free, hundreds of clips, the standard pipeline. |
| 2026-09-17 | Remote players | Screen share vs. direct URL | Both; URL is better | Justin: "screen share is fine." A browser engine gives them the URL for free. |
| 2026-09-17 | **The standard, after the spike** | hybrid + props vs. built + props | **built + props** | Justin, on seeing both furnished: "I want the built scene not hybrid with furniture." The painted map is the blueprint the props are placed from, not the floor. Hybrid stays as a comparison toggle only. |
| 2026-09-17 | Scene data | hardcoded per page vs. a definition per map | a `MapDef` per map, normalized on load, linted | "Let me see you do this with Restwater" made it two maps; the sanity check made the definitions honest. This is the seed of Milestone 4's editor and of the per-map scene row. |
| 2026-09-17 | Linked maps | flat vs. exits between maps | exits (`down`/`up`) | "A ladder down to her creepy abode." A map names another; click the hatch and the engine switches. Levels are just maps with exits. |

---

## The hybrid's honest risk
Czepeku maps have walls, furniture and shadows painted *in*, usually with one
fixed light direction. A 3D torch beside a painted shadow argues with it; a wall
extruded over a painted wall is a wall standing on a picture of a wall.

Three mitigations, all cheap, all in the spike:
- **A normal map generated from the map image.** Luminance becomes relief, so
  torchlight catches the painted flagstones and the floor is part of the lit
  world. The single biggest "not a photo of a map" trick.
- **Treat the map as albedo, not a finished picture** — low ambient, the
  torches dominate, the painted shading recedes.
- **Extruded walls sit on the painted wall lines and occlude them.**

Whether that is enough is exactly what the spike must show.

---

## How Justin helps
- Get Reallusion Character Creator and build Nya, Sarranthia, Thane and Willa
  from their portraits (an evening each, at most).
- Approve a model budget (~$200) for the dragonborn, the gnome, and a monster
  set.
- Look at the spike on the TV and choose.

---

## Constraints carried from the rest of the app
- Player-facing surfaces contain no secrets (players view source).
- Licensed art (Czepeku maps, the DMs Guild extract) is for Justin's table and
  never ships publicly or appears in marketing.
- No generative AI in the product; Justin's own table content is his call.

---

## Outcomes and Retrospective
_Per milestone, in each milestone's plan. Program-level findings here._
