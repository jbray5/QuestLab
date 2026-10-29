"""Pending level-up (Plan 115).

Adds ``pending_level`` to player_characters: the level the DM has granted. The player's
level-up guide raises ``level`` toward it one step at a time and clears it on arrival.
Nullable and empty for every existing PC, so nothing changes until the DM grants a level.

Revision ID: 0054
Revises: 0053
"""

import sqlalchemy as sa

from alembic import op

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add pending_level (nullable integer) to player_characters."""
    op.add_column("player_characters", sa.Column("pending_level", sa.Integer(), nullable=True))


def downgrade() -> None:
    """Drop pending_level."""
    op.drop_column("player_characters", "pending_level")
