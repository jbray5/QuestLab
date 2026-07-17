"""Add table_states.weather — synced ambience for the players' views (Plan 46).

Revision ID: 0025
Revises: 0024
"""

import sqlalchemy as sa

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the nullable weather column to table_states."""
    op.add_column("table_states", sa.Column("weather", sa.String(length=12), nullable=True))


def downgrade() -> None:
    """Drop the weather column."""
    op.drop_column("table_states", "weather")
