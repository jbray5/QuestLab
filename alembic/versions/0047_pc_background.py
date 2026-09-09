"""Per-character sheet background (Plan 97).

Adds ``background_url`` to player_characters: the full-bleed image behind a
player's phone sheet. Campaign data, not shipped product art — the subclass
gradient stays the fallback for anyone without one.

Revision ID: 0047
Revises: 0046
"""

import sqlalchemy as sa

from alembic import op

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add background_url (nullable)."""
    op.add_column(
        "player_characters", sa.Column("background_url", sa.String(length=500), nullable=True)
    )


def downgrade() -> None:
    """Drop background_url."""
    op.drop_column("player_characters", "background_url")
