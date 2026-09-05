# Plan 00079 — The showcase reel: hand-inked maps, lettered tokens, no AI art

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Justin: "I can't have it looking like AI. People are very sensitive…
especially in a community like DnD that values artists and creativity. I'd
even prefer to use a procedurally generated tool." The landing page needed
product footage and pillar images, and every map in the app was either
Czepeku (personal license) or AI-generated. Nothing of either may appear
on a public surface.

## Shipped
- **Procedural ink-and-parchment maps** (`scratchpad/procgen_ink_maps.py`,
  numpy + Pillow, deterministic seeds): a dungeon (rooms, corridors, doors,
  pillars, stairs, a pool, crosshatch outside the walls), a forest road (a
  winding road with ruts, a stream with a plank bridge, scalloped hatched
  canopies, rocks, grass, a campfire ring) and a tavern (bar and stools,
  tables and chairs, hearth, stairs, kitchen, storeroom, porch, plank
  floor). Every stroke is noise-jittered so it reads as drawn. 2304×1536
  at 96 px per square. Hosted through the app's own map upload.
- **A showcase campaign on prod** ("Showcase — The Gilded Kettle", owner
  Justin, private): four SRD PCs built through the character creator (no
  portraits), one session, a seven-combatant fight with the tavern staged,
  lettered disc tokens (`style: card`, no images), round 2 active.
- **The reel**: `record_reel.js` opens the 3D table view headlessly, pulls
  CDP screencast frames while the API reveals the tavern (title card
  cinematic) and throws two d20s from a player's sheet; `imageio-ffmpeg`
  assembles 217 timed frames into a 20.7 s 1280×720 MP4 (H.264, 1.5 MB)
  and WebM (VP9, 1.6 MB), poster from the reveal frame.
- **Stills** for the pillars: the 3D board, a phone sheet, the cockpit —
  all from the showcase world.
- **Landing page**: a framed 16:9 reel band under the hero (autoplay,
  muted, loop, poster fallback, caption "Hand-inked maps, no AI art"), and
  three pillar cards now lead with product images. The AI-prep pillar stays
  text-only on purpose.

## Verification
- pending

## Follow-ups
- Move `procgen_ink_maps.py` into `scripts/` and offer the three maps as
  the sample campaign's starter set (they are ours to ship).
- A torch-lit night variant once the 3D renderer's point lights read in
  captures (the software renderer flattens them today).
