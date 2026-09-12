# Plan 00099 — Map thumbnails, and one Restwater encounter

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-11)

**Started:** 2026-09-11 · **Implemented by:** Claude Code

## Purpose
Justin, the day before Session 7: "everything in the HUD is super laggy — too
many maps maybe? but I tried to load the restwater combat. there should only be
one choice, not two." Two unrelated problems.

## 1. The lag — self-inflicted, and measured
The campaign library reached **42 boards totalling ~199 MB**, 40 of them over
2 MB, after Plans 95 and 98 added twelve Czepeku boards at 4K–7.7K pixels. Both
map pickers — the HUD's map tab and the Battle Maps grid — rendered
`<img src={image_url}>` for every board into a ~200px card.

That is the whole problem. A 46-megapixel JPEG (The Island) decodes to roughly
**185 MB of bitmap** regardless of the box it is drawn into, and `loading="lazy"`
only defers that cost to the moment you scroll. Scrolling the picker decoded
tens of boards back to back.

**Fix:** `thumb_url` on battle maps (migration 0048), used by both pickers with
the full image as the fallback so nothing breaks before a thumbnail exists.
Images also marked `decoding="async"`.

**Generating them without Pillow:** the project has no image library (see
`integrations/image_tools` — a hand-rolled PNG codec, RGB/RGBA only, no JPEG
decode). So the downscale runs in headless Chrome: load the board into a
canvas at 480px wide, `toDataURL("image/jpeg", 0.72)`, decode and upload. The
same trick that read a frame out of the Czepeku loop in Plan 95.

Result: 35–120 KB per thumbnail against 7–20 MB originals, roughly 150×.

## 2. Two Restwater encounters
The load-encounter dropdown had **"Restwater"** (thin — the Green Hag alone,
pointing at the companion) and **"Restwater - the house turns"** (the real
roster). The detailed one keeps the data and takes the plain name; the thin
duplicate is deleted.

Roster corrected to what Justin actually runs:

| In | Out |
|---|---|
| Auntie Sorrel ×1 | — |
| **Cultist ×3** | ~~Thug ×3~~ (superseded 9/10) |
| Dryad ×2 | — |
| Mira (ally, Large) ×1 | — |
| Edrik (ally) ×1 | — |
| — | ~~Spring-gate~~ — tracked on paper, deliberately not a token |

Loading it onto the tracker beside the four PCs already there gives the twelve
Justin listed. **Tinkerman is deliberately absent from the roster**: he has a
board piece but takes no turn in initiative.

Allies ride as `type: "monster"` because the tracker has only ever used `pc`
and `monster` — the same way Wenneth and the Blossom-seller were run in
Session 1.

The encounter's `dm_notes` were also rewritten to match the 9/10 rulings:
Sorrel as the printed Green Hag with no regeneration (she cannot drop below 1
HP while the pools hold water), Cultists not Thugs, and the spring-gate's
numbers for paper tracking.

## Verification
Full suite 895 passed; tsc, eslint and the Vite build clean. On prod: one
Restwater encounter with 8 combatants, and every map carrying a thumbnail.
