"""Add battle_maps.heightmap_url — AI auto-terrain for the 3D board (Plan 45).

Revision ID: 0024
Revises: 0023
"""

import sqlalchemy as sa

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the nullable heightmap_url column to battle_maps."""
    op.add_column("battle_maps", sa.Column("heightmap_url", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    """Drop the heightmap_url column."""
    op.drop_column("battle_maps", "heightmap_url")
