"""Shared pytest fixtures for the QuestLab test suite.

Provides:
- ``duckdb_session`` — in-memory DuckDB session for repo and service tests.
- ``dev_env`` — sets environment variables to simulate local dev mode.
"""

import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool


@pytest.fixture(scope="session")
def duckdb_engine():
    """Create an in-memory DuckDB engine with all tables for the test session.

    Returns:
        SQLAlchemy Engine backed by an in-memory DuckDB database.
    """
    engine = create_engine(
        "duckdb:///:memory:",
        poolclass=StaticPool,
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
