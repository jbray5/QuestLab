# ARCHITECTURE — QuestLab

Bird's-eye codemap for new contributors. The detailed layered diagram and design decisions live in [`docs/STACK.md`](docs/STACK.md), [`docs/SECURITY.md`](docs/SECURITY.md), and [`docs/react_migration.md`](docs/react_migration.md). The behavior contract for working in this repo is [`CLAUDE.md`](CLAUDE.md).

## What QuestLab is

AI-powered D&D 5e (2024) campaign planning + session execution tool for Dungeon Masters. Build campaigns → adventures → encounters → maps → run live sessions with initiative tracking, AI-generated runbooks, dialog, monster stat blocks, and loot.

## Two front-ends, one backend

- **Streamlit MVP** ([`main.py`](main.py) + [`pages/`](pages/)) — current production UI.
- **React + FastAPI** ([`frontend/`](frontend/) + [`api/`](api/)) — in-progress migration. See [`docs/react_migration.md`](docs/react_migration.md).

Both share the same `services/`, `db/repos/`, and `domain/`. The migration replaces only the transport/UI layers.

## Layers (the source of truth is [`CLAUDE.md`](CLAUDE.md))

```
   ┌─────────────┐    ┌─────────────┐
   │  pages/     │    │  api/       │     ← UI / transport. NO business logic.
   │  (Streamlit)│    │  (FastAPI)  │
   └──────┬──────┘    └──────┬──────┘
          │                  │
          └─────────┬────────┘
                    ▼
            ┌───────────────┐
            │  services/    │             ← business logic + authorization
            └───────┬───────┘
                    ▼
            ┌───────────────┐
            │  db/repos/    │             ← DB access only, no logic
            └───────┬───────┘
                    ▼
            ┌───────────────┐
            │  domain/      │             ← Pydantic + SQLModel definitions
            └───────────────┘
                    ▲
            ┌───────┴───────┐
            │ integrations/ │             ← Claude SDK, identity, 5e rules
            └───────────────┘
```

Import rules (enforced by the `boundary-checker` subagent and `.claude/rules/layers.md`):
- One-way: `pages|api → services → repos → domain`.
- `integrations/` is depended on by `services/` and `api/` only.
- Violations are bugs.

## File index

### Domain ([`domain/`](domain/))

| File | Aggregate |
|------|-----------|
| [`campaign.py`](domain/campaign.py) | `Campaign` |
| [`adventure.py`](domain/adventure.py) | `Adventure` |
| [`encounter.py`](domain/encounter.py) | `Encounter` |
| [`character.py`](domain/character.py) | `Character` (player + NPC) |
| [`monster.py`](domain/monster.py) | `MonsterStatBlock` |
| [`item.py`](domain/item.py) | `Item` (magic items) |
| [`map.py`](domain/map.py) | `Map` (world + dungeon) |
| [`session.py`](domain/session.py) | `Session` (live play) |
| [`enums.py`](domain/enums.py) | Shared enums (ChallengeRating, ItemRarity, ...) |

### Repos ([`db/repos/`](db/repos/))
One per aggregate above. Each exposes `get`, `list`, `create`, `update`, `delete` plus aggregate-specific queries.

### Services ([`services/`](services/))

| File | Responsibility |
|------|----------------|
| [`auth_service.py`](services/auth_service.py) | Admin/user role checks, identity-header validation |
| [`campaign_service.py`](services/campaign_service.py) | Campaign CRUD + ownership |
| [`adventure_service.py`](services/adventure_service.py) | Adventure tree + linking to campaigns |
| [`encounter_service.py`](services/encounter_service.py) | Encounter builder, monster roster, CR math |
| [`character_service.py`](services/character_service.py) | PCs and NPCs |
| [`item_service.py`](services/item_service.py) | Magic items compendium |
| [`map_service.py`](services/map_service.py) | World + dungeon maps |
| [`session_service.py`](services/session_service.py) | Live session state, initiative |
| [`ai_service.py`](services/ai_service.py) | Claude-driven runbook, dialog, stat block, loot generation |

### Integrations ([`integrations/`](integrations/))

| File | Purpose |
|------|---------|
| [`identity.py`](integrations/identity.py) | Parse the trusted Azure Front Door / Entra identity header |
| [`claude_client.py`](integrations/claude_client.py) | Thin wrapper around the `anthropic` SDK (Opus 4.6 + Haiku 4.5) |
| [`dnd_rules/encounter_math.py`](integrations/dnd_rules/encounter_math.py) | CR-to-XP, encounter difficulty curves |
| [`dnd_rules/stat_blocks.py`](integrations/dnd_rules/stat_blocks.py) | Stat block validation against 5e rules |
| [`dnd_rules/magic_items.py`](integrations/dnd_rules/magic_items.py) | Magic item reference data |

### Pages ([`pages/`](pages/))
Streamlit pages, one per aggregate. UI only — instantiates a service, calls methods, renders. No business logic.

### API ([`api/`](api/))
FastAPI app for the React migration. [`api/main.py`](api/main.py) mounts routers in [`api/routers/`](api/routers/) — one per aggregate plus [`uploads.py`](api/routers/uploads.py) for image uploads and [`admin.py`](api/routers/admin.py) for admin ops. [`api/deps.py`](api/deps.py) builds service instances per-request.

### DB ([`db/`](db/))
- [`db/base.py`](db/base.py) — engine factory. Switches between Postgres (prod) and DuckDB (local/test) via `DB_BACKEND` env var. Contains the FK-workaround for DuckDB.
- [`db/repos/`](db/repos/) — see above.

### Alembic ([`alembic/`](alembic/))
Postgres-only. 5 migrations as of 2026-03. `versions/` files are zero-padded `NNNN_` prefix.

### Tests ([`tests/`](tests/))
- [`tests/conftest.py`](tests/conftest.py) — root fixtures (DuckDB in-memory session, current_user, factories)
- [`tests/test_domain/`](tests/test_domain/) — Pydantic boundary tests, no DB
- [`tests/test_integrations/`](tests/test_integrations/) — identity, encounter math, db_base
- [`tests/test_repos/`](tests/test_repos/) — repo CRUD round-trips
- [`tests/test_services/`](tests/test_services/) — authz + business logic

### Frontend ([`frontend/`](frontend/))
React SPA. Zustand state, shadcn/ui, dark fantasy theme. See [`docs/react_migration.md`](docs/react_migration.md).

### Docs ([`docs/`](docs/))
[`STACK.md`](docs/STACK.md), [`SECURITY.md`](docs/SECURITY.md), [`TESTING.md`](docs/TESTING.md), [`QUALITY.md`](docs/QUALITY.md), [`data_dictionary.md`](docs/data_dictionary.md), [`deployment.md`](docs/deployment.md), [`react_migration.md`](docs/react_migration.md).

### Plans ([`plans/`](plans/))
ExecPlans, numbered `NNNNN-*.md`. Spec is [`.agent/plans.md`](.agent/plans.md). New plans → `/new-plan <desc>`.

### Claude Code config ([`.claude/`](.claude/))
Subagents, slash commands, hooks, rules. See [`.claude/README.md`](.claude/README.md). MCP servers in [`.mcp.json`](.mcp.json).

## Key invariants

1. **Postgres is the schema source of truth.** DuckDB is for local dev + tests only and gets its schema from SQLModel `create_all`. Alembic never targets DuckDB.
2. **No in-app auth.** Azure Front Door + Entra ID inject identity via a trusted HTTP header. Missing header = deny.
3. **Authorization lives in `services/`**, never in pages alone. Every public service method's first line is a role check.
4. **No SQL string concatenation.** ORM or `text()` with bound params. Pydantic-validate every external input.
5. **Two model tiers:** `claude-opus-4-6` for long-form generation, `claude-haiku-4-5-20251001` for short/fast calls (autocomplete). Don't swap silently.
6. **Layer imports are one-way.** `pages|api → services → repos → domain`. `integrations/` is a sibling to `services/`, never imported from `domain/`.
7. **ExecPlans for anything >20 min or >1 layer.** Living documents — Progress, Surprises, Decision Log updated every stop.

## Definition of Done

Every change is complete only when all of these pass (run `/quality-gate`):

- `pytest -q` — zero failures
- `black --check . && isort --check-only . && flake8` — zero errors
- `interrogate -c pyproject.toml` — ≥80% docstring coverage
- `pip-audit` — no known vulnerabilities
- Schema changes have an Alembic migration
- Docs updated to reflect structural changes
