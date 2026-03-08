CLAUDE.md — Skills Matrix
Read this file before doing anything else. It is the source of truth for how to work in this repo. However, it can be overwritten at my command in the chat. The product brief, if defined, is in PROJECT_BRIEF.md.

Stack (Non-Negotiable)
Language: Python 3.11+ (venv with requirements.txt) for as much as possible. Javascript/HTML/React
UI: Start with Streamlit using pages/ for multi-page navigation for MVP. Then we will move to React.
Validation: Pydantic v2 at all external data boundaries
ORM: Preference of SQLModel or SQLAlchemy 2.x (decide based on best fit for project)
Migrations: Alembic (postgres is schema source of truth)
Primary DB: Azure Postgres Flexible Server (prod)
Local DB: DuckDB — optional, local/tests only, never Alembic target
Formatting: black (line-length 100), isort (profile=black)
Linting: flake8 (max-line-length 100)
Docstrings: interrogate (enforced, 80% minimum)
Security scanning: pip-audit
Testing: pytest
Versioning: GitHub (standard commit template; prefer cli git commands)
CI/CD: GitHub Actions (github workflow file)
Document all stack decisions and rationale in docs/STACK.md when you create it.

Architecture Boundaries (Non-Negotiable)
pages/        → UI only. No business logic. No direct DB access.
services/     → All business logic and authorization enforcement.
domain/       → Pydantic models and enums. No DB. No services.
db/repos/     → DB access only. No business logic.
integrations/ → Identity header parsing and external adapters.
Any import that violates these boundaries is a bug. Enforce this in code reviews and tests.

Auth Model
No in-app authentication. Azure Front Door + Entra ID handle auth externally.
Identity is injected via a trusted HTTP header (configured by AUTH_EMAIL_HEADER env var).
App performs authorization only (admin vs. user roles).
Fail-closed: if identity header is missing, deny access. No anonymous/guest mode in prod.
Local dev fallback: CURRENT_USER_EMAIL env var (documented, never used in prod).
Security Rules
No SQL string concatenation — ever. SQLAlchemy ORM or text() with bound params only.
Validate all user inputs (forms, CSVs, URL params) with Pydantic before any action.
Authorization enforced in services/, not in pages alone.
Never log or print secrets.
Exports are admin-only, enforced service-side.
Secure by default (fail closed)
Required Environment Variables
DB_BACKEND              postgres | duckdb (default: postgres)
PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD / PGSSLMODE
DUCKDB_PATH             ./data/app.duckdb (if using duckdb)
AUTH_EMAIL_HEADER       trusted header name (default: X-MS-CLIENT-PRINCIPAL-NAME)
CURRENT_USER_EMAIL      local dev only fallback
BOOTSTRAP_ADMIN_EMAILS  comma-separated; seeds admins table on first run if empty
LOG_LEVEL               INFO (default)
Commit .env.example with all of these. Never commit .env.

Commands (keep these working at all times)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
streamlit run main.py
black . && isort . && flake8 && interrogate -c pyproject.toml && pip-audit && pytest -q
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic current
What You Can Do Without Asking
Read files, run tests, run linters, run alembic current
Create or modify files within the defined repo structure
Write and apply Alembic migrations targeting Postgres
What Requires Human Approval
git push or opening a PR
Adding new packages to requirements.txt
Deleting files or dropping DB columns/tables
Changes to .env.example variable names
Definition of Done
Every task is complete only when all of the following pass: - [ ] pytest -q — zero failures - [ ] black . && isort . && flake8 && interrogate -c pyproject.toml — zero errors - [ ] pip-audit — no known vulnerabilities - [ ] Schema changes have an Alembic migration - [ ] Docs updated to reflect any structural changes

ExecPlans
For any task spanning more than one layer or estimated >20 minutes, write an ExecPlan first. Spec and template: .agent/PLANS.md Plans live in: plans/NNNNN-description.md

Documentation
On first scaffold, create and populate: - docs/STACK.md — technology decisions and rationale - docs/SECURITY.md — full security and auth model - docs/TESTING.md — testing strategy, fixtures, required test cases - docs/QUALITY.md — quality gate status and tech debt register - README.md — local setup, env vars, commands, links to all docs above - .pre-commit-config.yaml - standard github hooks + black/isort/flake8/interrogate/pip-audit

The following should be generated and updated as part of follow-up plans once app content exists - docs/architecture.md — detailed layered diagram, auth flow, design decisions - docs/data_dictionary.md — schema, columns, constraints, enums, PII fields - docs/deployment.md — Azure deployment runbook, env vars, Alembic runbook - ARCHITECTURE.md (root) — bird's-eye codemap, key invariants, file index

Important: - Documentation should be a runbook for a new engineer - Must be updated continually to match current code state and deployment - Treat documentation as a first-class citizen