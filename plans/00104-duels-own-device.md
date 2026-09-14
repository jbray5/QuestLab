# Plan 00104 — Duels on your own device, and feeling the hit

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-14
**Last updated:** 2026-09-14
**Implemented by:** Claude Code

---

## Purpose
Plan 101 shipped hot-seat duels: one device passed round the table. Justin now
wants each player on their own phone, and wants a hit to *land* — a buzz and a
flinch, not just a line of text.

Hot-seat stays. This adds a second way to duel where the fight lives on the
server and both phones watch it.

---

## Progress
- [x] Step 1: `duels` table + repo (migration 0049)
- [x] Step 2: `duel_service` — start, read, act, end, called_for
- [x] Step 3: Routes + `GET /stream/duel/{id}` SSE topic
- [x] Step 4: `ArenaSlot.pc_id` so a seat knows whose it is
- [x] Step 5: Frontend — challenge banner, live sync, turn gating
- [x] Step 6: Hit feedback — vibrate + flinch animation
- [x] Step 7: Tests (13 new), full gate green
- [ ] Step 8: Verify on prod once deployed

---

## Surprises and Discoveries
- Everything needed for live sync already exists: an event bus with topics, SSE
  endpoints on the same capability-URL trust model as `/play`, and a
  `useEventStream` hook. Adding a `duel` scope is a few lines in each.
- `ArenaPc` carries no character id, so a roster seat cannot currently say
  which real player owns it. Turn ownership needs that.
- **`navigator.vibrate` is not supported on iOS Safari** — Android only. The
  animation has to carry the feeling on iPhones, so it is the primary effect
  and the buzz is the bonus.
- **Postgres and DuckDB disagree about timestamps.** Postgres returns the aware
  UTC value that was written; DuckDB converts to *local* time and drops the
  tzinfo, so the same row reads five hours earlier here. A `updated_at >= now -
  4h` filter therefore found nothing under test and everything in prod — the
  challenge-banner test caught it. `naive.astimezone(UTC)` assumes local time,
  which is exactly right for both. Written up in ARCHITECTURE invariant 1.
- **The seal survives the round trip.** The HMAC is taken over
  `model_dump_json`, and a fight stored as a JSON column and revalidated comes
  back byte-identical, so a server-held duel needed no change to the arena's
  tamper seal — it verifies the same way it does off a phone.
- **`state.pc_id` must not be touched.** It is inside the seal, so the obvious
  move — point it at whoever is acting — invalidates the document. It is only
  ever an existence check (one `_pc_or_raise`), and the working set already
  belongs to whoever `_draw` loaded, so leaving it alone is correct.
- The React component's `act()` and `endFight()` are declared above the duel
  state they now need, so they reach it through refs rather than reordering
  four hundred lines. And a local `blocked` (a string reason on feature
  buttons) already existed — the turn gate is `waiting`.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-14 | Where the fight lives | (a) sealed doc on one phone (b) server row both phones read | (b) for own-device | Two sealed copies diverge instantly; there is no authority. Hot-seat keeps (a). |
| 2026-09-14 | Keeping up to date | (a) poll (b) SSE | (b) | The bus, the endpoints and the client hook already exist and the table view already uses them. |
| 2026-09-14 | Who may act | (a) trust the client (b) server checks the seat | (b) | A capability URL is a secret, not a permission. The server checks the acting character owns the seat whose turn it is. |
| 2026-09-14 | Seal on server-held duels | (a) drop it (b) keep it | (b) | The state still round-trips through `arena_service.act`, which verifies it. Keeping it costs nothing and means one code path. |

---

## Context and Orientation

### Files touched
- `alembic/versions/0049_duels.py` — **new**
- `domain/duel.py` — **new**
- `db/repos/duel_repo.py` — **new**
- `services/duel_service.py` — **new**
- `api/routers/duels.py` — **new**; `api/routers/stream.py`, `api/main.py`
- `integrations/event_bus.py` — a `duel:{id}` publisher
- `domain/arena.py` — `ArenaSlot.pc_id`
- `services/arena_service.py` — set it in `_slot_for_pc`
- `frontend/src/pages/Arena.tsx` — challenge, lobby, live sync, turn gating, hit feedback
- `frontend/src/hooks/useEventStream.ts` — a `duel` scope
- `tests/test_services/test_duel_service.py` — **new**

### Architecture layers involved
`api/ → services/ → db/repos/ → domain/`. The duel row is the first thing the
arena persists; the fight itself is still computed by `arena_service`, which
knows nothing about storage.

### Key terms defined
- **Seat** — one roster position in a fight, belonging to one real character.
- **Turn ownership** — only the character whose seat is up may act.
- **Capability URL** — `/play/{pc_id}` style: holding the link is the proof.

---

## Validation and Acceptance
- [x] `pytest -q` — 934 pass; black/isort/flake8/interrogate/pip-audit clean; tsc + eslint + vite build clean
- [x] Acting out of turn is refused by the server, not just hidden by the UI
      (`test_plan104_duels.py` drives it over HTTP and gets a 403)
- [x] A stranger holding neither seat's link is refused both read and act
- [ ] Two browsers, two characters: each sees the other's turn land live
- [ ] A hit buzzes the defender's phone (Android) and flinches on any device

---

## Interfaces and Dependencies
**Produces:** persisted, live-synced fights — the groundwork for anything
multi-device later.
**Depends on:** Plan 101's roster engine, the event bus, `useEventStream`.

---

## Outcomes and Retrospective
_To be filled in on completion._
