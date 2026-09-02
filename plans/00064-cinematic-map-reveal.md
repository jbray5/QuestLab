# Plan 00064 — Cinematic Map Reveal

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-09-01
**Last updated:** 2026-09-01
**Implemented by:** Claude Code

---

## Purpose

Field Guide #3: when the DM stages a new map, the projector and player
boards currently hard-swap. Instead: a scene-card moment — screen dips
to black, the map art breathes in with a slow zoom under a vignette,
the location title lands in Cinzel, then it all dissolves into the live
board. Same energy as the TurnSplash, scaled up to "you have arrived."

---

## Progress
- [x] Step 0: plan (2026-09-01)
- [x] Step 1: MapReveal component (2026-09-01) (map art Ken Burns zoom,
      vignette, title card, ~5s, click-to-skip, reduced-motion safe)
- [x] Step 2: trigger on map *change* (2026-09-01) (not initial load) in TableView
      and Table3DView; reuse existing projection polling/SSE — no
      backend changes
- [x] Step 3: reveal stinger in ambience.ts; gate green — ship + live verify below

---

## Surprises and Discoveries
- The DM PATCH field is `active_map_id` (not battle_map_id) — the first
  smoke staged nothing and only changed the title.
- The scene `title` can lag the map by one refetch; the reveal card now
  uses `map.name` (rides the same payload object as the art, atomic) and
  falls back to the scene title. TableMapSummary gained `name` frontside.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 09-01 | Trigger | new SSE event / client-side map.id diff | client diff | zero backend surface; a staged map change IS the reveal signal |
| 09-01 | First load | play on mount / only on change | only on change | a player opening mid-scene shouldn't sit through a cinematic |

---

## Context and Orientation
- TableView (`frontend/src/pages/TableView.tsx`) and Table3DView both
  hold `data: TableProjection`; map art URL at `data.map.image_url`.
- TurnSplash (`components/table/TurnSplash.tsx`) is the tone reference.
- Stingers live in `components/board/ambience.ts`.

## Validation and Acceptance
- [x] Staging a different map mid-session plays the cinematic on both
      2D and 3D player views; initial page load does not (verified live
      on prod 2026-09-01 — Feywild Lagoon scene card, screenshot)
- [x] Click/tap skips; prefers-reduced-motion gets a simple crossfade
- [x] tsc + build + pytest green; live smoke with screenshots

## Idempotence and Recovery
Pure frontend addition; progress boxes are the restart guide.
