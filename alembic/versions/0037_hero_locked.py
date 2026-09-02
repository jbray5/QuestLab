"""Golden base models (Plan 62 follow-up): lockable hero renders.

Adds ``hero_locked`` to player_characters. When a player loves their
base look they pin it; "New base look" refuses to re-roll a locked
hero, while gear/portrait/minifig passes keep deriving from it.

Revision ID: 0037
Revises: 0036
"""

import sqlalchemy as sa

from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the hero_locked flag (default false, non-null)."""
    op.add_column(
        "player_characters",
        sa.Column("hero_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Drop the hero_locked flag."""
    op.drop_column("player_characters", "hero_locked")
