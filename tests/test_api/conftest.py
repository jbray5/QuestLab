"""FastAPI TestClient scaffold for API-layer tests (Plan 41).

The entire api/ layer was at 0% coverage — the exact layer where the combat
authorization and behavior bugs lived. This wires a TestClient against an
isolated in-memory DuckDB (dependency-overriding get_db) and drives real HTTP
requests with the trusted identity header.

The TestClient is built WITHOUT the ``with`` context manager on purpose, so the
app lifespan (which would create_all + seed against the real configured engine)
never runs — tests use their own in-memory engine instead.
"""

import os

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine
from sqlmodel.pool import StaticPool

from api.deps import get_db
from api.main import app  # importing app runs load_dotenv()
from db.base import _json_serializer

# api.main.load_dotenv() may repopulate CURRENT_USER_EMAIL / AUTH_EMAIL_HEADER
# from the developer's .env. Pin them to known test values AFTER that import so
# identity resolves only from the header we set, and "no header → 401" is
# deterministic.
os.environ["AUTH_EMAIL_HEADER"] = "X-MS-CLIENT-PRINCIPAL-NAME"
os.environ.pop("CURRENT_USER_EMAIL", None)


@pytest.fixture()
def api_engine():
    """Isolated in-memory DuckDB engine with all tables, shared via StaticPool."""
    engine = create_engine(
        "duckdb:///:memory:",
        poolclass=StaticPool,
        json_serializer=_json_serializer,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture()
def client(api_engine):
    """TestClient bound to the isolated test engine (lifespan intentionally skipped)."""

    def _override_get_db():
        from sqlmodel import Session

        with Session(api_engine) as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.clear()
