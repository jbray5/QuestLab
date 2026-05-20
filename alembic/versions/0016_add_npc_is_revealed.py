"""Add is_revealed flag to NPCs (Plan 38 P3-3 polish).

DM-controlled visibility on the player view. Defaults to True so all
existing NPCs stay visible to players; DM can flip to False to hide
an NPC (villain reveal, plot twist, future-session character) until
the players have met them in-fiction.

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add ``is_revealed`` boolean (default True) to the npcs table."""
    op.add_column(
        "npcs",
        sa.Column(
            "is_revealed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    """Drop the ``is_revealed`` column."""
    op.drop_column("npcs", "is_revealed")
