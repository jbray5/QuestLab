# Plan 00055 — Puzzle Workbench (glyph board + Vigenère decoder)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Created:** 2026-07-22 (Wed). Spec: `campaigns/session-04-addendum-puzzles.md`
Section C. **Freeze Friday night** — nothing deploys Saturday.

## What it is
A DM-driven puzzle module with a projector-safe player view, matching the
Table View pattern: DM route controls, player capability link displays.
Two puzzle types, both **data-configured** (no hardcoded puzzles).

## Data model (migration 0032)
`puzzles` — id, campaign_id FK, kind (`glyph` | `cipher`), title,
`config` JSON (per-kind, DM-authored), `state` JSON (live progress),
`solved` bool, `allow_player_input` bool, created_at.

- **glyph config**: `tokens` (ordered glyph ids), `mapping` (glyph→letter,
  the answer key — SERVER ONLY), `preknown` (glyph→letter shown at start),
  `answer` (string), `hide_spaces` bool.
  **state**: `assignments` (glyph→letter, DM/player guesses), `attempts`
  (list of {reading, correct, at}).
- **cipher config**: `key` (SERVER ONLY), `ciphertext`, `plaintext`
  (SERVER ONLY until revealed), `intro`.
  **state**: `phase` (`warded`|`stilled`|`solved`), `locked` (index→letter
  confirmed), `first_sentence_at` (drives the DM-only thread-snap beat).

## The security rule (spec: "assume they open dev tools")
The player projection **never** carries `mapping`, `key`, or unrevealed
`plaintext`. Answers/keys validate server-side; the client only ever sees
what's already public at the table. This is why config/state are split and
why there are two read shapes (`PuzzleRead` for the DM,
`PuzzleProjection` for players).

## Layers
- `domain/puzzle.py` — Puzzle table + Create/Update/Read/Projection.
- `db/repos/puzzle_repo.py` — CRUD.
- `services/puzzle_service.py` — DM CRUD (campaign-owner authz) + player
  capability actions: `assign_glyph`, `clear_glyph`, `submit_reading`,
  `submit_key`, `decode_letter`, `reveal` (word/line/all), `reset`.
  Every mutation publishes `puzzle.updated` on the session/campaign topic
  so the player view updates live (reuses the SSE bus).
- `api/routers/puzzles.py` — DM routes (auth) + `/puzzle/{id}` projection
  and player actions (capability URL, no auth).
- Frontend: `pages/PuzzleView.tsx` (player display, `/puzzle/:puzzleId`),
  `pages/PuzzleWorkbench.tsx` (DM control, `campaigns/:id/puzzles`),
  linked from the HUD Script tab.
- `scripts/seed_session4_puzzles.py` — seeds Saturday's two puzzles.

## Non-goals (v1)
- No custom glyph art — distinct Unicode shapes (◆ ● ▲ ✦ ⬟ ✚ ◼ ✱) at
  large size, exactly as the script types them into Teams.
- No puzzle authoring UI beyond create-from-template + edit JSON.
- The 🔊 hum is a CSS animation + the existing stinger; no new audio.
