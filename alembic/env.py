"""Alembic environment configuration.

Reads Postgres connection details from environment variables so that no
credentials are stored in version-controlled files.  All SQLModel table
metadata is imported here so that ``--autogenerate`` can detect schema changes.
"""

import os
from logging.config import fileConfig

from dotenv import load_dotenv
from sqlmodel import SQLModel

load_dotenv()

# ── Import all domain models so their tables appear in metadata ────────────────
# Every SQLModel table= True class must be imported here for autogenerate to work.
import domain.adventure  # noqa: E402, F401
import domain.campaign  # noqa: E402, F401
import domain.character  # noqa: E402, F401
import domain.encounter  # noqa: E402, F401
import domain.item  # noqa: E402, F401
import domain.map  # noqa: E402, F401
import domain.monster  # noqa: E402, F401
import domain.session  # noqa: E402, F401
from alembic import context  # noqa: E402

# ── Alembic config ─────────────────────────────────────────────────────────────
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def _get_url() -> str:
    """Build Postgres URL from environment variables.

    Returns:
        SQLAlchemy connection string.
    """
    host = os.environ.get("PGHOST", "localhost")
    port = os.environ.get("PGPORT", "5432")
    dbname = os.environ.get("PGDATABASE", "questlab")
    user = os.environ.get("PGUSER", "questlab")
    password = os.environ.get("PGPASSWORD", "")
    sslmode = os.environ.get("PGSSLMODE", "require")
    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{dbname}" f"?sslmode={sslmode}"


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (generates SQL script)."""
    context.configure(
        url=_get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations with a live DB connection."""
    from sqlalchemy import create_engine

    connectable = create_engine(_get_url())
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
