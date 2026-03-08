# QuestLab — Testing Strategy

## Framework
- **pytest 8.0+** with `--tb=short`
- All tests in `tests/` directory, mirroring source structure.

## Test Database
- Tests use **DuckDB in-memory** via the `duckdb_session` fixture in `conftest.py`.
- Never require a live Postgres connection in CI.
- `SQLModel.metadata.create_all(engine)` creates schema from models at test start.

## Test Layout
```
tests/
  conftest.py              — shared fixtures (duckdb_session, dev_env)
  test_domain/             — Pydantic model validation (field constraints, computed props)
  test_services/           — business logic, authz enforcement (mocked repos)
  test_repos/              — DB query correctness (duckdb_session fixture)
  test_integrations/       — identity parsing, encounter math, Claude client (mocked)
```

## Fixture Reference
| Fixture | Scope | Purpose |
|---|---|---|
| `duckdb_engine` | session | In-memory DuckDB engine with all tables |
| `duckdb_session` | function | Managed session, rolls back after each test |
| `dev_env` | function | Sets ENV=development, CURRENT_USER_EMAIL for identity tests |

## Required Test Cases (by stage)
### Stage 1
- `test_identity.py` — header extraction, dev fallback, fail-closed in prod
- `test_db_base.py` — connection string construction, unknown backend error

### Stage 2
- `test_domain/` — all model field validators, enum values, computed fields (proficiency bonus, spell slots)

### Stage 3
- `test_repos/` — CRUD for each repo (create, get, list, update, delete)

### Stage 6
- `test_integrations/test_encounter_math.py` — known CR/party-size/difficulty combinations

### Stage 7
- `test_services/test_ai_service.py` — mocked Claude client; verify prompt structure, output parsing

## Running Tests
```bash
pytest -q                        # all tests
pytest tests/test_integrations/  # specific module
pytest -k "test_identity"        # by name pattern
pytest --cov=. --cov-report=term # with coverage
```

## Coverage Target
80% line coverage enforced via CI. Coverage report generated on every run.
