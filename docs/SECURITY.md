# QuestLab — Security Model

> **Read this first (2026-10-30, Plan 120).** The production deployment (Render API + Vercel
> frontend) has **no authenticating edge**. Until `AUTH_MODE=oauth` is set there, the API trusts the
> `X-MS-CLIENT-PRINCIPAL-NAME` header from anyone: typing a DM's email on `/welcome` *is* being that
> DM. Plan 120 closed the latent takeover bugs so accounts can be switched on; the switch-over is in
> `docs/LAUNCH.md` §0. After it, the table below is the access model.

## Authentication

QuestLab runs in one of two identity modes, chosen by `AUTH_MODE` (Plan 73):

### `oauth` — every public deployment (required for production)
- DMs sign in with an **email + password** account, or with **Discord** / **Patreon** when those are configured.
- The API issues an **HMAC-SHA256 signed session token** (`integrations/session_token.py`, secret `APP_SECRET`, 30-day expiry, constant-time verify, fail-closed). The frontend keeps it in `localStorage` and sends `Authorization: Bearer …` on every DM request — uploads and exports included (`authHeaders()` in `frontend/src/api/client.ts`).
- The client-supplied email header is **ignored**. An expired/invalid bearer → 401, and the frontend clears the stale identity and returns to `/welcome`.
- **Email is the ownership key** (`campaign.dm_email`). Because header mode let anyone *be* any email, an email that already owns campaigns (or a passwordless `users` row) proves nothing on its own:
  - **Password signup** on such an email requires the server's one-time `ACCOUNT_CLAIM_CODE` (Plan 120). A fresh email signs up freely. Remove the variable once owners have claimed.
  - **OAuth** links to or creates an account by email **only when the provider marks the email verified** (Discord `verified`, Patreon `is_email_verified`).
- OAuth CSRF is a signed `state` token (kind `state`, 10-minute TTL) bound to the provider.
- Passwords: **scrypt** (N=2^15, r=8, p=1, per-user salt, constant-time verify; `integrations/passwords.py`). Login failures share one message. Set `RATE_LIMIT=on` (per-IP throttle on sign-in/sign-up/join).
- Known gaps: no email verification or password reset by email (reset = sign in with a verified Discord email, or the operator clears `users.password_hash`).

### `header` — local development, or behind an authenticating edge only
- Identity comes from the header named by `AUTH_EMAIL_HEADER`, which is safe **only** if an edge (Azure Front Door + Entra ID, Cloudflare Access) injects it and strips any client copy.
- `CURRENT_USER_EMAIL` is a local fallback and is **refused when `ENV=production`** (Plan 120).
- `/api/auth/dev-token` (mint a token for the header identity) exists only when `ENV` is development/test.

## Who can read and write what (audit 2026-10-30)

Players never sign in: their surfaces are **capability URLs** — the UUID in the link is the secret.

| Surface | Credential | Can read | Can write |
|---|---|---|---|
| DM app `/api/campaigns/**`, sessions, NPCs, encounters, maps, shops, notebooks, exports | DM session (oauth) | only that DM's campaigns — every service checks `campaign.dm_email` through the child's own parent | same |
| `/api/admin/**` | DM session + `BOOTSTRAP_ADMIN_EMAILS` | admin tools; export is the admin's own campaigns | monster reseed |
| `/play/{pc_id}/**` | the PC's UUID | that PC's sheet, spells, gear, features; the party roster (names + PC ids); **revealed** NPCs only (name, role, race, appearance, location, status, portrait — never secret/motivation/hooks/notes) | that PC's HP, slots, death saves, coin/inspiration (allowlisted fields), gear, buy/sell/give, level-up **only after the DM grants it**, arena/duels (seat-checked) |
| `/join/{campaign_id}` | campaign UUID (+ join code if set) | the roster | create a PC while sign-up is on |
| `/table/{session_id}` (TV/projector) | session UUID | the projected board, tokens, initiative names, PC HP | its own PC token moves (via `/play`) |
| `/market/{campaign_id}`, `/shop/{shop_id}`, `/puzzle/{id}` | UUID | visible shops / answer-free puzzle | purchases (via `/play`) |
| `/stream/**` (SSE) | UUID of the topic | event ids/types only — no DM content | — |

Never on a player surface: hidden NPCs, NPC secrets/KNOWS/WANT/VOICE, beat cards, session or campaign notes, `world_notes`.

### Open findings (tracked in `docs/QUALITY.md`)
1. **High — one link controls the party.** The projector link, the party list and the join roster expose every PC's UUID, and a PC UUID can write that sheet. Fix needs a separate per-PC `play_token` (schema change, ask first).
2. **High — shared catalogs.** Any signed-in DM can edit or delete catalog monsters, items and spells for everyone (no owner column on items/spells).
3. **High — uploads.** File extension comes from the client name; an `.html`/`.svg` upload is served from the API origin.
4. **Medium** — fog of war is client-side (fogged monsters are in the projection); `/stream/campaign/{id}` ignores the join code; session `attending_pc_ids` / combatant `character_id` aren't checked against the campaign; crier webhook URL isn't restricted to Discord; inventory PATCH notes-only path skips the row check.
5. **Low** — `GET /play/{pc}` includes the PC `notes` field (the DM's notes box on the character form); feature spend doesn't check the feature belongs to the PC; arena duel/boss accept PCs from another campaign; `buy` ignores a hidden shop.

## Authorization
- Authorization checks live in `services/` — never in the UI alone.
- **AI entitlement** (`services/entitlement_service.py`): generation is off by default (`AI_FEATURES`, Plan 86); when a private build turns it on, `AiUser` gates and counts it.

## Data Security Rules
| Rule | Enforcement |
|---|---|
| No SQL string concatenation | SQLModel `select()` only; `text()` with bound params if needed |
| All user input validated | Pydantic v2 at all boundaries before any write |
| No secrets logged or printed | Code review + CI scan |
| Exports owner/admin-only | Enforced in `services/` |
| Fail closed | No identity → 401; no `APP_SECRET` → no tokens verify |

## Environment Variables
- `.env` is never committed. `.env.example` is committed with placeholder values.
- Secrets (`APP_SECRET`, `ACCOUNT_CLAIM_CODE`, `PGPASSWORD`, provider secrets) live in the Render dashboard, never in `render.yaml` or the repo.

## Dependency Scanning
- `pip-audit` runs on every CI build and pre-commit. Vulnerabilities must be resolved before merge.

## Network
- Production: Render (API, public URL, TLS) + Vercel (static frontend). **No WAF/edge auth** — hence `oauth` mode.
- Postgres requires SSL (`PGSSLMODE=require`); no public DB access.

## Local Development
- `ENV=development` enables the `CURRENT_USER_EMAIL` fallback and `/auth/dev-token`. Never in production.
- DuckDB is used locally; no Postgres credentials needed.
