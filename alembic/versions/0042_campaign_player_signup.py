"""Player sign-up toggle (Plan 74).

Adds ``allow_player_signup`` to campaigns: when true (default), anyone with
the join link can create their own character in the campaign.

Revision ID: 0042
Revises: 0041
"""

import sqlalchemy as sa

from alembic import op

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add allow_player_signup (default true)."""
    op.add_column(
        "campaigns",
        sa.Column("allow_player_signup", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    """Drop allow_player_signup."""
    op.drop_column("campaigns", "allow_player_signup")
