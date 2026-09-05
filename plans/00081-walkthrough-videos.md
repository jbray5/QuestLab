# Plan 00081 — Captioned walkthrough videos: setup and game night

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (v1, live-verified 2026-09-05)

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Justin: "can you record a full walkthrough of a setup with captions and a
game walkthrough with captions?" Two videos a new DM can watch before the
Reddit post sends them to the app, produced without a voice or a screen
recorder: the real app drives itself in headless Chrome, a caption bar is
injected in-page, and the frames are cut together.

## Shipped
- `scratchpad/walkthrough.js` — two acts. **Setup** (1:47): sign in,
  create a campaign, an arc and a session, upload a map, put the QR on the
  TV; then a phone joins and builds a Level 3 Halfling Thief through the
  character creator and lands on the sheet. **Game night** (1:07): the HUD
  tour, stage a map, add a foe and roll initiative, End Turn, drag a token
  on the Live tab, apply damage, set Prone, type notes; the phone shows the
  HP and the condition and throws a d20; the TV shows the die land.
- Captions are a fixed in-page bar (EB Garamond, gold rule) updated per
  beat; title and end cards are rendered pages. Segments are CDP
  screencast frames with real timing (plus an end marker so static screens
  hold), scaled and padded to 1600×900 and encoded H.264 by
  `assemble_wt.py` (imageio-ffmpeg, limited range).
- The setup act creates and then deletes a throwaway campaign ("Ashfall
  Hollow"); the game act runs on the Showcase campaign. No AI art appears:
  code-drawn maps, lettered tokens, builder PCs without portraits.
- Hosted on Vercel Blob through the app's own map upload; embedded on the
  Guide ("Watch it done") with posters; linked from the landing page.

## Verification
- Contact sheets of both cuts reviewed frame by frame: captions legible on
  desktop and phone segments, every beat present (campaign → arc → session →
  map → QR → phone creator → sheet; HUD → map → foe + init → End Turn → drag →
  damage → Prone → notes → phone HP/condition/throw → TV die).
- Prod (5421225, bundle index-CJzoE0GB): /guide#watch shows both players with
  posters; both play in Chrome (2.4 s and 2.5 s in after 2.5 s), no media
  error, durations 107 s and 67 s. Landing links to the section.

## Round two (same day): voice, music, smoothness
- **Narration**: every caption line is spoken by a Microsoft neural voice
  (en-GB Ryan via `edge-tts`, no key). `narrate.py` synthesizes each line
  once, measures it, and the recorder holds each beat at least as long as
  its line; the assembler places clips at the recorded caption times.
- **Music**: `synth_music.py` — a Karplus-Strong plucked-string arpeggio
  over a detuned pad in D minor with a soft drum, convolution reverb and a
  low-pass. Synthesized from nothing, ours to use anywhere, ducked under
  speech with a sidechain compressor.
- **Smoothness**: headless Chrome was rendering the 3D table in software
  (SwiftShader, ~10 fps); `--use-angle=d3d11 --enable-gpu` uses the GTX
  1080 and captures ~100 fps, encoded at 30 fps. Both walkthroughs and the
  hero reel were re-recorded with it. Setup 2:48, Game night 2:10.

## Follow-ups
- A voiced version once Justin records narration (the caption beats double
  as the script).
- Re-record after visible UI changes; the script is idempotent.
