"""Campaign join code (Plan 83).

Adds ``join_code`` to campaigns: an optional short code the join page asks for
before it lists the party, so a leaked link alone isn't enough.

Revision ID: 0043
Revises: 0042
"""

import sqlalchemy as sa

from alembic import op

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add join_code (nullable)."""
    op.add_column("campaigns", sa.Column("join_code", sa.String(length=12), nullable=True))


def downgrade() -> None:
    """Drop join_code."""
    op.drop_column("campaigns", "join_code")
