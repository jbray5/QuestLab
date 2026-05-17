"""Add NPCs table (Plan 00033).

Campaign-scoped NPC sheets. Story-first: name + role + personality +
motivation + secret + dialog_hooks + tags + status + location. Combat
stats are optional via ``monster_stat_block_id`` (nullable FK).

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-17
"""

import sqlalchemy as sa

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the ``npcs`` table."""
    op.create_table(
        "npcs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("role", sa.String(length=120), nullable=True),
        sa.Column("race", sa.String(length=80), nullable=True),
        sa.Column("gender", sa.String(length=40), nullable=True),
        sa.Column("age", sa.String(length=60), nullable=True),
        sa.Column("appearance", sa.Text(), nullable=True),
        sa.Column("personality", sa.Text(), nullable=True),
        sa.Column("motivation", sa.Text(), nullable=True),
        sa.Column("secret", sa.Text(), nullable=True),
        sa.Column("dialog_hooks", sa.JSON(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="Alive",
        ),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column(
            "monster_stat_block_id",
            sa.Uuid(),
            sa.ForeignKey("monster_stat_blocks.id"),
            nullable=True,
        ),
        sa.Column("portrait_url", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    """Drop the ``npcs`` table."""
    op.drop_table("npcs")
