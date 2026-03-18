"""Add dungeon builder fields to map_nodes and map_edges.

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-16
"""

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add width, height, loot_notes, trap_notes to map_nodes; door_type to map_edges."""
    op.add_column(
        "map_nodes",
        sa.Column("width", sa.Integer(), server_default="200", nullable=False),
    )
    op.add_column(
        "map_nodes",
        sa.Column("height", sa.Integer(), server_default="120", nullable=False),
    )
    op.add_column(
        "map_nodes",
        sa.Column("loot_notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "map_nodes",
        sa.Column("trap_notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "map_edges",
        sa.Column("door_type", sa.String(20), server_default="open", nullable=False),
    )


def downgrade() -> None:
    """Remove dungeon builder fields."""
    op.drop_column("map_edges", "door_type")
    op.drop_column("map_nodes", "trap_notes")
    op.drop_column("map_nodes", "loot_notes")
    op.drop_column("map_nodes", "height")
    op.drop_column("map_nodes", "width")
