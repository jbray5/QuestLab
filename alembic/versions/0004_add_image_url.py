"""Add image_url to items and monster_stat_blocks tables.

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-17
"""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add image_url columns."""
    op.add_column("items", sa.Column("image_url", sa.String(length=500), nullable=True))
    op.add_column(
        "monster_stat_blocks", sa.Column("image_url", sa.String(length=500), nullable=True)
    )


def downgrade() -> None:
    """Drop image_url columns."""
    op.drop_column("items", "image_url")
    op.drop_column("monster_stat_blocks", "image_url")
