"""Add battle_maps.backdrop_url — AI-generated 360° board backdrop (Plan 45).

Revision ID: 0022
Revises: 0021
"""

import sqlalchemy as sa

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the nullable backdrop_url column to battle_maps."""
    op.add_column("battle_maps", sa.Column("backdrop_url", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    """Drop the backdrop_url column."""
    op.drop_column("battle_maps", "backdrop_url")
