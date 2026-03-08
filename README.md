# QuestLab ⚔️

**AI-powered D&D 5e (2024) campaign planning and session execution tool for Dungeon Masters.**

Build campaigns, adventures, encounters, and maps. Generate AI-authored session runbooks with quotable dialog,
encounter flows, monster stat blocks, and loot tables. Run live sessions with initiative tracking and a real-time companion view.

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Git

### Setup

```bash
# 1. Clone and enter repo
git clone <repo-url>
cd questlab

# 2. Create virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and CURRENT_USER_EMAIL at minimum

# 5. Run the app
streamlit run main.py
```

The app will open at `http://localhost:8501`.

### Local dev uses DuckDB by default
Set `DB_BACKEND=duckdb` in `.env` — no Postgres needed locally.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_BACKEND` | No | `postgres` | `postgres` or `duckdb` |
| `PGHOST` | If Postgres | `localhost` | Postgres host |
| `PGPORT` | If Postgres | `5432` | Postgres port |
| `PGDATABASE` | If Postgres | `questlab` | Database name |
| `PGUSER` | If Postgres | `questlab` | DB user |
| `PGPASSWORD` | If Postgres | — | DB password |
| `PGSSLMODE` | If Postgres | `require` | SSL mode |
| `DUCKDB_PATH` | If DuckDB | `./data/app.duckdb` | DuckDB file path |
| `AUTH_EMAIL_HEADER` | No | `X-MS-CLIENT-PRINCIPAL-NAME` | Identity header (prod) |
| `CURRENT_USER_EMAIL` | Dev only | — | Dev identity fallback |
| `BOOTSTRAP_ADMIN_EMAILS` | No | — | Seed admins on first run |
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key |
| `LOG_LEVEL` | No | `INFO` | Logging verbosity |
| `ENV` | No | `production` | `development` enables dev fallbacks |

**Never commit `.env`.** Commit `.env.example` only.

---

## Commands

```bash
# Run app
streamlit run main.py

# Quality gates (all must pass before merge)
black . && isort . && flake8 && interrogate -c pyproject.toml && pip-audit && pytest -q

# Database migrations (Postgres only)
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic current

# Install pre-commit hooks (one-time)
pre-commit install
```

---

## Project Structure

```
questlab/
├── main.py                  # Streamlit entry point + nav
├── pages/                   # UI pages (no business logic)
├── services/                # Business logic + authz
├── domain/                  # Pydantic/SQLModel models
├── db/
│   ├── base.py              # Engine + session factory
│   └── repos/               # DB access only
├── integrations/
│   ├── identity.py          # Auth header parsing
│   ├── claude_client.py     # Anthropic SDK wrapper
│   └── dnd_rules/           # 5e 2024 rules engine
├── static/styles/main.css   # Dark fantasy theme
├── tests/                   # pytest test suite
├── alembic/                 # DB migrations
├── docs/                    # Documentation
└── plans/                   # ExecPlans
```

---

## Documentation
- [Stack Decisions](docs/STACK.md)
- [Security Model](docs/SECURITY.md)
- [Testing Strategy](docs/TESTING.md)
- [Quality Gates](docs/QUALITY.md)

---

## Build Plan
Implementation follows [Plan 00001](plans/00001-questlab-app-build.md) — 10 stages from scaffold to feature-complete.
