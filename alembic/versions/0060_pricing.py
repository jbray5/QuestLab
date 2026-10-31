"""Pricing (Plan 130): Patron comps and the uploads ledger.

Adds ``users.patron_comped`` (an admin gave this DM Patron) and ``uploads``
(one row per stored file: owner, URL, bytes, kind, created). A DM's storage
use is the sum of their rows; uploads from before this table count as 0.
Additive only.

Revision ID: 0060
Revises: 0059
"""

import sqlalchemy as sa

from alembic import op

revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add users.patron_comped and create the uploads ledger."""
    op.add_column(
        "users",
        sa.Column("patron_comped", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "uploads",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_email", sa.String(length=320), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="portrait"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_uploads_owner_email", "uploads", ["owner_email"])


def downgrade() -> None:
    """Drop the uploads ledger and users.patron_comped."""
    op.drop_index("ix_uploads_owner_email", table_name="uploads")
    op.drop_table("uploads")
    op.drop_column("users", "patron_comped")
