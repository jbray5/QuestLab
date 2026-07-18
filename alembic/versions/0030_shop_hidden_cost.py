"""Add shops.hidden + shop_items.cost_text — hidden fey market (Plan 47).

Revision ID: 0030
Revises: 0029
"""

import sqlalchemy as sa

from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the hidden-shop flag and the non-gold cost text."""
    op.add_column(
        "shops",
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("shop_items", sa.Column("cost_text", sa.String(length=200), nullable=True))


def downgrade() -> None:
    """Drop the hidden flag and cost text."""
    op.drop_column("shop_items", "cost_text")
    op.drop_column("shops", "hidden")
