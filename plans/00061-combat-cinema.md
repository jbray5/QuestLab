# Plan 00061 — Combat Cinema (the board reacts)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-08-31
**Last updated:** 2026-08-31
**Implemented by:** Claude Code

---

## Purpose

Justin's mandate: player-facing first, "feel like a video game", full
license to rework the board. v1 = the board REACTS to combat instead of
silently mutating: floating damage/heal numbers over tokens, a cinematic
turn splash when a PC's turn starts, audio stingers riding the existing
procedural ambience engine, and the cheap-looking line-bird flyers
removed. Ships on both player surfaces (2D TableView + 3D board).

---

## Progress
- [x] Step 0: recon — table SSE topic shared by both views; KO topple
      already animated; Flyers = canvas chevrons (kill list) (08-31)
- [ ] Step 1: backend fx events — publish_table_fx in event_bus; hooks in
      session_service.update_combatant (hp delta → damage/heal, defeated
      flip → ko); test via monkeypatch
- [ ] Step 2: stingers — ambience.ts sting(kind): damage thud, heal chime,
      ko drum, turn whoosh (all synthesized, no assets)
- [ ] Step 3: fx components — TurnSplash DOM overlay (token art + name
      plate, ~2.4 s); FloatingNumber overlays (2D absolute divs; 3D drei
      Html at token pos, rise+fade)
- [ ] Step 4: wire Table3DView + TableView — handle "table.fx" events,
      splash on active_token_ref change (PC tokens), stingers on fx
- [ ] Step 5: remove Flyers (line-birds) from the 3D board
- [ ] Step 6: gate + local smoke (puppeteer: patch combatant → screenshot
      the number/splash) + commit + push

---

## Surprises and Discoveries
- None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 08-31 | fx transport | poll diffing / new SSE event | new "table.fx" on the existing table topic | real-time, player-safe payload (ref + delta only, never totals) |
| 08-31 | splash art | fetch hero_url per PC / token's own image | token image + label v1 | zero new endpoints; hero-art splash is a clean v2 |
| 08-31 | crit flash | include / defer | defer | dice events don't reach the table topic yet; separate small plan |
| 08-31 | birdsong audio | kill with flyers / keep | keep | complaint was the visual "little lines"; audio layer is good |

---

## Context and Orientation
- Event bus: `integrations/event_bus.py` (publish_table_updated pattern);
  table topic streamed at `/stream/table/{session_id}`.
- Combatant HP: `services/session_service.update_combatant` (router
  `PATCH /sessions/{id}/combat/{combatant_id}`). Token ↔ combatant link:
  `Token.ref_id` = character_id or session_combatant id.
- Views: `frontend/src/pages/TableView.tsx` (2D), `Table3DView.tsx` +
  `components/board/Board3D.tsx` (3D, r3f + Bloom). Ambience:
  `components/board/ambience.ts` (WebAudio synth). Flyers:
  `components/board/atmosphere.tsx` (remove usage in Board3D).

## Validation and Acceptance
- [ ] PATCH combatant hp −7 → "−7" floats over that token on both views,
      damage sting plays (after user-gesture audio unlock)
- [ ] heal → green "+N"; defeated flip → ko drum (topple already exists)
- [ ] active PC token change → splash with art + name, auto-dismisses
- [ ] no more line-birds; pytest + tsc + build green

## Idempotence and Recovery
Backend: one new publish fn + service hook (additive). Frontend: new fx
module + wiring. Progress boxes = restart guide.
