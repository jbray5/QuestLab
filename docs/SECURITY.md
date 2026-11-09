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
- **Linking a Patreon account** (Plan 130, `services/auth_service.py`) never signs anyone in and can attach a Patreon account only to the DM who asked:
  1. `POST /api/me/patreon/link` needs a DM session. Its signed state names **that DM's email** and the intent `link` (kind `state`, 10 minutes). The scope is `identity identity.memberships`.
  2. The shared callback (`/api/auth/patreon/callback`) sees the link intent, exchanges the code, and refuses a Patreon id already linked to another account. It attaches nothing. It redirects to `/plan#patreon=<result>`, a separate signed token (kind `patreon_link`, 10 minutes) carrying the Patreon id, the membership read and the same email. No session token is issued.
  3. The plan page posts that result to `POST /api/me/patreon/confirm` with **its own session**. The server attaches it only when the session's email equals the email in the result (otherwise 403), and refuses again if the Patreon id was linked elsewhere in the meantime (409).
  - Step 3 closes the classic link-CSRF hole: if someone tricks a victim into finishing a link the attacker started, the victim's browser holds the victim's session, so the result is refused. The victim's Patreon never lands on the attacker's account (which would also let a later "Sign in with Patreon" open the attacker's account for the victim).
  - Kinds don't cross: a `state` or `patreon_link` token is never accepted as a session, and a session is never accepted as either.
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
| `/play/{key}/**` (and `/stream/pc/{key}`, duels) | the PC's `play_token` — resolved once by `api.deps.play_pc_id`; a PC made before tokens also opens by UUID until 2026-12-01; the DM's **Reset link** replaces the token and ends the UUID grace at once; an old link answers 410 with the campaign id so the phone can offer the join page | that PC's sheet (**never the DM's `notes` field**, Plan 122), spells, gear, features, its turn kit; the party roster (names + PC ids — ids are identities, not keys); the running fight's order (names, initiative, side); **revealed** NPCs only (name, role, race, appearance, location, status, portrait — never secret/motivation/hooks/notes); every class and subclass feature at its level (`/class-features`, Plan 128) | that PC's HP, temp HP, slots, death saves, coin/inspiration/concentration/exhaustion and the player's own name (allowlisted fields; `player_name` 1–100 characters, Plan 128), its own feature uses (`?amount=` 1–100 for pools like Lay on Hands), rolls to the table (labeled, advantage, typed-in real dice), casting its own prepared spells (spends its own slot), preparing spells within its class cap, its `player_notes` (kept off the DM's screens, but anyone holding the link can read them; the phone and Terms say so), gear, buy/sell/give, level-up **only after the DM grants it**, arena/duels (seat-checked), feedback to the QuestLab team (Plan 128: filed as `player:<pc id>`, the character's identity and never its key; the page address it sends has the key taken out) |
| `/join/{campaign_id}` | campaign UUID (+ join code if set; compared in constant time; roster reads throttled 60/min/IP) | the roster, with a character's link key **only until a player has it** (Plan 139): a claimed row comes with `key: null`, so the list can't open another player's phone, and a DM's Reset link doesn't reopen it | create a PC while sign-up is on (the creator's rules; the DM's own Add character uses `/api/campaigns/{id}/character-builder`, campaign owner only, no code or switch — Plan 126) |
| `/table/{session_id}` (TV/projector) | session UUID | the projected board, tokens, initiative names, PC HP, each PC's class and picture (filled in when the projection is built, never stored; foes carry neither — Plan 128) | its own PC token moves (via `/play`) |
| `/market/{campaign_id}`, `/shop/{shop_id}`, `/puzzle/{id}` | UUID | visible shops / answer-free puzzle | purchases (via `/play`) |
| `/stream/**` (SSE) | UUID of the topic | event ids/types only — no DM content | — |

**Side quests (Plan 136).** `/play/{key}/side-quests/**` only ever returns that character's runs (another character's is a 404) and only the current step, without its DC or links (`side_quest_service._view`). A move with a stale `step_id` changes nothing, and a run moves by compare-and-swap, so a reward can't be paid twice. Rolls don't broadcast. A player's replies go to the DM and are also readable by anyone with that player's link, like their notes, and the phone says so. Quest text is plain text, never rendered as HTML; a picture must be an upload or an https link. The optional Discord ping goes to a shared channel, so the Quest creator warns against naming a private quest.

**Side quest recaps (Plan 138).** After finishing a quest, a player may share a recap (`PUT /play/{key}/side-quests/{run_id}/recap`). It's the one thing about a run that reaches other phones, and only because its player wrote it (but see Plan 140 below). `GET /play/{key}/side-quests/recaps` is limited to the link's own campaign and returns `PartyRecap`: the character's name, the words and the time. It never includes the quest's title, any id, or the log. Only the run's own character can write it, and it renders as plain text.

**Who picked what (Plan 140).** Off unless the DM ticks "Show the party who picked what" on a choice step (`QuestStep.party_sees`, per step, so a moral choice later in the same quest stays private). When it's on, that step's `QuestOptionView.taken_by` lists the character names of others on the same quest who picked that option, and the phone says "Your party will see which one you pick" before the pick. Only picks made while it was on count (`party` in the log entry), so switching it on later reveals nothing old, and switching it off hides everything. Names and option numbers cross between runs, nothing else: no replies, rolls, later steps or where a pick led.

**Keeping private things private (Plan 139).** A reply's words are DM-only. `QuestHistoryItem` carries `replied`, never the text, so no `/play` response returns them; the phone that wrote them keeps its own copy (`ql-quest-sent:*` in localStorage). A character is claimed when a phone gets past its first-open screen (`POST /play/{key}/claim`, skipped for `?peek=1`, which the DM's Open button adds) or when it's built on the join page. Migration 0067 claimed existing characters with a real player name. This adds no login, PIN or code: the link is still the only credential, and a player who loses theirs asks the DM, whose link button has it. `POST /characters/{id}/play-link/release` (campaign owner only) reopens the list. **What's left:** a link that gets shared opens the character for whoever has it; anyone with the join link can open a character nobody has claimed yet, including a quest sent to it before its player has opened it; a PC made before tokens opens by UUID until 2026-12-01 (TD-139a).

Never on a player surface: hidden NPCs, NPC secrets/KNOWS/WANT/VOICE, beat cards, session or campaign notes, `world_notes`.

The Terms page (`/terms#players`, Plan 128) tells players the same things in plain words. It covers what a link carries (the character, the player's name and the notes), that anyone with the link or the join code can see them, what is kept and for how long, players under 16 (no account, age or email is ever asked for), and how to get in touch (Send feedback).

### Findings (tracked in `docs/QUALITY.md`)
1. ~~**High — one link controls the party.**~~ Fixed 2026-10-31 (SEC-002): per-PC `play_token` links, a DM "Reset link", UUID links only through the grace period, tokens never in player payloads (migration 0057; `tests/test_api/test_sec002_play_links.py`).
2. ~~**High — shared catalogs.**~~ Fixed 2026-10-31 (SEC-003): items and spells record their author (`created_by_email`, migration 0056); shared rows are admin-only to change, homebrew only by its author or an admin; lists show the shared catalog plus the viewer's own homebrew (`tests/test_api/test_sec003_catalog.py`).
3. ~~**High — uploads.**~~ Fixed 2026-10-31 (SEC-004): the type comes from the bytes (`services/upload_service.py`), the stored extension from the detected type; `/uploads/` serves only media extensions with `nosniff` and a sandbox CSP; every response is `nosniff` (`tests/test_api/test_sec004_uploads.py`). Since Plan 128, portraits and notebook pastes (`POST /api/uploads`) go to Vercel Blob under `portraits/` when `BLOB_READ_WRITE_TOKEN` is set, as maps and figures already did (`_store` in `api/routers/uploads.py`). The type check is unchanged. Blob files of a deleted campaign stay in storage until an orphan sweep exists; the Terms say so, and the sweep is tracked in QUALITY.md.
4. **Medium** — still open: fog of war is client-side (fogged monsters are in the projection — the private TV board only); `/stream/campaign/{id}` is unauthenticated (it carries event types and PC ids, which are no longer keys). Fixed 2026-10-31: session attendance and tracker character ids must belong to the campaign; the crier posts only to `https://` Discord webhook hosts (create and update); inventory notes and row reads check the owner (`tests/test_services/test_sec005_hardening.py`).
5. ~~**Low**~~ — fixed: `GET /play` never returns the DM's `notes` (Plan 122); a feature spend needs the feature row to be the PC's; hot-seat duels and boss fights take characters from one campaign. By design: a hidden shop sells through its direct link (sharing the link is how the DM reveals it).

## Authorization
- Authorization checks live in `services/` — never in the UI alone.
- **No generative AI** (Plan 124): no model client or API key exists, so no DM content leaves for a model. The PHB personal-content gate (`personal_content_allowed`) lives in `services/auth_service.py`.
- **Friends beta** (Plan 125, `services/beta_service.py`): with `BETA_INVITES=required` (the default) a NEW DM account, by password or a first Discord/Patreon sign-in, needs a valid invite; the code rides through OAuth in the signed state. Existing accounts and admins are never asked; players never have accounts. Invites have a use limit and can be revoked; a use is spent only once the account really starts. Codes avoid look-alike characters and are compared case-insensitively. `GET /api/auth/invites/{code}` (public) says only whether a code works and its label. The admin's waitlist "Invite by email" (Plan 128) makes a single-use invite labelled with the person's email and opens a `mailto:` draft; the server sends no mail. Because the label is the email, the public code check shows that email to whoever holds the code. Feedback (`POST /api/feedback`) needs a signed-in DM. Players send theirs through their own link (`POST /api/play/{key}/feedback`, Plan 128), and only the per-IP writes throttle limits it. The inbox, invites and the DM list are admin-only. The optional `FEEDBACK_WEBHOOK_URL` ping is best effort and never carries more than the note, the page and the screen size.

- **Pricing** (Plan 130, `services/plan_service.py`): the plan is decided server-side from `BOOTSTRAP_ADMIN_EMAILS`, `users.patron_comped` (set only through the admin-only `POST /api/admin/users/{email}/comp`) and the stored Patreon membership snapshot (written only by a Patreon sign-in or a confirmed link, never by the client). The caps (`PRICING=on`) are checked in the services before a campaign or upload is stored, and the refusal is a 402. A cap never deletes, hides or locks existing content. Players' surfaces never touch plans. The uploads ledger stores each upload's owner, URL, size and kind; the plan page shows a DM only their own totals.

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
- On DuckDB, `play_token` has no index, so it has no uniqueness check either: `db.base.relax_duckdb_indexes` drops `ix_player_characters_play_token` so that Reset link works (Plan 128). Tokens are 128 random bits, and Postgres keeps the unique index from migration 0057.
