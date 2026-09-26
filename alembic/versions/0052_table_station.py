"""The active station (Plan 114, section 11b).

Adds ``station`` to table_states — which of the Summer Games the table is
watching right now. The immersive view flies its camera to that station's
preset when it changes; nothing else reads it.

Revision ID: 0052
Revises: 0051
"""

import sqlalchemy as sa

from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add station (nullable short string) to table_states."""
    op.add_column("table_states", sa.Column("station", sa.String(length=24), nullable=True))


def downgrade() -> None:
    """Drop station."""
    op.drop_column("table_states", "station")
