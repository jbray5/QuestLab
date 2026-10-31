"""Shared pytest fixtures for the QuestLab test suite.

Provides:
- ``duckdb_session`` — in-memory DuckDB session for repo and service tests.
- ``dev_env`` — sets environment variables to simulate local dev mode.
"""

import os

import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from db.base import _json_serializer

os.environ.setdefault("RATE_LIMIT", "off")  # Plan 77 — the throttle is exercised by its own tests
# Plan 86 — generative AI is off in the product; the suite opts in to keep the
# code paths covered, and tests the default separately.
os.environ.setdefault("AI_FEATURES", "on")


@pytest.fixture(scope="session")
def duckdb_engine():
    """Create an in-memory DuckDB engine with all tables for the test session.

    Wires in the same UUID-aware JSON serializer as production so JSON columns
    containing UUIDs (e.g. ``sessions.attending_pc_ids``) round-trip correctly
    in tests.

    Returns:
        SQLAlchemy Engine backed by an in-memory DuckDB database.
    """
    engine = create_engine(
        "duckdb:///:memory:",
        poolclass=StaticPool,
        json_serializer=_json_serializer,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture()
def duckdb_session(duckdb_engine):
    """Yield a test database session, rolling back after each test.

    Args:
        duckdb_engine: Session-scoped in-memory engine fixture.

    Yields:
        SQLModel Session for use in tests.
    """
    with Session(duckdb_engine) as session:
        yield session
        session.rollback()


@pytest.fixture(autouse=False)
def dev_env(monkeypatch):
    """Set environment variables to simulate local development mode.

    Args:
        monkeypatch: Pytest monkeypatch fixture.
    """
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("CURRENT_USER_EMAIL", "test@example.com")
    monkeypatch.setenv("AUTH_EMAIL_HEADER", "X-MS-CLIENT-PRINCIPAL-NAME")
    monkeypatch.setenv("DB_BACKEND", "duckdb")
    monkeypatch.setenv("DUCKDB_PATH", ":memory:")


@pytest.fixture()
def uuid_play_links(monkeypatch):
    """Let ``/play/{pc_uuid}`` open like a pre-token link (the SEC-002 grace period).

    Feature suites written before play tokens address players by UUID for
    brevity; the link rules themselves are covered by
    ``tests/test_api/test_sec002_play_links.py``.
    """
    from services import player_service

    monkeypatch.setattr(player_service, "_legacy_uuid_open", lambda pc: True)
