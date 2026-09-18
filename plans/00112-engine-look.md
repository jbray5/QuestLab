# Plan 00112 — The look: lighting and post the browser can afford

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-17
**Last updated:** 2026-09-17
**Implemented by:** Claude Code
**Program:** [00107 — The Immersive Table](00107-immersive-table.md)

---

## Purpose
Justin, looking at his party on the table: "is this about as detailed as we can
run in-browser?" No — the renderer was a week old with one light rig and two
effects. This plan spends the browser's real budget on the three things that
separate "a lit scene" from "a game": image-based lighting so materials
reflect the room, ambient occlusion so figures sit on the floor, and a
cinematic depth of field when the camera frames a turn. Nothing here adds an
asset over 500 KB; the environment comes from a CDN like the Soldier does.

---

## Progress
- [ ] Step 1: Image-based lighting — a night environment map (`Environment preset="night"`) at low intensity under the torches, a brighter one for day maps; metals, leather and skin pick up specular
- [ ] Step 2: Ambient occlusion — N8AO in the post stack, half-res, so feet, props and wall bases have contact shadow
- [ ] Step 3: Depth of field — autofocus on the active figure (or the look target) with a small bokeh, on by default, a **Cinema** toggle to turn it off; SMAA in place of MSAA so the post chain stays crisp
- [ ] Step 4: Verified on the spike and the live table — frames before/after, no console errors; gate green

---

## Surprises and Discoveries
_To be filled in._

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-17 | Environment source | ship an HDR / procedural room / drei preset from CDN | drei preset (CDN) | A 1K HDR is ~1.5 MB, over the repo's file cap; the preset is the same file hosted, and the Soldier already comes from a CDN. |
| 2026-09-17 | AO | SSAO (postprocessing) / N8AO | N8AO | Already installed as a dependency; better quality per cost; half-res is enough on a TV. |
| 2026-09-17 | DoF default | off / on | on, with a toggle | The glide already reads as a director; the focus pull finishes the shot. Off is one click for a DM who wants everything sharp. |

---

## Validation and Acceptance
- [ ] Creed's plate and the leather sets show environment reflection under torchlight
- [ ] Feet and furniture bases have contact shadow; nothing floats
- [ ] Framing a turn pulls focus to that figure; Cinema off makes everything sharp
- [ ] No console errors on the spike (tavern, restwater, abode) or the live table
- [ ] Gate green

---

## Outcomes and Retrospective
_To be filled in on completion._
