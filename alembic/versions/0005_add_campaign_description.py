"""Add description column to campaigns table.

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-18
"""

import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add description column to campaigns."""
    op.add_column("campaigns", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    """Drop description column from campaigns."""
    op.drop_column("campaigns", "description")
