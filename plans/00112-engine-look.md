# Plan 00112 — The look: lighting and post the browser can afford

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-09-17
**Last updated:** 2026-09-18
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
- [x] Step 1: Image-based lighting — a night environment map (`Environment preset="night"`) at low intensity under the torches, a brighter one for day maps; metals, leather and skin pick up specular
- [x] Step 2: Ambient occlusion — N8AO in the post stack, half-res, so feet, props and wall bases have contact shadow
- [x] Step 3: Depth of field — autofocus on the active figure (or the look target) with a small bokeh, on by default, a **Cinema** toggle to turn it off; SMAA in place of MSAA so the post chain stays crisp
- [x] Step 4: Verified on the spike and the live table — frames before/after, no console errors; gate green

---

## Surprises and Discoveries
- MSAA and N8AO fight (a multisampled depth buffer the AO pass can't read), so the composer
  runs with `multisampling={0}` and SMAA closes the chain; the Canvas has `antialias: false`.
- The first depth-of-field setting (focus range 0.02, bokeh 2.6) blurred most of the party
  whenever the active combatant stood across the room — on the TV the figures' faces went
  soft. Widened to 0.05 / 2.0 the same night; a wide shot stays readable and the pull is
  still visible.
- Rode along: Restwater's trapdoor is now a hidden exit (`hidden: true` on the map's exit;
  the projection's `revealed_exits` lists the ones the DM has revealed as `exit:<key>`
  entries of `revealed_region_ids`), with **Reveal the hatch** and **Take the party to
  Sorrel's abode** on the HUD's LIVE tab (`engine/passages.ts` names the passages).

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-17 | Environment source | ship an HDR / procedural room / drei preset from CDN | drei preset (CDN) | A 1K HDR is ~1.5 MB, over the repo's file cap; the preset is the same file hosted, and the Soldier already comes from a CDN. |
| 2026-09-17 | AO | SSAO (postprocessing) / N8AO | N8AO | Already installed as a dependency; better quality per cost; half-res is enough on a TV. |
| 2026-09-17 | DoF default | off / on | on, with a toggle | The glide already reads as a director; the focus pull finishes the shot. Off is one click for a DM who wants everything sharp. |

---

## Validation and Acceptance
- [x] Creed's plate and the leather sets show environment reflection under torchlight
- [x] Feet and furniture bases have contact shadow; nothing floats
- [x] Framing a turn pulls focus to that figure; Cinema off makes everything sharp
- [x] No console errors on the spike (tavern, restwater, abode) or the live table
- [x] Gate green

---

## Outcomes and Retrospective
Shipped in e071fc5 (the look) and the hatch commit that follows it. The table now has
image-based light from a CDN preset, half-res N8AO, bloom, a focus pull with a Cinema
toggle, vignette and SMAA. What it does not have yet, and what Justin noticed first:
the faces. The four PC figures are packed at 1K textures; 2K for the party (and
checking the normal maps survive the packer) is the next visible step. Weather is
still the first-pass particle rain and needs a proper pass of its own.
