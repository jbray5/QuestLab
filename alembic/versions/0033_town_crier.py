"""Add the Town Crier — NPC-voiced Discord posts (Plan 56).

Revision ID: 0033
Revises: 0032
"""

import sqlalchemy as sa

from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the crier channel, identity, and sent-log tables."""
    op.create_table(
        "crier_channels",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("label", sa.String(length=100), nullable=False),
        # Credential — server-side only, never serialized to a client.
        sa.Column("webhook_url", sa.String(length=500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "crier_npcs",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("embed_color", sa.Integer(), nullable=False, server_default="2829617"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "crier_posts",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # SET NULL, not CASCADE: deleting a channel or identity must not
        # erase the record that a post went out under it.
        sa.Column(
            "channel_id",
            sa.Uuid(),
            sa.ForeignKey("crier_channels.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "npc_id",
            sa.Uuid(),
            sa.ForeignKey("crier_npcs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("channel_label", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("npc_name", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("content", sa.String(length=2000), nullable=True),
        sa.Column("embed_description", sa.String(length=4096), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="sent"),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    """Drop the crier tables (children first)."""
    op.drop_table("crier_posts")
    op.drop_table("crier_npcs")
    op.drop_table("crier_channels")
