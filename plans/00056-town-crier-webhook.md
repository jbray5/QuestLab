# Plan 00056 — The Town Crier (NPC Discord webhook poster)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-07-30
**Last updated:** 2026-07-30
**Implemented by:** Claude Code

---

## Purpose

DM posts as NPCs in the campaign Discord between sessions. Today: manual, no
tooling. This adds a DM-only page — pick channel → pick NPC identity → write →
preview as Discord renders it → send. One webhook per channel serves unlimited
NPC identities via Discord's per-message `username` / `avatar_url` overrides,
so the DM creates webhooks once in the Discord UI and never again.

Needed by **Friday 2026-08-01** — Friday's in-character post depends on it.
Hard freeze Thursday 2026-08-07; nothing ships Fri/Sat of session week.

---

## Progress

- [x] Step 0: review — no Discord/webhook code exists anywhere in repo (2026-07-30)
- [x] Step 1: `domain/crier.py` — channel / npc / post models (2026-07-30)
- [x] Step 2: `db/repos/crier_repo.py` (+ detach helpers, see Surprises) (2026-07-30)
- [x] Step 3: `integrations/discord_webhook.py` — the POST adapter (2026-07-30)
- [x] Step 4: `services/crier_service.py` — authz, send, sent-log (2026-07-30)
- [x] Step 5: `api/routers/crier.py` + registered in `api/main.py`; 6 route groups confirmed in OpenAPI (2026-07-30)
- [x] Step 6: Alembic migration `0033_town_crier.py` — hand-written, follows repo's sequential style. NOT yet applied to prod (`alembic upgrade head` pending; runs at deploy) (2026-07-30)
- [x] Step 7: `TownCrier.tsx` + `api/crier.ts` + route `campaigns/:campaignId/crier` + 📣 nav item; `tsc --noEmit` clean (2026-07-30)
- [x] Step 8: `scripts/seed_crier_roster.py` — 4 placeholder avatars written to `frontend/public/crier-avatars/`; identity seeding via API is a flag away (needs deployed backend) (2026-07-30)
- [x] Step 9: 14 tests in `tests/test_services/test_crier_service.py` (2026-07-30)
- [x] Step 10: quality gate — 709 passed, black/isort/flake8 clean, interrogate 96.1%, pip-audit clean (2026-07-30)

**Remaining for the DM (not code):** deploy → run `alembic upgrade head` →
run `python scripts/seed_crier_roster.py` → create webhooks in Discord UI →
paste URLs in the Town Crier page → send Friday's Tallyman post.

---

## Surprises and Discoveries

- **Webhook URL is a credential.** Anyone holding it can post to the channel
  as anything. Never leaves the server: `CrierChannelRead` omits it entirely
  and returns `configured: bool` + a masked tail. Client never receives it.
- **`DEMO_MODE` pins every visitor to one shared identity**
  (`api/deps.py:53`). A send route left open under that flag = any demo
  visitor posts into the real Discord. Send endpoint hard-refuses when
  `DEMO_MODE` is set.
- **Discord fetches `avatar_url` itself** — must be a publicly reachable
  absolute URL. `uploads/` is relative AND ephemeral on Render free tier, so
  it is unsuitable. Reusing `integrations/blob_storage.py` (Vercel Blob,
  already used for portraits) gives permanent absolute public URLs and needs
  no new env var. Missing token degrades gracefully: Discord falls back to
  the webhook's own default avatar.
- Discord caps: `content` 2000 chars, embed `description` 4096, `username`
  80. Validated in Pydantic at the boundary, not just in the UI.
- **DuckDB enforces FKs that Postgres migrations soften.** The migration's
  `ON DELETE SET NULL` on `crier_posts` doesn't exist in the SQLModel
  metadata that tests build from, so deleting an NPC with log rows blew up
  under DuckDB. Fix: explicit `detach_channel`/`detach_npc` repo helpers
  called by the service before delete — identical behaviour on both DBs.
- **The project venv was broken on arrival** — its base interpreter
  (`pythoncore-3.14-64`) was gone from disk; nothing Python could run.
  Rebuilt on system Python 3.12 from requirements.txt. Unrelated to this
  plan but blocking it.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-07-30 | Webhook URL storage | client-held / server DB / env var | server DB, never serialized to client | Roster editable without redeploy; credential stays server-side |
| 2026-07-30 | Avatar hosting | `uploads/` dir / Vercel Blob / external URL | Vercel Blob, DM may override with any absolute URL | Discord must fetch it; `uploads/` ephemeral + relative |
| 2026-07-30 | Send under DEMO_MODE | allow / refuse | refuse (403) | Shared demo identity would let any visitor post as the DM's NPCs |
| 2026-07-30 | Scope of roster | global / per-campaign | per-campaign | Matches every other entity; authz reuses `_get_owned_campaign` |
| 2026-07-30 | Preview fidelity | approximate / Discord-accurate | Discord-accurate (dark bg, embed left color bar, username-not-linked) | Acceptance is "appears as the Tallyman" — DM must trust preview before sending |

---

## Context and Orientation

### Files touched
- `domain/crier.py` (create)
- `db/repos/crier_repo.py` (create)
- `integrations/discord_webhook.py` (create)
- `services/crier_service.py` (create)
- `api/routers/crier.py` (create)
- `api/main.py` (modify — register router)
- `alembic/versions/<rev>_town_crier.py` (create)
- `frontend/src/pages/TownCrier.tsx` (create)
- `frontend/src/App.tsx` (modify — route)
- `frontend/src/pages/Layout.tsx` (modify — nav link)
- `scripts/seed_crier_roster.py` (create)
- `tests/test_services/test_crier_service.py` (create)

### Architecture layers involved
`pages/api → services → db/repos → domain`, plus `integrations/` for the
outbound HTTP. Boundary rules: router does transport only; all authz in
`crier_service`; repo does DB only; `discord_webhook` is a pure adapter with
no service imports.

### Key terms defined
- **Webhook** — a Discord-issued URL bound to one channel. POSTing JSON to it
  posts a message. Created by the DM in Discord UI (Channel → Edit →
  Integrations → Webhooks), then pasted here once.
- **Identity override** — `username` + `avatar_url` fields in the POST body.
  Discord applies them per-message, so one webhook impersonates any number of
  NPCs. This is why one webhook per channel is enough.
- **Embed** — Discord's boxed rich-text block with a colored left bar. Used
  here for in-character prose; `content` is used for plain out-of-character
  lines. A message may carry either or both.

---

## Concrete Steps

### Step 1: Domain models
**File:** `domain/crier.py` · **Action:** Create
**Details:** `CrierChannel` (id, campaign_id FK, label, webhook_url, created_at),
`CrierNpc` (id, campaign_id FK, name ≤80, avatar_url, embed_color int, sort_order),
`CrierPost` (id, campaign_id FK, channel_id, npc_id, npc_name snapshot, content,
embed_description, status, error, sent_at). Read models: `CrierChannelRead`
**omits `webhook_url`**, exposes `configured: bool` + `url_hint: str`.
`CrierSendRequest` validates content ≤2000, embed ≤4096, at least one present.
**Verify:** `python -c "import domain.crier"`; no `webhook_url` on any `*Read`.

### Step 2: Repo
**File:** `db/repos/crier_repo.py` · **Action:** Create
**Details:** `CrierChannelRepo`, `CrierNpcRepo`, `CrierPostRepo` — get/list/
create/update/delete by campaign. ORM only, no raw SQL, no business logic.
**Verify:** boundary-checker clean; no `services` import.

### Step 3: Discord adapter
**File:** `integrations/discord_webhook.py` · **Action:** Create
**Details:** `post(webhook_url, *, username, avatar_url, content, embed_description,
embed_color) -> None`. Builds `{content, username, avatar_url, embeds:[{description,
color}]}`, drops empty keys, POSTs via `httpx` with `?wait=true`, 10s timeout.
Raises `ValueError` on non-2xx with Discord's message. **Never logs the URL**
(secret) — logs only the channel label passed in. Honors 429 `retry_after` with
one retry.
**Verify:** unit test with mocked `httpx` asserts payload shape + that no test
log record contains the webhook URL.

### Step 4: Service
**File:** `services/crier_service.py` · **Action:** Create
**Details:** All ops call `_get_owned_campaign(db, campaign_id, dm_email)`
(mirrors `puzzle_service`). `send()` refuses with `PermissionError` when
`DEMO_MODE` is truthy; resolves channel + npc; calls the adapter; writes a
`CrierPost` row with status `sent`/`failed` + error text either way, so the
sent-log records failures too.
**Verify:** test asserts non-owner raises `PermissionError`, DEMO_MODE raises,
and a failed send still writes a `failed` row.

### Step 5: Router
**File:** `api/routers/crier.py` · **Action:** Create; `api/main.py` modify
**Details:** All routes `CurrentUser`-gated (no capability/anon routes — this
is DM-only, unlike puzzles). CRUD for channels + NPCs, `POST
/campaigns/{id}/crier/send`, `GET /campaigns/{id}/crier/posts`.
**Verify:** `/docs` lists them; anonymous request → 401.

### Step 6: Migration
**File:** `alembic/versions/<rev>_town_crier.py` · **Action:** Create
**Details:** `alembic revision --autogenerate -m "town crier"`; review for
Postgres/DuckDB drift; three tables, FKs to `campaigns.id`.
**Verify:** `alembic upgrade head` then `alembic current`.

### Step 7: Composer UI
**File:** `frontend/src/pages/TownCrier.tsx` · **Action:** Create
**Details:** Channel select · NPC identity picker (avatar + name + color
swatch) · content textarea + embed textarea with live char counters ·
**Discord-accurate preview** (dark `#313338`, 40px round avatar, bold
username, embed with 4px left color bar) · Send · sent-log table. Roster
editor: add/rename NPC, set color, upload avatar. Channel editor: label +
webhook URL (write-only field; shows `configured ✓` + masked tail after save).
**Verify:** preview matches a real Discord post side by side.

### Step 8: Seed roster
**File:** `scripts/seed_crier_roster.py` · **Action:** Create
**Details:** Four identities per handoff — The Tallyman (old-honey gold
`#C8963E`), Sister Maren (parchment `#D9C9A3`), The Lutenist (deep red
`#8E2434`), Blackreef Harbor (sea-slate `#54707F`). Generates placeholder
avatars if no real art supplied; DM swaps files later. Idempotent on
(campaign_id, name).
**Verify:** re-running does not duplicate rows.

### Step 9: Tests
**File:** `tests/test_services/test_crier_service.py` · **Action:** Create
**Details:** Existing DuckDB in-memory fixture style. Cases: authz denial,
DEMO_MODE refusal, payload shape, failed-send logging, `*Read` never carries
`webhook_url`, over-length content rejected.

### Step 10: Quality gate
`black . && isort . && flake8 && interrogate -c pyproject.toml && pip-audit && pytest -q`

---

## Validation and Acceptance

- [ ] `pytest -q` — zero failures
- [ ] `black . && isort . && flake8 && interrogate -c pyproject.toml` — clean
- [ ] `pip-audit` — no known vulns
- [ ] `alembic upgrade head` succeeds; `alembic current` shows the new rev
- [ ] **Acceptance (the handoff's own):** DM opens the page, picks "The
      Tallyman," pastes text, hits send → post appears in Discord under the
      Tallyman's name and face
- [ ] Webhook URL absent from the client bundle: DevTools → Network → no
      response body contains `discord.com/api/webhooks`
- [ ] Sent-log shows the post; a deliberately broken URL logs `failed` + error

---

## Idempotence and Recovery

Steps 1–5, 7, 9 are file creates — safe to re-run/overwrite. Step 6 migration
is **not** — check `alembic current` before generating a second revision.
Step 8 seeder is idempotent on (campaign_id, name). Progress checkboxes above
are the restart guide.

---

## Interfaces and Dependencies

**Produces:** `/campaigns/{id}/crier` DM route; `crier_service.send`;
reusable `integrations/discord_webhook.post` for any future outbound Discord.
**Depends on:** existing campaign ownership authz (`campaign_service._assert_owner`),
`integrations/blob_storage` (avatars), `httpx` (already in requirements).

---

## Outcomes and Retrospective

_Fill in after completion._
