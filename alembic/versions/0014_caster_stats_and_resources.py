"""Add hit dice / exhaustion / currency columns to player_characters.

Plan 00024 — caster stats are computed on read (no columns), but Hit Dice
spent counter, exhaustion level, and the five currency denominations are
persistent state. All non-null with safe zero defaults so existing rows
remain valid.

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add seven resource columns to player_characters."""
    op.add_column(
        "player_characters",
        sa.Column("hit_dice_spent", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "player_characters",
        sa.Column("exhaustion", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "player_characters",
        sa.Column("cp", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "player_characters",
        sa.Column("sp", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "player_characters",
        sa.Column("ep", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "player_characters",
        sa.Column("gp", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "player_characters",
        sa.Column("pp", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    """Drop the seven Plan 00024 columns."""
    op.drop_column("player_characters", "pp")
    op.drop_column("player_characters", "gp")
    op.drop_column("player_characters", "ep")
    op.drop_column("player_characters", "sp")
    op.drop_column("player_characters", "cp")
    op.drop_column("player_characters", "exhaustion")
    op.drop_column("player_characters", "hit_dice_spent")
