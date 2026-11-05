"""Side quest recaps: what a player tells the party about a finished quest (Plan 138).

Adds ``recap`` and ``recap_at`` to ``side_quest_runs``. Additive and nullable.

Revision ID: 0066
Revises: 0065
"""

import sqlalchemy as sa

from alembic import op

revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the two recap columns."""
    op.add_column("side_quest_runs", sa.Column("recap", sa.Text(), nullable=True))
    op.add_column(
        "side_quest_runs", sa.Column("recap_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    """Drop them. Lossy: shared recaps are deleted. Never downgrade prod."""
    op.drop_column("side_quest_runs", "recap_at")
    op.drop_column("side_quest_runs", "recap")
