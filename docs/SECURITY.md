# QuestLab — Security Model

## Authentication
QuestLab has **no in-app authentication**. Identity is handled externally by Azure Front Door + Microsoft Entra ID (formerly Azure AD). After authentication, Azure Front Door injects the verified user's email address into a trusted HTTP header before forwarding the request to the app.

The header name is configured via the `AUTH_EMAIL_HEADER` environment variable (default: `X-MS-CLIENT-PRINCIPAL-NAME`).

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
