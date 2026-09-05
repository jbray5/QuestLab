# Plan 00080 — Real dice: numbered faces that land on the roll

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (v1, live-verified 2026-09-05)

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Justin: "I need the dice to be more actual dice. Now it looks like an
oversized clunky geometric shape with no numbers until one pops up and it's
not really on the dice." The Plan 69 die was a bare obsidian polyhedron with
the result stamped over it as HTML text.

## Shipped
- `components/table/Dice3D.tsx` rewritten. Every die is a true polyhedron
  with a numeral on every face: coplanar triangles are grouped into faces,
  each face gets an in-plane basis (numeral top toward the tip of a
  triangle, the apex of a kite, an edge of a square) and its own cell in a
  canvas atlas painted as crimson resin with gold numerals (6 and 9
  underlined). Opposite faces sum the way real dice do (d20 → 21, d12 →
  13, d8 → 9, d6 → 7); d10 reads 0–9 and d100 reads 00–90 on a true
  pentagonal trapezohedron built by hand (three.js has none).
- The die lands with the server's rolled face toward the viewer, numeral
  upright: `restOrientationFor(face)` aligns the face normal to the camera
  and spins about the view axis until the face's up vector is screen-up.
- About 40 % smaller on screen, clearcoat material, softer gold edges.
- `DiceCinematic` no longer stamps a number over the die; the roller line,
  the total, and CRITICAL / FUMBLE callouts stay.

## Verification
- tsc, eslint, build clean. Prod (`4884f90`, `0a1e513`): throws on the
  showcase table captured at 0.7 / 1.4 / 2.3 / 3.2 s — a numbered crimson
  d20 tumbles and settles showing the rolled 9; a d6 shows its 3 edge-up.

## Follow-ups
- Clatter sound on the bounces (deferred by Justin earlier).
- Physics-based settle instead of the slerp (the die still "floats" into
  its final pose for the last 400 ms).
