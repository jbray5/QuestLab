"""The map shelf (Plan 113).

Adds ``map_shelf`` to table_states — a JSON list of the battle-map ids a
session keeps to hand, so the HUD shows tonight's maps rather than the
whole campaign library.

Revision ID: 0051
Revises: 0050
"""

import sqlalchemy as sa

from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add map_shelf (nullable JSON) to table_states."""
    op.add_column("table_states", sa.Column("map_shelf", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Drop map_shelf."""
    op.drop_column("table_states", "map_shelf")
