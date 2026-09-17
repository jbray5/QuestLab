# Plan 00109 — Milestone 1: the engine joins the table

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-17
**Last updated:** 2026-09-17
**Implemented by:** Claude Code
**Program:** [00107 — The Immersive Table](00107-immersive-table.md)

---

## Purpose
The spike (Plan 108) is a diorama: beautiful, and driven by nothing. Milestone
1 makes it a table. The engine opens a real session's URL, renders whatever
map the DM has active and every token on it, follows the turn, and when the
DM or a player moves a token, the character *walks* there.

Nothing new is invented server-side. The Table View's player-safe projection
(`GET /table/{session_id}`, Plan 42) already carries the map, the tokens in
image pixels, whose turn it is, darkness and fog; the `table:{session_id}`
stream already says when it changed. The engine is one more client of both.

---

## Progress
- [x] Step 1: `/table/:sessionId/engine` route, alongside the Table View and the 3D board
- [x] Step 2: Projection → scene: the active map resolves to a `MapDef` (a known one by battle-map id, or a plain one from the picture), tokens resolve to cells
- [x] Step 3: One walking character per token, with a nameplate; moves become walks; the active token is marked
- [x] Step 4: Live: refetch on `table.updated`; darkness dims the room
- [x] Step 5: Verified against the "Into the Fey" session: the Crossroads clearing as a lit picture with the party on it; Restwater as the built bathhouse (the session was pointed at Restwater for thirty seconds and put back exactly)
- [x] Step 6: The spike and the table now draw through one `MapScene`, so they cannot drift

---

## Surprises and Discoveries
- **Nothing server-side was needed.** The projection already carried every
  fact the engine draws. The whole milestone is a page, a translation, and a
  walker that can be many.
- **The API's CORS is right, which made local verification wrong.** A
  localhost build may not call the deployed API; the harness runs Chrome with
  web security off, for itself only. On the real host the engine is the same
  origin as the Table View and needs nothing.
- **A live table never goes network-idle.** The SSE stream is a connection
  that stays open, so a harness waiting for idle waits forever. Readiness is
  the canvas and the page's own loading line, not the network.
- **Tokens are map-relative pixels.** Switching the session's map moved the
  party to the same *fractions* of Restwater — one of them standing in a
  pool. That is correct: a session places tokens per map, and the engine has
  no business second-guessing where the DM put them.
- **Willa was at y=1203 on a 1024-pixel map.** A token can sit past the
  picture's edge; the engine clamps it to the last cell rather than losing it.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-17 | Source of truth | (a) new engine state (b) the existing table projection | (b) | It already has everything: map, tokens, turn, darkness. The engine must never hold state the HUD doesn't — "alongside, no teardown" depends on it. |
| 2026-09-17 | Maps without scene data | (a) refuse (b) the picture as a lit floor, no walls | (b) | 42 maps, 2 definitions. The engine must open any session today; walls and props arrive per map as they are made. |
| 2026-09-17 | Token → cell | image pixels ÷ grid_size, snapped | — | The projection's tokens are in image pixels on a map with a known grid. The engine's unit is one cell. |
| 2026-09-17 | Who each token *looks like* | (a) placeholder for all (b) per-character models | (a) now | Milestone 3 brings the party's own models. Today every token is the placeholder, told apart by nameplate and a colour ring — PCs gold, monsters red, the active one bright. |
| 2026-09-17 | Camera | (a) orbit only (b) cut to the active combatant | (a), with a frame-the-turn button | The cinematic camera is Milestone 2. |

---

## Context and Orientation
- `frontend/src/engine/EngineTable.tsx` — the page
- `frontend/src/engine/session.ts` — projection → scene (map resolution, cells)
- `frontend/src/engine/Party.tsx` — the walkers, one per token, with nameplates
- `frontend/src/engine/Walker.tsx` — now instanced: a cloned skeleton per token
- `frontend/src/engine/registry.ts` — definitions gain `battleMapId`
- `frontend/src/api/types.ts` — `TableProjection`, `TableToken` (existing)

**Trust model:** the session UUID is the capability, exactly as for the Table
View. The projection is player-safe by construction; the engine adds nothing.

---

## Validation and Acceptance
- [x] Open `/table/<session>/engine` for a session on a map with no definition: the picture, lit, with the tokens standing on it
- [x] Open it for the Restwater session: the built bathhouse with the party in it
- [ ] Move a token in the HUD: the character walks there on the engine, no refresh — *the walk is the same code the spike proved; the live push is the Table View's, already proven; the pair wants Justin's eyes on two screens*
- [ ] Advance the turn: the active marker moves — same
- [x] Gate green

---

## Outcomes and Retrospective
_To be filled in on completion._
