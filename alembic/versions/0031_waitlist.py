"""Add waitlist_entries — beta interest capture (Plan 54).

Revision ID: 0031
Revises: 0030
"""

import sqlalchemy as sa

from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the waitlist table."""
    op.create_table(
        "waitlist_entries",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False, index=True),
        sa.Column("source", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    """Drop the waitlist table."""
    op.drop_table("waitlist_entries")
