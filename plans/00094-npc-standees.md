# Plan 00094 — NPC board standees

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-08)

**Started:** 2026-09-08 · **Implemented by:** Claude Code

## Purpose
Justin asked for board standees for Mira, Thorne and "Tinkerman". Two things
blocked it: NPCs had no standee field at all (only PCs and monsters carry
`figure_url`), and the only standee maker is the AI art pipeline he switched
off on 2026-09-05. He gave an explicit one-off go-ahead for the art.

## Shipped
- **`figure_url` on NPCs** (migration 0046) — the transparent full-body
  cut-out the 3D board stands up, the same shape PCs and monsters carry.
- **`POST /npcs/{id}/figure`** — mirrors the monster figure route, behind the
  same `AiArtUser` gate. It stays unreachable while `AI_FEATURES` is off; it
  exists so the capability has a proper home rather than a one-off script.
- **"+ NPC" on the table console** — pick any NPC with art and they land on
  the map as a standee token (`style: "figure"`), falling back to their
  portrait when there is no standee. NPCs were previously unreachable from
  the board except as hand-labelled custom tokens.
- **Canon**: "The Tinker-sprite" is now **Tinkerman**.

## How the art was made
Generated **locally**, not in prod: the repo's own pipeline (house-style
figure prompt → `gpt-image-1` at 1024×1536 → `image_tools.key_chroma`) run
from this machine against the local `OPENAI_API_KEY`, then uploaded through
the prod upload route (which holds the blob token) and attached with a PATCH.
`AI_FEATURES` was never switched on in the live product — the AI routes still
return "Generative AI is not part of QuestLab" and the plans gate is still
`off`, verified after the run.

The first pass needed a re-cut: Thorne's cast shadow fell on the magenta
backdrop and keyed to a pink pool at his feet, with magenta speckle on his
face and hands, and Tinkerman came out a large grey armoured fey. Both
prompts were re-run with an explicit "no cast shadow on the background, no
magenta on the subject" clause and a harder subject pin (tiny, blue,
cat-sized). Cut-outs verified by compositing over the board's dark ground:
57–68% fully transparent, all four corners clear, no fringing.

## Verification
- Full suite 892 passed; tsc, eslint and the Vite build clean.
- Prod: all three NPCs carry a standee; the sprite is renamed; the AI art
  route still 404s and the plans gate is still off.

## Note for later
Every standee lives in the blob store under `maps/` because it was uploaded
through the map route rather than `figures/`. Harmless, but it means the
orphaned-blob sweep (see the Vercel Blob tech debt) should not assume
everything under `maps/` is a map.
