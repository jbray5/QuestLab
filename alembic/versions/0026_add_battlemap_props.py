"""Add battle_maps.ground_url + props — productized diorama (Plan 46).

Revision ID: 0026
Revises: 0025
"""

import sqlalchemy as sa

from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the ground-layer URL and the upright-props JSON to battle_maps."""
    op.add_column("battle_maps", sa.Column("ground_url", sa.String(length=1000), nullable=True))
    op.add_column("battle_maps", sa.Column("props", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Drop the diorama columns."""
    op.drop_column("battle_maps", "props")
    op.drop_column("battle_maps", "ground_url")
