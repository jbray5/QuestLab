"""Database engine and session factory.

Reads ``DB_BACKEND`` from the environment to select Postgres (production) or
DuckDB (local dev / tests).  The engine is a module-level singleton — import
``get_session`` to obtain a managed database session.

Usage::

    from db.base import get_session

    with get_session() as session:
        results = session.exec(select(Campaign)).all()
"""

import os
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

_engine = None


def _build_connection_string() -> str:
    """Construct the DB connection string from environment variables.

    Returns:
        SQLAlchemy-compatible connection string.

    Raises:
        ValueError: If DB_BACKEND is unrecognised.
    """
    backend = os.environ.get("DB_BACKEND", "postgres").lower()

    if backend == "postgres":
        host = os.environ.get("PGHOST", "localhost")
        port = os.environ.get("PGPORT", "5432")
        dbname = os.environ.get("PGDATABASE", "questlab")
        user = os.environ.get("PGUSER", "questlab")
        password = os.environ.get("PGPASSWORD", "")
        sslmode = os.environ.get("PGSSLMODE", "require")
        return (
            f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{dbname}" f"?sslmode={sslmode}"
        )

    if backend == "duckdb":
        path = os.environ.get("DUCKDB_PATH", "./data/app.duckdb")
        return f"duckdb:///{path}"

    raise ValueError(f"Unknown DB_BACKEND: {backend!r}. Must be 'postgres' or 'duckdb'.")


def get_engine():
    """Return the module-level database engine singleton.

    Creates the engine on first call using environment configuration.

    Returns:
        SQLAlchemy Engine instance.
    """
    global _engine
    if _engine is None:
        connection_string = _build_connection_string()
        _engine = create_engine(connection_string, echo=False)
    return _engine


def create_db_and_tables() -> None:
    """Create all SQLModel tables in the database.

    Used for test setup with in-memory or DuckDB databases.  In production,
    Alembic migrations are the authoritative schema source.
    """
    SQLModel.metadata.create_all(get_engine())


def get_session() -> Generator[Session, None, None]:
    """Yield a managed database session.

    Intended for use as a context manager::

        with get_session() as session:
            ...

    Yields:
        Active SQLModel Session bound to the engine.
    """
    with Session(get_engine()) as session:
        yield session
