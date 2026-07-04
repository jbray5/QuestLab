# Plan 00042 — Remote Table View (digital battle maps)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-07-04
**Last updated:** 2026-07-04 — full slice built + verified green (591 backend tests; tsc + vite build clean; eslint at baseline). Remaining: a live browser drill on real Czepeku maps, and the manual validation checklist below.
**Implemented by:** Claude (Fable 5)

---

## Purpose
Session 3 is remote: DM at home on webcam, players together at one projector. The app
already gives players their phones (PlayerView) remotely for free; the missing piece is
the shared battle-map surface. Build: (1) a campaign battle-map library the DM fills
from Czepeku/Roll20 image exports, (2) a full-screen player-safe **Table View** route the
projector displays, (3) a DM console in the Session HUD that drives it live over the
existing SSE bus — scene switching, fog reveals (prep-time regions + improv brush),
portrait tokens, active-turn glow, darkness dial (the "lanterns die" clock, literally),
pings, and scene title cards. Done = DM can run the Wenneth-style fight on a projected
Czepeku map from another house, with zero screen-sharing.

---

## Progress
- [x] 1. Migration 0020 + domain (battle_maps, table_states); registered in domain/__init__. Offline SQL verified.
- [x] 2. Repos: battle_map_repo, table_state_repo (get_or_create, clear_map_references).
- [x] 3. Events: table:{session_id} topic + publish_table_updated/ping; GET /stream/table/{id}.
- [x] 4. Services: battle_map_service (owner CRUD), table_service (console read/write + player-safe projection + glow).
- [x] 5. Routers: battle_maps.py, table.py (projection is the only no-auth endpoint), /uploads/map (40MB, blob-or-local); mounted in main.
- [x] 6. Tests: 10 service + 4 API. Projection asserts NO hp/initiative, NO region names, glow only while running. 591 pass.
- [x] 7. Frontend api/table.ts + types (BattleMap, Token, TableProjection, ...).
- [x] 8. MapCanvas — SVG renderer: feathered fog mask, portrait-masked token rings, animated turn-glow halo, darkness dim+vignette, ping ripples, defeated slash. Internal token drag.
- [x] 9. TableView /table/:sessionId — full-screen, SSE-driven, CSS scene crossfade + cinematic title card (no sync setState-in-effect).
- [x] 10. BattleMaps library — multi-import (dims read client-side), grid, region editor (rect drag + polygon click, inline rename/delete).
- [x] 11. TableConsole in SessionHud — live editable preview, map pick, fog toggle + region reveal chips, darkness dial (debounced), title cards, party/foe tokens, drag-to-move, ping/marker modes, "Open Table View ↗".
- [x] 12. Gates: pytest 591, black/isort/flake8/interrogate clean, tsc -b clean, vite build clean, eslint 20 errors (baseline — 0 new).

---

## Surprises and Discoveries
- Fresh JSON columns persist as SQL NULL, and Pydantic's `default_factory` only fills ABSENT keys, not explicit None — so `TableStateRead.model_validate(row)` rejected None lists. Fixed with a `mode="before"` validator coercing None→[].
- The React-Compiler eslint (`react-hooks/purity`) flags `Date.now()` even inside event handlers ("impure function during render"). Swapped id generation to a `useRef` counter — pure and stable.
- Building scene transitions and the title card as CSS animations re-keyed on map/title (rather than JS timers + setState) both looks better AND sidesteps the repo's `react-hooks/set-state-in-effect` rule — zero new eslint errors.
- DuckDB stores `Float` single-precision, so `darkness=0.7` round-trips as 0.69999988; tests use `pytest.approx` (Postgres double-precision would be exact).
- New tables need no `patch_duckdb_schema` entry — `create_all` builds whole tables on first boot; the DuckDB patch list is only for columns added to EXISTING tables.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-07-04 | Map image storage | local uploads/ (5MB, ephemeral on Render) / Vercel Blob | Vercel Blob, 40MB cap, local-dir fallback when token unset (dev) | Czepeku 4K maps are 5–25MB; Render disk is wiped on deploy; blob is CDN-backed (projector loads map once). |
| 2026-07-04 | Image dimensions | server-side Pillow / client-supplied | client reads via browser Image, sends w/h on create | Avoids new dependency (needs approval); dims are display-only. |
| 2026-07-04 | Fog data model | separate rect+poly shapes / polygons only | polygons only; rect tool emits a 4-point polygon | One shape type end-to-end; editor still offers a rect tool. |
| 2026-07-04 | Tokens storage | junction table / JSON on table_states | JSON | Tokens are per-scene display state, read/written as a set, high churn; not relational data. |
| 2026-07-04 | Table View live updates | subscribe campaign topic / dedicated table topic only | table:{session_id} only; combat changes also publish table.updated (no payload → refetch) | Avoids handing campaign_id to the player surface (review flagged the campaign-stream IDOR chain). |
| 2026-07-04 | Scene transition | dual-image crossfade / fade-through-black | fade-through-black (300ms out, 500ms in) | Avoids dual-aspect layout headaches; reads as a deliberate scene change. |
| 2026-07-04 | Turn glow linkage | tokens store combatant refs / recompute per render | projection returns active_refs + defeated_refs (combatant id + character_id); view glows tokens whose ref_id matches | No HP or initiative data ever reaches the table surface. |
| 2026-07-04 | advance_combat_turn campaign publish | leave gap / add publish_session_combat_updated | add it | 2 lines; fixes the review-flagged second-DM-device turn-sync gap and keeps the DM console live. |

---

## Context and Orientation

### Files touched
Backend: `alembic/versions/0020_battle_maps_table_states.py`, `domain/battle_map.py`,
`domain/table_state.py`, `db/repos/battle_map_repo.py`, `db/repos/table_state_repo.py`,
`services/battle_map_service.py`, `services/table_service.py`, `api/routers/battle_maps.py`,
`api/routers/table.py`, `api/routers/stream.py` (table stream), `api/routers/uploads.py`
(battle-map blob upload), `integrations/event_bus.py` (table topic),
`services/session_service.py` (campaign publish on advance), `api/main.py` (routers).
Tests: `tests/test_services/test_battle_map_service.py`, `tests/test_services/test_table_service.py`,
`tests/test_api/test_table_api.py`.
Frontend: `frontend/src/api/table.ts`, `frontend/src/api/types.ts`,
`frontend/src/components/table/MapCanvas.tsx`, `frontend/src/pages/TableView.tsx`,
`frontend/src/pages/BattleMaps.tsx`, `frontend/src/components/table/TableConsole.tsx`,
`frontend/src/pages/SessionHud.tsx` (console mount), `frontend/src/App.tsx` (routes),
`frontend/src/pages/Layout.tsx` (nav).

### Architecture layers involved
Full slice: api → services → db/repos → domain; integrations/event_bus for SSE.
Boundary rules apply (routers thin, authz in services, repos pure CRUD).

### Key terms defined
- **BattleMap**: campaign-scoped library entry — blob image URL, pixel dims, optional grid size, prep-authored fog **regions** (named polygons in image-pixel coords).
- **TableState**: session-scoped live state — active map, revealed region ids, brush reveal circles, tokens, darkness 0–1, title card.
- **Table View**: unauthenticated capability-URL route (session UUID = secret, same trust model as /play) rendering the player-safe projection only: no unrevealed region names, no HP, no DM notes.
- **Token**: {id, kind pc|monster|custom, ref_id, label, image_url, x, y, size} in image-pixel coords.

---

## Concrete Steps
The Progress list is the step index; each backend step is verified by the tests in step 6,
each frontend step by tsc + manual drive. Coordinates are image-pixel space everywhere;
the Table View scales via SVG viewBox, so no client does coordinate math.

---

## Validation and Acceptance
- [ ] `pytest -q` green including new table/battle-map tests
- [ ] Unauth GET /api/table/{session_id} returns projection; unrevealed region names absent; no hp fields anywhere in payload
- [ ] PATCH table state requires owner (401 no header / 403 non-owner)
- [ ] Manual drill: upload a Czepeku map → draw two regions → open /table/{sid} in a second browser → toggle region (fog lifts live) → brush a reveal → place PC token (portrait shows) → advance turn in HUD (glow moves) → darkness slider dims map → title card fades in → ping pulses
- [ ] `tsc -b` clean; eslint introduces no NEW errors

---

## Idempotence and Recovery
Migration 0020 is additive (two new tables). Backend steps land in dependency order and
are independently committable; frontend compiles at each step (console mounts last).
Resume from the Progress checkboxes.

---

## Interfaces and Dependencies
**Produces:** /table/:sessionId route, battle-map library CRUD, table SSE topic.
**Depends on:** Vercel Blob token (BLOB_READ_WRITE_TOKEN) for prod uploads (dev falls back
to local uploads/); existing event bus + stream router; PC portrait_url / monster image_url
for tokens; Plan 41 combat lifecycle (active combatant, session.combat.updated).

---

## Outcomes and Retrospective
Full vertical slice landed and verified green. The security-critical decision — a single thin, unauthenticated `TableProjection` that resolves everything server-side and is asserted by tests to carry no HP/initiative and no unrevealed region names — kept the capability-URL surface safe by construction rather than by frontend discipline. Reusing the Plan 41 combat lifecycle for the turn-glow meant the projector highlights the active combatant with zero new combat plumbing. Deliberately deferred: a live-brush reveal tool in the console (the data model + rendering already support brush circles; only the console's paint interaction is unbuilt), multi-worker SSE (still the in-process bus — fine for one DM), and server-side image dimension probing (read client-side to avoid a Pillow dependency). The remaining work is a real at-the-table drill on actual Czepeku exports; see Validation.
