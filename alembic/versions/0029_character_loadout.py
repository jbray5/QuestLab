"""Add player_characters.loadout_url — dressed character render (Plan 48).

Revision ID: 0029
Revises: 0028
"""

import sqlalchemy as sa

from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the dressed-model (loadout) render URL."""
    op.add_column(
        "player_characters", sa.Column("loadout_url", sa.String(length=500), nullable=True)
    )


def downgrade() -> None:
    """Drop the loadout render column."""
    op.drop_column("player_characters", "loadout_url")
