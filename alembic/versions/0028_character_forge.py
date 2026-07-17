"""Add player_characters appearance/hero columns — Character Forge (Plan 48).

Revision ID: 0028
Revises: 0027
"""

import sqlalchemy as sa

from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the player-editable appearance + hero render columns."""
    op.add_column("player_characters", sa.Column("appearance", sa.String(), nullable=True))
    op.add_column("player_characters", sa.Column("hero_url", sa.String(length=500), nullable=True))
    op.add_column(
        "player_characters",
        sa.Column("hero_generated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Drop the Character Forge columns."""
    op.drop_column("player_characters", "hero_generated_at")
    op.drop_column("player_characters", "hero_url")
    op.drop_column("player_characters", "appearance")
