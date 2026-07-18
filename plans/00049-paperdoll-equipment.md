# Plan 00049 — Paper-Doll Equipment (per-item art, pixel-exact) [FUTURE]

## Status
[x] Not started  [ ] In progress  [ ] Blocked  [ ] Complete

**Created:** 2026-07-17. Owner direction, deferred (not a Session-3 item):
"we should do the per-item art with the doll and pixel-exact mapping so it
doesn't have to create a new image every time."

## Why
The current Character Forge (Plan 48) dresses the model with an
image-to-image AI edit per render — costs an API call, ~25s, and embellishes
(adds gear the player didn't equip). A true paper-doll composits authored
per-item art onto a rigged base at fixed anchor points: instant, free,
pixel-exact, and never hallucinates.

## Shape (to be designed)
1. **Rigged base model** — the character render (Plan 48 hero) plus a small
   set of named anchor points / layer boxes: main-hand, off-hand, head, body,
   back, feet, hands, neck. Likely a normalized full-body pose so anchors are
   consistent across characters (or per-character anchor offsets stored on the
   PC).
2. **Per-item sprite art** — each catalog Item gets a transparent equip-layer
   sprite (generated once, cached on the item, shared across all characters —
   the same reuse model as shop item art). Authored to sit at its slot anchor
   with a consistent scale/orientation.
3. **Composite at render** — the character screen layers equipped item sprites
   over the base in slot/z order (weapon in front of hand, cloak behind body,
   etc.). Pure client-side canvas/CSS compositing; no API call on equip.
4. **Fallback** — items without a sprite show the flat slot icon (today's
   behaviour); the AI "dress" edit (Plan 48) can stay as an optional
   "one nice render" button.

## Hard parts / open questions
- Pose + anchor consistency: AI base renders vary in pose/scale. Options:
  (a) constrain the base prompt to a rigid front-facing T-ish pose; (b) store
  per-character anchor offsets the player nudges once; (c) a fixed silhouette
  the art is drawn against.
- Item sprite consistency: prompt gpt-image-1 for "equip layer, transparent,
  centered at <slot> anchor, neutral lighting, drawn to fit a 1024×1536 model."
  Non-trivial to get scale/placement repeatable — may need a per-slot template
  or a light manual nudge tool in the DM/player UI.
- Layering order + occlusion (a breastplate over a shirt, a cloak behind).

## Not blocking Session 3 — revisit after Saturday.
