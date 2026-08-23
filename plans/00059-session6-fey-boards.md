# Plan 00059 — Session 6 Fey Boards + Restwater Companion

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-08-22
**Last updated:** 2026-08-22
**Implemented by:** Claude Code

---

## Purpose

Session 6 ("Into the Fey", TONIGHT 2026-08-22) forks: the party picks
destination A (Restwater bathhouse boss fight) or B (Ring at the Strand
wrestling match). Both fight boards must exist, plus a traversal board
(the shallow strait crossing) and optionally the opener beach. Boards are
shared screens — **zero text labels anywhere on them**. Also: a DM-only
Restwater companion (Auntie Sorrel = disguised green hag; pools toggle,
damage phases, house actions, spring-gate objective, ally cards, comfort
tally), same pattern as Plan 00058's Temple Companion. No freeze; ship
partial; paper is the backstop.

Handoff ground rules: invent NO lore/names/labels; leave gaps empty.

---

## Progress
- [x] Step 0: recon — pipelines + patterns identified (2026-08-22)
- [x] Step 1: `scripts/gen_session6_boards.py` — 4 boards generated + visually inspected: bright, top-down, zero text; sluice inset + ring boundary + seafloor road + shrine all present (2026-08-22)
- [x] Step 2: companion built — `components/restwater/{restwaterContent,restwaterCss}.ts`, `pages/RestwaterCompanion.tsx`, route `/campaigns/:id/restwater`, nav "♨ Restwater Companion" (2026-08-22)
- [x] Step 3: `scripts/seed_session6_boards.py` written; dry-run clean (session 6 "Into the Fey" already existed) (2026-08-22)
- [x] Step 4: `campaigns/session-06-scenes.json` — 4 presets, titles EMPTY (2026-08-22)
- [x] Step 5: live seed run — boards uploaded; token tray generation kicked off (2026-08-22, verify output)
- [ ] Step 6: gate (tsc ✓, vite build ✓; pytest/lint + commit pending)

---

## Surprises and Discoveries

- Existing S5 map is literally named "The Crossing" (open-water DECK scene).
  Seeder skips by name → new strait board must use a distinct library name:
  **"The Crossing (Shallows)"** (DM-only picker name, not lore).
- Scene presets carry map+darkness+weather+title only — NO tokens. Tokens
  live on TableState.tokens (per-session); seed script can park a tray.
- Comfort tally: handoff says 7 rows (4 PCs + 3 NPCs) but does NOT name the
  NPCs → NPC row labels are blank + editable (no lore invented).

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 08-22 | Restwater levels | true 2-level / edge-chamber inset | edge-chamber inset, one map | Handoff: "whichever is easier to build and read wins" |
| 08-22 | Board dims/grid | ask / reuse S5 | 1536×1024, grid 64 (5 ft) | Established S5 convention, projector-proven |
| 08-22 | Strait board name | reuse "The Crossing" / distinct | "The Crossing (Shallows)" | S5 name collision; seeder skips dupes; DM-only string |
| 08-22 | Doorway blocking | new feature / custom tokens | existing custom color tokens, noted in companion | Zero-risk, feature exists; DM drops a bar token |
| 08-22 | Companion location | extend temple / new route | new `/campaigns/:id/restwater` | S5 pattern: one companion per set-piece, frontend-only, localStorage |
| 08-22 | Token figures | local gen script / API `/table/figure` | API endpoint | Matches the app's minifig art lane exactly |
| 08-22 | Scene titles | room names / empty | empty ("") | Titles are player-visible; handoff: names are DM-only |
| 08-22 | Ally tokens (Mira etc.) | invent looks / skip | skip pre-gen; DM uses in-app gen or NPC portraits | No visual descriptions in handoff = don't invent |

---

## Context and Orientation

- **Board art gen:** `scripts/gen_session5_room_maps.py` pattern —
  `integrations.openai_client.generate_image`, `_MAP_STYLE` (STRICT
  TOP-DOWN + BRIGHT + no grid/text/creatures), 1536×1024, saved to
  `data/generated-maps/`, `.env` loaded manually.
- **Board seed:** `scripts/seed_session5_room_maps.py` pattern — POST
  `/uploads/map` (multipart) then POST `/campaigns/{cid}/battle-maps`
  (name, image_url, width, height, grid_size=64). Skips existing names.
- **Token figures:** POST `/sessions/{sid}/table/figure` {name,
  style_hints} → {url}. Park tokens: PATCH `/sessions/{sid}/table`
  {tokens: [...]} — Token = {id, kind:"custom", label:"", image_url, x, y,
  size, style:"figure"}. Labels stay EMPTY (shared screen).
- **Companion pattern:** `frontend/src/components/temple/*` +
  `frontend/src/pages/TempleCompanion.tsx` (Plan 00058): content file
  (verbatim from handoff), css file, tracker component, shell page,
  localStorage persistence, route in App.tsx + nav in Layout.tsx.
- **Campaign** 80b6f517-d124-4fea-9435-8e727f3171a9 · **adventure**
  ee3d7a70-4a01-4b9b-b026-f5415146b3bc · API
  https://questlab-api-9yhe.onrender.com/api · header
  X-MS-CLIENT-PRINCIPAL-NAME.

Encounter data (Sorrel, phases, house, spring-gate, allies, tally) is in
the 2026-08-22 handoff, transcribed VERBATIM into `restwaterContent.ts` —
nothing embellished.

---

## Concrete Steps

### Step 1: `scripts/gen_session6_boards.py`
Four prompts (restwater, ring-strand, crossing-shallows, beach), S5 style
constant, `--only` flag, skip-if-exists. Restwater: main hall + water
clock + 3-4 terraced pools + 3-4 guest rooms + front gate + clear
doorways, small stone sluice chamber inset at bottom edge. Ring: 20×20
raised roped ring center, crowd masses, stalls (no signage), harbor edge,
boats. Crossing: island edge → mainland edge long axis, submerged paved
road, dark sleeping silhouettes off-road, discolored patches. Beach:
white cove, flat sea, green treeline, small 4-post stone shrine w/
silver-white light. NO text/labels/creatures on any board.

### Step 2: Restwater companion (frontend only)
`frontend/src/components/restwater/restwaterContent.ts` — Sorrel (AC 17,
HP 82, regen +10 while POOLS FULL, can't-drop-below-1 flag, claw +6
13(2d8+4), P1 1 claw / P2@30dmg 2 claws + Invisible Passage / P3@60dmg OR
drain = house action every round), house actions ×4, spring-gate methods
A/B + DC-10 variant flag, allies (Mira COMPROMISED flag, Edrik, The
Welcome recite-once, staff ×3), traits reference. `restwaterCss.ts`,
`RestwaterCompanion.tsx` (tracker + comfort tally: 4 PC rows named, 3
blank editable NPC rows, 0–3 counters), route
`/campaigns/:campaignId/restwater`, nav link. localStorage per campaign.

### Step 3: `scripts/seed_session6_boards.py`
Idempotent: upload 4 PNGs → battle maps (skip existing); ensure session
6 row on the adventure (create only if absent — number 6, no invented
title: use handoff name "Into the Fey"); token figures via
`/table/figure` for described-only creatures (boss "tall wood elf woman
in gray", knee-high driftwood creature, wood elf staff ×3, door-sized
upright snapping turtle, giant octopus, plesiosaur, hunter shark fin,
much larger shark, giant sea horse, big sea turtle, small crab-things);
PATCH table state parking tray of unlabeled figure tokens along top edge;
`--dry-run`.

### Step 4: `campaigns/session-06-scenes.json`
Presets: RESTWATER / THE RING / CROSSING / BEACH → mapNames from Step 3,
darkness 0.1–0.2 (bright day/golden), weather null, title "".

### Step 5: Run
`python scripts/gen_session6_boards.py` (inspect PNGs vs memory rule:
BRIGHT) → `python scripts/seed_session6_boards.py --dm-email … --dry-run`
→ live.

### Step 6: Gate + commit
tsc, vite build, pytest -q, black/isort/flake8/interrogate, commit.

---

## Validation and Acceptance

- [ ] 4 PNGs in `data/generated-maps/`, bright, top-down, zero text
- [ ] 4 battle maps in the campaign library (correct names, grid 64)
- [ ] Session 6 table state holds unlabeled figure tokens
- [ ] `/campaigns/{cid}/restwater`: pools toggle flips regen note + clears
      1-HP floor + fires P3; phase banners auto at 30/60 cumulative damage
      dealt; house actions mark used/reset per round; Mira COMPROMISED flag
      clears on drain; Welcome recite is once; tally 7 rows 0–3 persists
- [ ] Scenes JSON imports on the board with empty titles
- [ ] Full gate green

## Idempotence and Recovery
Gen skips existing PNGs; seed skips existing maps/session/tokens by name
or marker id; companion is file-creates only. Progress boxes = restart.

## Interfaces and Dependencies
Produces: 4 boards + token tray + `/campaigns/:id/restwater` + scenes
JSON. Depends on: deployed API (Render), OpenAI key in `.env` (board gen)
and on Render (figure gen). Nothing blocks the session — paper backstop.
