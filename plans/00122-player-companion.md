# Plan 00122 — The player's phone: a companion that grows with them

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-30
**Last updated:** 2026-10-30
**Implemented by:** Claude Code

---

## Purpose
Justin (10/30): "Reimagine the players' phone screens to make the ideal companion app for new-ish
players as they grow into experienced ones." Design approved ("Those are awesome") as row F on
the redesign canvas. Today `/play/{pc}` (`frontend/src/pages/PlayerView.tsx`, 2,356 lines) is one
page 4–7 screens tall: no tap-to-roll, no attacks list, no casting, no notes; the beginner turn
guide and rules sit collapsed at the bottom; jargon everywhere; loot and invites arrive silently.
After this plan the phone is a tabbed companion (Now · Character · Spells · Bag · Journal) with a
per-player **help level** (Teach me · Remind me · Just the numbers), a Now screen that follows the
game, a roll sheet (TV or real die), casting that spends slots, private notes and notices.
Principles: `docs/DESIGN.md` §0. Look: Lamplit (Plan 121).

---

## Progress
- [x] B1 Rolls: advantage/disadvantage (2d20 keep one), real-die entry (no server RNG), kind; table + party feed say who rolled
- [x] B2 Turn kit `GET /play/{pc}/turn-kit`: movement, actions (weapons, unarmed, attack cantrips), bonus actions, reactions, coach tips — built from `services/arena_service.py` helpers
- [x] B3 Cast `POST /play/{pc}/spells/{character_spell_id}/cast` (slot ≥ spell level; cantrip/ritual no slot; concentration set; table log)
- [x] B4 Prepare `POST /play/{pc}/spells/{character_spell_id}/prepare` (prepared casters; cap from `srd.spells_prepared`)
- [x] B5 Private notes: `player_notes` column + migration 0055; `PUT /play/{pc}/notes`; the DM's own `notes` no longer leak through `/play/{pc}`
- [x] B6 Temp HP joins the player-patchable set (0–999)
- [x] B7 Notices: give/loot/use events carry a sentence ("Bram gave you a Potion of Healing"); turn changes reach every party phone with who's up
- [x] B8 Tests `tests/test_api/test_plan122_player_companion.py`
- [x] F1 Shell: `frontend/src/pages/player/*` — tab bar, help-level store (per PC, localStorage), notices, screen wake-lock toggle, first-open screen (+ "Not you?")
- [x] F2 Now tab: your turn / waiting / exploring / dying takeover; level-up banner
- [x] F3 Roll sheet used everywhere (checks, saves, attacks, damage, initiative, hit dice, death saves)
- [x] F4 Character tab (three help levels), HP/temp HP/inspiration, conditions in words, exhaustion, hit dice, features
- [x] F5 Spells tab: slots, cast with slot picker, rituals, prepare mode
- [x] F6 Bag tab: coin in words, equipped/pack, drink/give, market card, attunement count
- [x] F7 Journal tab: next/last session, private notes, people met (with appearance), the "fewer hints?" nudge, how-to-play (old walkthrough + rules)
- [x] F8 Satellites in Lamplit + no dead ends: JoinView (switch character), CharacterCreator, CharacterView, LevelUpGuide, Market/Storefront (back to sheet), player Arena
- [x] F9 Docs (ARCHITECTURE codemap, SECURITY player-link table, TESTING, data dictionary), gates, screenshots
- [ ] F10 Justin approves the push; a Discord note invites the players to try it

---

## Surprises and Discoveries
- 10/30: PlayerView uses none of `components/character-sheet/*` (DM-only); the DM already has a roll helper, attack previews, cast/prepare and rests.
- 10/30: `GET /play/{pc}` returns the full DM projection, including the DM's `notes` about the PC — readable by anyone with the link. Fixed in B5.
- 10/30: other players' phones never learn whose turn it is (turn events go only to the PC whose turn starts/ends). Fixed: every party phone hears the turn, and turn-state carries the order.
- 10/30: Journal shows tonight's session title but no recap: players have no recap endpoint yet (left out rather than faked).

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-30 | New player-link powers | all / all but temp HP / UI only | all (Justin) | Same trust model: the link already acts as the character |
| 10-30 | Help level storage | server column / localStorage per PC | localStorage per PC | A device preference; no schema; resets harmlessly |
| 10-30 | Private notes | reuse `notes` / new `player_notes` | new column | `notes` is the DM's; reusing it would expose or clobber DM text |
| 10-30 | Attacks/features source | new rules code / arena helpers | arena helpers | One rules engine; the Arena's to-hit/damage/feature logic is already tested |
| 10-30 | Rests from the phone | add / leave DM-only | leave DM-only | Not in the approved design; the DM calls rests |

---

## Context and Orientation

### Files touched
- Backend: `domain/character.py` (bodies, `player_notes`), `alembic/versions/0055_player_notes.py`,
  `services/player_service.py`, `services/arena_service.py` (expose helpers), `services/session_service.py`
  (turn broadcast), `integrations/event_bus.py` (payloads), `api/routers/play.py`
- Frontend: `frontend/src/pages/PlayerView.tsx` (becomes the shell), `frontend/src/pages/player/*` (new),
  `frontend/src/api/play.ts`, `frontend/src/stores/usePlayerPrefs.ts` (new), satellites in F8
- Tests: `tests/test_api/test_plan122_player_companion.py`
- Docs: `ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/data_dictionary.md`

### Architecture layers involved
pages (React) → api/routers/play.py → services/player_service.py (+ arena_service, spellcasting_service)
→ db/repos → domain. Authorization: the `/play/{pc_id}` capability URL (Plan 120 left player links unchanged).

### Key terms defined
- **Help level**: how much the phone explains — `teach`, `remind`, `numbers`.
- **Turn kit**: what this character can do on a turn, grouped by action type, with numbers precomputed.
- **Real-die roll**: the player types what a physical die showed; the server logs it, rolls nothing.

---

## Concrete Steps
Each B-step: write the failing test first in `tests/test_api/test_plan122_player_companion.py`, then
the domain body → service → route; `pytest -q` green. Each F-step: build, then screenshot at 390×844
(`scratchpad/tour.py phone`), Teach + Numbers levels, then commit.

---

## Validation and Acceptance
- [ ] `pytest -q` passes; `npm run build` passes; no new lint errors
- [ ] On a 390 px phone: first open asks for the help level; Now shows the turn kit on your turn,
      "who's up" otherwise; a skill roll shows on the table with its label and roller; a real-die
      entry logs without a server roll; casting Magic Missile at 2nd spends a 2nd-level slot;
      notes survive a reload and never appear in `/play/{pc}` for another PC or in the DM's notes
- [ ] `GET /play/{pc}` no longer contains the DM's `notes`
- [ ] Every player screen has a way back; no emoji icons; no ALL CAPS

---

## Idempotence and Recovery
Migration 0055 only adds a nullable column (downgrade drops it). Each step is its own commit. The old
PlayerView behaviour is reachable until F1 swaps the route component.

---

## Interfaces and Dependencies
**Produces:** `/play/{pc}/turn-kit`, `/play/{pc}/spells/{id}/cast`, `/play/{pc}/spells/{id}/prepare`,
`/play/{pc}/notes`; roll body `mode`, `real`; temp HP in `PATCH /play/{pc}/state`.
**Depends on:** Plan 121 tokens/classes; arena_service helpers; spellcasting_service.

---

## Outcomes and Retrospective
_Fill in after completion._
