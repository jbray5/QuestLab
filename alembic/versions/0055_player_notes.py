"""Player notes (Plan 122).

Adds ``player_notes`` to player_characters: the player's own notes, written from their phone.
The DM's ``notes`` column stays the DM's; the player link no longer returns it.
Nullable and empty for every existing PC.

Revision ID: 0055
Revises: 0054
"""

import sqlalchemy as sa

from alembic import op

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add player_notes (nullable text) to player_characters."""
    op.add_column("player_characters", sa.Column("player_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    """Drop player_notes."""
    op.drop_column("player_characters", "player_notes")
