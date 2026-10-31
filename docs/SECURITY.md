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

Players never sign in: their surfaces are **capability URLs** — the secret in the link is the credential. A player's own link carries an unguessable per-PC `play_token` (SEC-002), not the character's UUID; every other UUID that shows up in a player payload is an identity, not a key.

| Surface | Credential | Can read | Can write |
|---|---|---|---|
| DM app `/api/campaigns/**`, sessions, NPCs, encounters, maps, shops, notebooks, exports | DM session (oauth) | only that DM's campaigns — every service checks `campaign.dm_email` through the child's own parent | same |
| `/api/admin/**` | DM session + `BOOTSTRAP_ADMIN_EMAILS` | admin tools; export is the admin's own campaigns | monster reseed |
| `/play/{key}/**` (and `/stream/pc/{key}`, duels) | the PC's `play_token` — resolved once by `api.deps.play_pc_id`; a PC made before tokens also opens by UUID until 2026-12-01; the DM's **Reset link** replaces the token and ends the UUID grace at once; an old link answers 410 with the campaign id so the phone can offer the join page | that PC's sheet (**never the DM's `notes` field**, Plan 122), spells, gear, features, its turn kit; the party roster (names + PC ids — ids are identities, not keys); the running fight's order (names, initiative, side); **revealed** NPCs only (name, role, race, appearance, location, status, portrait — never secret/motivation/hooks/notes) | that PC's HP, temp HP, slots, death saves, coin/inspiration/concentration/exhaustion (allowlisted fields), rolls to the table (labeled, advantage, typed-in real dice), casting its own prepared spells (spends its own slot), preparing spells within its class cap, its private `player_notes`, gear, buy/sell/give, level-up **only after the DM grants it**, arena/duels (seat-checked) |
| `/join/{campaign_id}` | campaign UUID (+ join code if set; compared in constant time; roster reads throttled 60/min/IP) | the roster, **including each character's link key** — the join link is the party's door, so a DM who resets a departed player's link should also change the join code | create a PC while sign-up is on |
| `/table/{session_id}` (TV/projector) | session UUID | the projected board, tokens, initiative names, PC HP | its own PC token moves (via `/play`) |
| `/market/{campaign_id}`, `/shop/{shop_id}`, `/puzzle/{id}` | UUID | visible shops / answer-free puzzle | purchases (via `/play`) |
| `/stream/**` (SSE) | UUID of the topic | event ids/types only — no DM content | — |

Never on a player surface: hidden NPCs, NPC secrets/KNOWS/WANT/VOICE, beat cards, session or campaign notes, `world_notes`.

### Findings (tracked in `docs/QUALITY.md`)
1. ~~**High — one link controls the party.**~~ Fixed 2026-10-31 (SEC-002): per-PC `play_token` links, a DM "Reset link", UUID links only through the grace period, tokens never in player payloads (migration 0057; `tests/test_api/test_sec002_play_links.py`).
2. ~~**High — shared catalogs.**~~ Fixed 2026-10-31 (SEC-003): items and spells record their author (`created_by_email`, migration 0056); shared rows are admin-only to change, homebrew only by its author or an admin; lists show the shared catalog plus the viewer's own homebrew (`tests/test_api/test_sec003_catalog.py`).
3. ~~**High — uploads.**~~ Fixed 2026-10-31 (SEC-004): the type comes from the bytes (`services/upload_service.py`), the stored extension from the detected type; `/uploads/` serves only media extensions with `nosniff` and a sandbox CSP; every response is `nosniff` (`tests/test_api/test_sec004_uploads.py`).
4. **Medium** — still open: fog of war is client-side (fogged monsters are in the projection — the private TV board only); `/stream/campaign/{id}` is unauthenticated (it carries event types and PC ids, which are no longer keys). Fixed 2026-10-31: session attendance and tracker character ids must belong to the campaign; the crier posts only to `https://` Discord webhook hosts (create and update); inventory notes and row reads check the owner (`tests/test_services/test_sec005_hardening.py`).
5. ~~**Low**~~ — fixed: `GET /play` never returns the DM's `notes` (Plan 122); a feature spend needs the feature row to be the PC's; hot-seat duels and boss fights take characters from one campaign. By design: a hidden shop sells through its direct link (sharing the link is how the DM reveals it).

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
