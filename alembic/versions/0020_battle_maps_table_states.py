"""Add battle_maps + table_states (Plan 42 — remote Table View).

battle_maps: campaign-scoped library of imported map images with prep-authored
fog regions (JSON polygons). table_states: one live table-surface state per
session (active map, revealed fog, tokens, darkness, title) driving the
projected Table View.

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-04
"""

import sqlalchemy as sa

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create battle_maps and table_states."""
    op.create_table(
        "battle_maps",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("image_url", sa.String(length=1000), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("grid_size", sa.Integer(), nullable=True),
        sa.Column("regions", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "table_states",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "session_id",
            sa.Uuid(),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column(
            "active_map_id",
            sa.Uuid(),
            sa.ForeignKey("battle_maps.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("fog_on", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("revealed_region_ids", sa.JSON(), nullable=True),
        sa.Column("brush_reveals", sa.JSON(), nullable=True),
        sa.Column("tokens", sa.JSON(), nullable=True),
        sa.Column("darkness", sa.Float(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(length=120), nullable=False, server_default=""),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    """Drop table_states and battle_maps."""
    op.drop_table("table_states")
    op.drop_table("battle_maps")
