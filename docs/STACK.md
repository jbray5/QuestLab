# QuestLab — Technology Stack

## Language and Runtime
- **Python 3.11+** — primary language. All business logic, data models, and server-side code.
- **Streamlit 1.37+** — MVP UI framework. Multi-page via `pages/` directory. Chosen for rapid iteration; React migration planned for post-MVP.

## Data Layer
| Concern | Technology | Rationale |
|---|---|---|
| ORM | SQLModel 0.0.19+ | Single class serves as both SQLAlchemy table and Pydantic model. Eliminates duplication vs. raw SQLAlchemy 2.x. |
| Migrations | Alembic 1.13+ | Industry standard. Postgres is the schema source of truth. DuckDB never an Alembic target. |
| Prod DB | Azure Postgres Flexible Server | Managed, HA, PG15+, VNET-integrated. |
| Dev/Test DB | DuckDB (in-memory or file) | Zero-config local setup. Tests run without Postgres. Never promoted to prod. |
| Validation | Pydantic v2 | All domain models and external data boundaries validated. v2 for performance and strict mode. |

## AI Integration
- **Anthropic Claude API** (`anthropic` SDK 0.28+) — session runbook generation, NPC dialog, loot tables, encounter flavor text. Claude chosen for superior long-form narrative generation.
- Model: `claude-opus-4-6` for generation tasks, `claude-haiku-4-5-20251001` for fast autocomplete tasks.

## Code Quality
| Tool | Config | Enforcement |
|---|---|---|
| black | line-length=100 | CI + pre-commit |
| isort | profile=black, line-length=100 | CI + pre-commit |
| flake8 | max-line-length=100 | CI + pre-commit |
| interrogate | fail-under=80 | CI + pre-commit |
| pip-audit | requirements.txt | CI + pre-commit |
| pytest | testpaths=tests | CI |

## Auth
- No in-app auth. Azure Front Door + Entra ID inject identity via HTTP header.
- See `docs/SECURITY.md` for full model.

## Future: React Migration
- Post-MVP the Streamlit front-end will be replaced with a React SPA.
- Backend will expose a FastAPI REST API.
- State management: Zustand. Component library: shadcn/ui with custom dark fantasy tokens.
- See `docs/react_migration.md` (created in Stage 10).

## Decision Log
| Decision | Options | Chosen | Reason |
|---|---|---|---|
| ORM | SQLModel vs SQLAlchemy 2.x | SQLModel | Pydantic integration, less boilerplate |
| AI | OpenAI / Anthropic | Anthropic | User requirement; better long-form narrative |
| UI (MVP) | Streamlit / FastAPI+React | Streamlit | Fastest path to working MVP |
| Test DB | Postgres / DuckDB / SQLite | DuckDB | Fast, zero-config, SQL-compatible |
