"""Side quests: practice runs, the DM trying a quest as a character (Plan 142).

Adds ``side_quest_runs.practice``: NOT NULL, default false, so every existing run stays a real one.
Additive.

Revision ID: 0068
Revises: 0067
"""

import sqlalchemy as sa

from alembic import op

revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the flag, false for every existing run."""
    op.add_column(
        "side_quest_runs",
        sa.Column("practice", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Drop it. Never downgrade prod."""
    op.drop_column("side_quest_runs", "practice")
