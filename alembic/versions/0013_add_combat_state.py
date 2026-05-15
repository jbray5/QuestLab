"""Add combat-state columns to player_characters.

Plan 00023 — table-state polish (death saves, inspiration, concentration,
temp HP). All columns are non-null with safe defaults so existing rows
remain valid.

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add five combat-state columns to player_characters."""
    op.add_column(
        "player_characters",
        sa.Column("temp_hp", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "player_characters",
        sa.Column(
            "heroic_inspiration",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "player_characters",
        sa.Column("concentration_on", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "player_characters",
        sa.Column(
            "death_save_successes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "player_characters",
        sa.Column(
            "death_save_failures",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    """Drop the five combat-state columns."""
    op.drop_column("player_characters", "death_save_failures")
    op.drop_column("player_characters", "death_save_successes")
    op.drop_column("player_characters", "concentration_on")
    op.drop_column("player_characters", "heroic_inspiration")
    op.drop_column("player_characters", "temp_hp")
