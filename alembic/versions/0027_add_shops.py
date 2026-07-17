"""Add shops + shop_items — the player marketplace (Plan 47).

Revision ID: 0027
Revises: 0026
"""

import sqlalchemy as sa

from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the shops and shop_items tables."""
    op.create_table(
        "shops",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("keeper", sa.String(length=200), nullable=True),
        sa.Column("blurb", sa.String(), nullable=True),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("banner_url", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "shop_items",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "shop_id",
            sa.Uuid(),
            sa.ForeignKey("shops.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "item_id",
            sa.Uuid(),
            sa.ForeignKey("items.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("price_gp", sa.Float(), nullable=False, server_default="0"),
        sa.Column("stock", sa.Integer(), nullable=True),
        sa.Column("pitch", sa.String(length=500), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    """Drop the marketplace tables."""
    op.drop_table("shop_items")
    op.drop_table("shops")
