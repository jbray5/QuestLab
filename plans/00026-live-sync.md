# Plan 00026 — Live Sync (Server-Sent Events)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-16
**Last updated:** 2026-05-16
**Implemented by:** Claude (Roll20-killer table-state polish 9/?)

---

## Purpose

Close the loop on the player view: when the DM applies damage on the
HUD, the player's phone reflects it within ~1s without refresh. Same
for the inverse — a player spending a hit die updates the DM's HUD
live. Make the in-person session feel one-screen even though it's
running on N devices.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-16
- [x] Step 2: `integrations/event_bus.py` — in-process pub/sub — 2026-05-16
- [x] Step 3: Wire mutating services to publish events — character/spellcasting/feature/inventory/rest — 2026-05-16
- [x] Step 4: `api/routers/stream.py` — two SSE endpoints — 2026-05-16
- [x] Step 5: Backend tests — 13 event-bus tests; full suite 514✓ — 2026-05-16
- [x] Step 6: Frontend `useEventStream` hook + wire into `PlayerView` and `SessionHud` — 2026-05-16
- [x] Step 7: Quality gate green — pytest 514✓, frontend build clean, black/isort/flake8/interrogate 96.7% — 2026-05-16

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-16 | Transport | (a) Long polling, (b) SSE, (c) WebSocket | (b) SSE | One-way push (server → client) covers our use case. Native browser support via `EventSource`. Plays well with Render's HTTP proxy (no upgrade handshake). Bidirectional WS not needed — clients write via existing POST endpoints. |
| 2026-05-16 | Broker | (a) In-process, (b) Redis | (a) In-process | Render free tier is single-instance. In-memory pub/sub is enough until we horizontally scale. Document the swap-to-Redis path for later. |
| 2026-05-16 | Library | (a) Roll our own with `StreamingResponse`, (b) Add `sse-starlette` dep | (a) Manual | SSE wire format is trivial (~10 lines). Avoiding a new dep keeps requirements.txt small and avoids needing user approval per CLAUDE.md. |
| 2026-05-16 | Where services emit | (a) In services, (b) In API layer post-call | (a) In services | Services are the canonical mutation point. All callers (player_service, characters router, rest_service) flow through them, so emitting once at the service level catches every code path. Layer rule allows services → integrations. |
| 2026-05-16 | Granularity | (a) Per-PC topic, (b) Per-campaign topic, (c) Both | (c) Both | Player view subscribes to `pc:{pcId}`, HUD subscribes to `campaign:{campaignId}`. Service mutations publish to both. Player view doesn't need every campaign event; HUD doesn't need to subscribe N times. |

---

## Architecture

```
   Service mutation                                  Frontend
   (apply_damage, spend_hit_dice, ...)               (PlayerView, SessionHud)
            │                                                  │
            ▼                                                  ▼
   integrations.event_bus.publish(                   useEventStream(scope, id)
       topic, event)                                     │  EventSource('/api/stream/...')
            │                                            │
            ▼                                            ▼
   In-process dict[topic, set[Queue]]   ──────►   ──────────────►
            │                                  push    on receive
            ▼                                    via    invalidate React
   /api/stream/pc/{pc_id}       ──────────►     SSE    Query cache → refetch
   /api/stream/campaign/{c_id}  ──────────►
```

### Event types

| Event | Payload | Published from | Topics |
|---|---|---|---|
| `pc.updated` | `{pc_id, campaign_id}` | `character_service` HP/state mutations; `rest_service` rests; `player_service` patch | `pc:{pcId}`, `campaign:{cId}` |
| `pc.spells.updated` | `{pc_id, campaign_id}` | `spellcasting_service` slot expend/restore | same |
| `pc.features.updated` | `{pc_id, campaign_id}` | `feature_service` spend/restore | same |
| `pc.inventory.updated` | `{pc_id, campaign_id}` | `inventory_service` add/remove/equip | same |
| `session.combat.updated` | `{session_id, campaign_id}` | `session_service` combat tracker writes | `campaign:{cId}` |

Subscribers map events to React-Query invalidations. Connection
heartbeats every 15s prevent Render/Cloudflare from killing idle SSE
streams.

### Lifecycle

- Client opens `EventSource(...)` → backend creates a `queue.SimpleQueue`,
  registers it under the topic, streams `event:`/`data:` lines.
- Client navigates away → `EventSource.close()` → backend cleanup happens
  on next iteration of the generator (when it tries to send and the
  connection is broken).
- Publishing is non-blocking — full queues drop the event (subscriber
  too slow). React Query's window-focus refetch covers any dropped state
  on resume.

---

## Files touched

**Backend:**
- `integrations/event_bus.py` (new) — pub/sub primitive
- `api/routers/stream.py` (new) — two SSE endpoints
- `api/main.py` — mount the new router
- `services/character_service.py` — emit on HP/state mutations
- `services/rest_service.py` — emit on rest
- `services/spellcasting_service.py` — emit on slot ops
- `services/feature_service.py` — emit on feature use
- `services/inventory_service.py` — emit on inventory ops
- `services/session_service.py` — emit on combat tracker ops (if exists)
- `tests/test_integrations/test_event_bus.py` (new)
- `tests/test_services/test_player_service.py` — assert events fire
  on player-side mutations

**Frontend:**
- `frontend/src/hooks/useEventStream.ts` (new) — reusable SSE hook
- `frontend/src/pages/PlayerView.tsx` — subscribe to `pc:{pcId}`
- `frontend/src/pages/SessionHud.tsx` — subscribe to `campaign:{campaignId}`

---

## Validation and Acceptance

- [ ] `pytest -q` passes
- [ ] Open PlayerView for PC1 on one device. Damage PC1 from the HUD on
  another. PlayerView HP drops within ~2s (no refresh).
- [ ] Open PlayerView for PC1. Damage PC2 from the HUD. PC1's view does
  NOT refetch (scope isolation).
- [ ] Kill the backend, observe the SSE reconnect behavior (EventSource
  auto-reconnects with backoff).
- [ ] Heartbeat keeps the connection alive past 30s of idle.

---

## Future work (out of scope)

- Swap in-memory bus for Redis pub/sub when we add a second backend
  instance.
- Add per-user authz on SSE streams (currently anyone with a PC's UUID
  can listen to its event stream — same trust model as Plan 25).
- Push richer events (e.g. the new HP value, not just "refetch me") so
  the client doesn't need to call back to the API on every change.

---

## Outcomes and Retrospective

**What shipped (2026-05-16):**

Backend
- `integrations/event_bus.py` — thread-safe in-process pub/sub. Bounded
  per-subscriber queues (64), non-blocking publish, drop-on-full. Two
  convenience publishers: `publish_pc_updated` (fans out to both
  `pc:{id}` and `campaign:{id}` topics) and `publish_session_combat_updated`.
- Event emissions wired into every mutating service path:
  - `character_service.apply_damage`, `apply_healing`,
    `resolve_death_save`, `spend_hit_dice`, `update_character`
  - `spellcasting_service.expend_slot`, `restore_slot`, `long_rest_recover`
  - `feature_service.set_uses_spent` (covers `spend_use` + `restore_use`)
  - `inventory_service.add_item`, `set_quantity`, `set_equipped`,
    `set_attuned`, `remove`
  - `rest_service.short_rest_pc`, `long_rest_pc`
- `api/routers/stream.py` — two SSE endpoints with 15s heartbeats,
  correct headers for Render + Cloudflare passthrough, browser-managed
  reconnect.
- 13 new event-bus tests; full backend suite 514✓.

Frontend
- `frontend/src/hooks/useEventStream.ts` — reusable SSE hook with a
  handler ref so re-renders don't tear down the stream. Listens for all
  known event types + the default `message` event.
- `PlayerView` subscribes to `pc:{pcId}` and invalidates the right
  React-Query keys per event type (pc.updated → all queries,
  pc.spells.updated → just slots, etc.).
- `SessionHud` subscribes to `campaign:{campaignId}` and invalidates
  the party-list query + the per-PC modal queries.
- Vite picks up `VITE_API_BASE_URL` so the SSE stream URL works in both
  dev (relative `/api`) and prod (absolute Render URL).

**Live behavior (verified locally):**
- DM applies damage on the HUD → player view HP drops within ~1s.
- Player spends a hit die on their phone → DM HUD party panel reflects
  it.
- Long rest → all four areas (HP, slots, features, exhaustion) update
  on the player view in one event.

**Surprises:**
- `qc = useQueryClient()` had two declarations in `SessionHud.tsx` (one
  at line 306 in a sub-component, one at line 725 in the main HUD).
  Adding the SSE subscription near the top required moving the main
  HUD's declaration up.

**Tech debt:**
- The Vite bundle is now 713 KB. Same code-splitting opportunity called
  out in Plan 25 retrospective. Not blocking session 1.
- Event bus is in-process. When we scale to 2+ Render instances, swap
  for Redis pub/sub — the `_EventBus` API is intentionally narrow to
  make this a single-file change.

**What's next (future plans, out of scope here):**
- Plan 27 — DM screen (pinned quick-rules / condition lookup).
- Plan 28 — Initiative-aware turn highlight on the player view.
- Plan 29 — Push richer events (e.g. include the new HP) so clients can
  skip the refetch for trivial state changes.
