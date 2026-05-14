"""Database engine and session factory.

Reads ``DB_BACKEND`` from the environment to select Postgres (production) or
DuckDB (local dev / tests).  The engine is a module-level singleton — import
``get_session`` to obtain a managed database session.

Usage::

    from db.base import get_session

    with get_session() as session:
        results = session.exec(select(Campaign)).all()
"""

import json
import os
import uuid
from collections.abc import Generator
from datetime import date, datetime

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine


def _json_serializer(obj: object) -> str:
    """JSON serializer that handles UUID, datetime, and date objects.

    Used as the ``json_serializer`` for the SQLAlchemy engine so that JSON
    columns containing UUIDs (e.g. ``attending_pc_ids``) are stored correctly
    in DuckDB (and Postgres).
    """

    def _default(o: object) -> object:
        if isinstance(o, uuid.UUID):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        if isinstance(o, date):
            return o.isoformat()
        raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")

    return json.dumps(obj, default=_default)


import domain  # noqa: E305, E402, F401 — registers all SQLModel table classes with metadata

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
        _engine = create_engine(connection_string, echo=False, json_serializer=_json_serializer)
    return _engine


def create_db_and_tables() -> None:
    """Create all SQLModel tables in the database.

    Used for test setup with in-memory or DuckDB databases.  In production,
    Alembic migrations are the authoritative schema source.
    """
    SQLModel.metadata.create_all(get_engine())


def patch_duckdb_schema() -> None:
    """Apply additive schema changes to an existing DuckDB database.

    Runs ``ALTER TABLE … ADD COLUMN IF NOT EXISTS`` for every column that was
    added after the initial ``create_all``.  Safe to call on every startup —
    DuckDB accepts ``IF NOT EXISTS`` so it is a no-op when the column already
    exists.  Only executes when ``DB_BACKEND=duckdb``.
    """
    if os.environ.get("DB_BACKEND", "postgres").lower() != "duckdb":
        return
    engine = get_engine()
    patches = [
        # 0002 — map scale
        "ALTER TABLE maps ADD COLUMN IF NOT EXISTS scale VARCHAR(20) DEFAULT 'DUNGEON'",
        "UPDATE maps SET scale = 'DUNGEON' WHERE scale = 'Dungeon'",
        # 0003 — dungeon builder fields
        "ALTER TABLE map_nodes ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 200",
        "ALTER TABLE map_nodes ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 120",
        "ALTER TABLE map_nodes ADD COLUMN IF NOT EXISTS loot_notes VARCHAR",
        "ALTER TABLE map_nodes ADD COLUMN IF NOT EXISTS trap_notes VARCHAR",
        "ALTER TABLE map_edges ADD COLUMN IF NOT EXISTS door_type VARCHAR(20) DEFAULT 'OPEN'",
        # Fix rows stored with lowercase value instead of SQLAlchemy enum name
        "UPDATE map_edges SET door_type = 'OPEN' WHERE door_type = 'open'",
        # 0004 — image urls
        "ALTER TABLE items ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)",
        "ALTER TABLE monster_stat_blocks ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)",
        # portrait_url was in initial schema for player_characters but guard anyway
        "ALTER TABLE player_characters ADD COLUMN IF NOT EXISTS portrait_url VARCHAR(500)",
        # 0005 — campaign description
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS description TEXT",
        # 0006 — session combat state columns on sessions
        # (session_combatants table itself is created by create_all on first boot
        # since it's a new table, not a column on an existing one.)
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS combat_round INTEGER DEFAULT 1",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS combat_active_combatant_id VARCHAR",
        # 0009 — weapon columns on items (Plan 00018)
        "ALTER TABLE items ADD COLUMN IF NOT EXISTS weapon_category VARCHAR(40)",
        "ALTER TABLE items ADD COLUMN IF NOT EXISTS damage_die VARCHAR(20)",
        "ALTER TABLE items ADD COLUMN IF NOT EXISTS damage_type VARCHAR(20)",
        "ALTER TABLE items ADD COLUMN IF NOT EXISTS weapon_properties JSON",
        "ALTER TABLE items ADD COLUMN IF NOT EXISTS versatile_damage VARCHAR(20)",
        "ALTER TABLE items ADD COLUMN IF NOT EXISTS weapon_range VARCHAR(40)",
        "ALTER TABLE items ADD COLUMN IF NOT EXISTS mastery VARCHAR(20)",
        # 0011 — persistent slot-consumption tracker (Plan 00020)
        "ALTER TABLE player_characters ADD COLUMN IF NOT EXISTS spell_slots_used JSON",
    ]
    with engine.begin() as conn:
        for stmt in patches:
            conn.execute(text(stmt))


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
