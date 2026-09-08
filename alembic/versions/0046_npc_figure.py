"""NPC board standee (Plan 94).

Adds ``figure_url`` to npcs — the transparent full-body cut-out the 3D board
stands up for an NPC, matching what PCs and monsters already carry.

Revision ID: 0046
Revises: 0045
"""

import sqlalchemy as sa

from alembic import op

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add figure_url (nullable)."""
    op.add_column("npcs", sa.Column("figure_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Drop figure_url."""
    op.drop_column("npcs", "figure_url")
