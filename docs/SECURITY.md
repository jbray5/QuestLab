# QuestLab — Security Model

## Authentication

QuestLab runs in one of two identity modes, chosen by `AUTH_MODE` (Plan 73):

### `oauth` — public deployments (the Reddit launch)
- DMs sign in with **Discord** or **Patreon** (`/api/auth/{provider}/start` → provider consent → `/api/auth/{provider}/callback`).
- The API issues an **HMAC-SHA256 signed session token** (`integrations/session_token.py`, secret `APP_SECRET`, 30-day expiry, constant-time verify, fail-closed). The frontend keeps it in `localStorage` and sends `Authorization: Bearer …`.
- In this mode the client-supplied email header is **ignored** — a browser can never assert an identity it does not hold. An expired/invalid bearer → 401.
- A `users` row (email-keyed) records linked provider ids and the Patreon membership snapshot. **Email remains the ownership key** for every table (`campaign.dm_email`), so nothing downstream changed.
- OAuth CSRF is a signed `state` token (kind `state`, 10-minute TTL) bound to the provider.

### Email + password accounts (both modes)
- `POST /api/auth/signup` (name, email, password) and `POST /api/auth/login` issue the same signed session tokens. Passwords are hashed with **scrypt** (N=2^15, r=8, p=1, per-user 16-byte salt, constant-time verify; `integrations/passwords.py`); only the hash is stored. Enabled whenever `APP_SECRET` is set. Login failures return one generic message (no account enumeration).

### `header` — personal / Azure deployments (default)
- Identity comes from the trusted header named by `AUTH_EMAIL_HEADER` (injected by Azure Front Door + Entra ID at the edge) or `CURRENT_USER_EMAIL` locally.
- A valid bearer token is also accepted in this mode, so a personal deployment can try OAuth before flipping.
- **This mode must never face the public internet without an authenticating edge in front of it** — the header is trusted as-is.

### Players
Player surfaces (`/play/{pc_id}`, `/table/{session_id}`, `/join/{campaign_id}`, `/market/…`) are **capability URLs**: the UUID is the secret, shown only to the people at the table. They expose player-safe projections only (no DM notes, no hidden shops, no stat internals beyond the player's own sheet).

### Authorization
- Every service method checks campaign ownership by email before acting; admins are the `BOOTSTRAP_ADMIN_EMAILS` allowlist (`services/auth_service.require_admin`).
- **AI entitlement** (`services/entitlement_service.py`): `AI_GATE=patreon` restricts generation to active patrons, admins and `AI_FREE_EMAILS`; every AI route depends on `AiUser` (402 with a Patreon link when gated, 429 when the daily allowance `AI_DAILY_LIMIT` is spent). Player-facing AI (the forge) is charged to and gated on the campaign owner. Usage is counted per user per UTC day in `ai_usage`.

## Identity Resolution (integrations/identity.py)
1. Read the header named by `AUTH_EMAIL_HEADER` from `st.context.headers`.
2. If the header is present → use it as the authenticated email (lowercase, stripped).
3. If the header is **absent**:
   - In `ENV=development` → fall back to `CURRENT_USER_EMAIL` env var.
   - In `ENV=production` → raise `PermissionError` (deny access). **Fail-closed.**
4. `CURRENT_USER_EMAIL` is **never** set in production deployments.

## Authorization
- App enforces **admin vs. user** roles only. No finer-grained RBAC in MVP.
- `BOOTSTRAP_ADMIN_EMAILS` seeds the admins table on first run.
- Authorization checks live in `services/` — never in `pages/` alone.
- A DM can only view/edit their own campaigns, adventures, and characters.
- Admin-only operations: user management, data export, monster seeding.

## Data Security Rules
| Rule | Enforcement |
|---|---|
| No SQL string concatenation | SQLModel `select()` only; `text()` with bound params if needed |
| All user input validated | Pydantic v2 at all form boundaries before DB write |
| No secrets logged or printed | Code review + CI scan |
| Exports admin-only | Enforced in `services/`, not just UI |
| No anonymous/guest mode | Fail-closed if identity missing |

## Environment Variables
- `.env` is never committed. `.env.example` is committed with placeholder values.
- `ANTHROPIC_API_KEY` is a secret — injected via Azure Key Vault reference in production.
- `PGPASSWORD` injected via managed identity or Key Vault in production.

## Dependency Scanning
- `pip-audit` runs on every CI build and pre-commit.
- Vulnerabilities must be resolved before merge.

## Network
- App runs behind Azure Front Door (WAF, DDoS, TLS termination).
- Postgres connection requires SSL (`PGSSLMODE=require`).
- No direct public DB access.

## Local Development
- `ENV=development` enables the `CURRENT_USER_EMAIL` fallback.
- Never run with `ENV=development` in production.
- DuckDB is used locally; no Postgres credentials needed for local dev.
