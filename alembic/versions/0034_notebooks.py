"""Add the Session Notebook — notebooks + pages (Plan 57).

Revision ID: 0034
Revises: 0033
"""

import sqlalchemy as sa

from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the notebook and notebook-page tables."""
    op.create_table(
        "notebooks",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "notebook_pages",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "notebook_id",
            sa.Uuid(),
            sa.ForeignKey("notebooks.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        # The page document: ordered blocks + margin pins, DM-owned JSON.
        sa.Column("blocks", sa.JSON(), nullable=True),
        sa.Column("pins", sa.JSON(), nullable=True),
        # Derived plain text for campaign-wide ILIKE search.
        sa.Column("search_text", sa.String(length=100_000), nullable=False, server_default=""),
        sa.Column("is_runbook", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    """Drop the notebook tables (children first)."""
    op.drop_table("notebook_pages")
    op.drop_table("notebooks")
