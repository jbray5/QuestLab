"""Projector-summoned join QR (Plan 69).

Adds ``join_qr_on`` to table_states: the HUD toggles it, the projector
shows the full-screen join code while it's true.

Revision ID: 0038
Revises: 0037
"""

import sqlalchemy as sa

from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the join_qr_on flag (default false, non-null)."""
    op.add_column(
        "table_states",
        sa.Column("join_qr_on", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Drop the join_qr_on flag."""
    op.drop_column("table_states", "join_qr_on")
