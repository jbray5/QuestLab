"""Add figure_url to player_characters + monster_stat_blocks (Plan 45 minifigs).

Revision ID: 0023
Revises: 0022
"""

import sqlalchemy as sa

from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the nullable figure_url columns."""
    op.add_column(
        "player_characters", sa.Column("figure_url", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "monster_stat_blocks", sa.Column("figure_url", sa.String(length=500), nullable=True)
    )


def downgrade() -> None:
    """Drop the figure_url columns."""
    op.drop_column("player_characters", "figure_url")
    op.drop_column("monster_stat_blocks", "figure_url")
