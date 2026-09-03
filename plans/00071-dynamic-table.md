# Plan 00071 — Dynamic Table (animated map surfaces)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-02 · **Implemented by:** Claude Code

---

## Purpose

Justin asked what it would take to move to a Dynamic-Dungeons-style
table, built in-house. Verdict: DD is an animated *video map* library
plus a video-player editor (grid, fog, tokens, particles, sound). Our
3D board already exceeds the editor; the missing piece is the animated
map surface itself. So: evolve, don't scrap. The 2D projector stays as
the lightweight legacy mode and gets video too.

## Phases
1. **Video map surfaces** (this plan) — `video_url` on battle maps and
   the projection; looping MP4/WebM under the layers on the 2D canvas
   (foreignObject in the same pixel space) and as a VideoTexture on the
   3D board plane; the reveal card plays the loop; browser-side upload
   flow reads dimensions + grabs a poster; importer handles the 24
   Czepeku 4K loops (MP4 header dims, generated title poster).
2. **Procedural effect layers** — water regions, fire/ember/fog/leaf
   emitters, foliage sway, colored flickering lights, per-map scene
   presets. Makes ANY static (shippable) map dynamic — the real product.
3. **AI animated maps spike** — image-to-video loops from our generated
   maps; "✨ Animate this map" if loops are clean.
4. **Walls / line-of-sight lighting** — deferred; DD doesn't do it either.

## Progress (Phase 1)
- [x] Step 1: domain + migration 0039 + projection + video uploads
- [x] Step 2: 2D canvas, 3D board, reveal card play the loop
- [x] Step 3: Battle Maps page video import (dims + poster in-browser)
- [x] Step 4: import_czepeku --pack Animated
- [ ] Step 5: gate + ship + first animated map staged live

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 09-02 | Where video lives | separate media table / column on BattleMap | column | one row per map; image_url stays the poster/fallback everywhere |
| 09-02 | Poster for CLI imports | require ffmpeg / generated title card | title card + optional --poster | no ffmpeg on this machine; projector/reveal play the video anyway |
| 09-02 | 2D rendering | HTML video behind SVG / foreignObject | foreignObject | shares the SVG viewBox → zero coordinate math |

## Validation and Acceptance
- [ ] Animated map staged → projector shows moving water, tokens on top
- [ ] 3D board plane plays the loop; still shows until first frame
- [x] pytest + tsc + build green (754 passed)
