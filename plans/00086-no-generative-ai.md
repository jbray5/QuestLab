# Plan 00086 — No generative AI in the product

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-05)

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Justin, after reading the community: "I don't think we can have any AI
generative functionality in the application. We can procedurally generate
stuff with an engine we build, but no AI art/story/etc. We'll get crushed in
sentiment." QuestLab ships with no generative AI. Procedural generation from
our own code is fine (the ink maps, the arena's referee, the dice).

## Shipped (phase A — the switch, the copy, the shipped art)
- **`AI_FEATURES` (API) and `VITE_AI_FEATURES` (web), default off.** Every
  generation route answers 404 "Generative AI is not part of QuestLab": the
  gated dependencies (`AiUser`, `AiArtUser`, `AiPackUser`, `gate_ai_for_pc`)
  and the two routes that were ungated (token figure, shop banner).
  Entitlements answer `disabled`; `/auth/plans` returns no tiers; `/auth/me`
  says `ai_allowed: false`.
- **Every generation control is hidden**: paywall modal, portrait generator
  (sheet and NPC), monster standee and portrait buttons, encounter
  suggestions, notebook riff/ask, the DM brief panel, Session Pack / runbook
  generation, NPC generate, item lore button, world-map generator, shop stock
  / banner / item art, board backdrop / minifig / diorama, the character
  forge's paint buttons. Nothing that isn't generation changed.
- **Write your own runbook**: `PUT /sessions/{id}/runbook/blank` starts an
  empty runbook (one scene) that the existing editor fills in; the runner and
  the HUD's script drawer point at it ("Write one →").
- **Copy**: landing ("No generative AI anywhere: maps drawn by code, rules by
  the book, art you bring"; the fourth pillar is the Practice Arena), guide
  ("No generative AI" section replaces the tier table), terms ("contains no
  generative AI; nothing you write is sent to a model"), tour ("There is no
  AI in it"), README, LAUNCH.md (Patreon is plain support; the tier ladder is
  documented only for a private opt-in deployment).
- **Shipped art**: the sample campaign's map is now the procedural ink
  forest road (`frontend/public/maps/mill-road.png`, 2304×1536, grid 96)
  served with the frontend; subclass panel backgrounds are procedural
  gradients keyed by the subclass name instead of generated images.
- Tests opt in (`AI_FEATURES=on` in `tests/conftest.py`) so the code paths
  stay covered; `tests/test_api/test_plan86_no_ai.py` pins the default-off
  behaviour.

## Verification
- Prod (API 1.9.0, 65eec3a + e1fa209): NPC generation and the shop banner
  route answer 404 "Generative AI is not part of QuestLab"; `/auth/plans`
  returns no tiers; `/auth/me` says `ai_allowed: false` (reason `disabled`);
  a blank runbook starts (200, one scene) and a second attempt is 409; the
  landing bundle says "No generative AI anywhere" and no longer carries the
  AI pillar; the sample map is served as image/jpeg (415 KB) and Justin's
  existing sample swapped to it on the next press (2304×1536, grid 96).

## Phase B — removal (needs Justin's go-ahead: deletes files and packages)
Physically remove: `services/ai_service.py`, `services/session_pack_service.py`,
`services/session_brief_service.py` (the AI brief), `services/portrait_service.py`,
`integrations/claude_client.py`, `integrations/openai_client.py`, the AI parts
of `battle_map_service` / `encounter_service` / `shop_service` / `table_service`
/ `npc_service` / `notebook_service` / `item_service`, the entitlement tier
ladder, the `anthropic` and `openai` requirements, the AI-only tests, the
prototype cut-out props in `Board3D.tsx` (gpt-image edits), the unused
`frontend/public/crier-avatars/*.png`, the `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
/ `AI_*` env vars, and the marketing stills that show the old sidebar label.
Keep: Patreon sign-in as support; the `session_briefs` / runbook tables
(hand-written content lives there).

## Not touched
Justin's own campaigns keep whatever art they already hold; the public
product never shows it. The `uploads/*.mp4` strays are test artifacts.
