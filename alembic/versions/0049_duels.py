"""Duels fought on separate devices (Plan 104).

The Practice Arena keeps the whole fight on the phone as a sealed document, and
that is still how a solo spar and a hot-seat duel work. Two players on two
phones need an authority, so a duel of that kind gets a row: the seats, the
sealed fight, and whether it is still going.

Revision ID: 0049
Revises: 0048
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the duels table."""
    op.create_table(
        "duels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("host_pc_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("seat_ids", sa.JSON(), nullable=True),
        sa.Column("state", sa.JSON(), nullable=True),
        sa.Column("phase", sa.String(length=12), nullable=False, server_default="live"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["host_pc_id"], ["player_characters.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_duels_campaign_id", "duels", ["campaign_id"])
    op.create_index("ix_duels_host_pc_id", "duels", ["host_pc_id"])


def downgrade() -> None:
    """Drop the duels table."""
    op.drop_index("ix_duels_host_pc_id", table_name="duels")
    op.drop_index("ix_duels_campaign_id", table_name="duels")
    op.drop_table("duels")
