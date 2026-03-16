"""add map scale column

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-15
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add scale column to maps table."""
    op.add_column(
        "maps",
        sa.Column(
            "scale",
            sa.String(length=20),
            nullable=False,
            server_default="Dungeon",
        ),
    )


def downgrade() -> None:
    """Remove scale column from maps table."""
    op.drop_column("maps", "scale")
