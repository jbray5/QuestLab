"""Add spells table (SRD 5.5e catalog).

Plan 00017 — first foundation block of the Roll20-killer character sheet.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the spells table."""
    op.create_table(
        "spells",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("school", sa.String(length=40), nullable=False),
        sa.Column("casting_time", sa.String(length=60), nullable=False),
        sa.Column("range", sa.String(length=60), nullable=False),
        sa.Column("components_v", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("components_s", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("components_m", sa.String(length=300), nullable=True),
        sa.Column("duration", sa.String(length=60), nullable=False),
        sa.Column("is_ritual", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "is_concentration",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("higher_levels", sa.Text(), nullable=True),
        sa.Column("damage_dice", sa.String(length=40), nullable=True),
        sa.Column("damage_type", sa.String(length=40), nullable=True),
        sa.Column("save_ability", sa.String(length=10), nullable=True),
        sa.Column("attack_type", sa.String(length=20), nullable=True),
        sa.Column("classes", sa.JSON(), nullable=True),
        sa.Column(
            "source",
            sa.String(length=60),
            nullable=False,
            server_default=sa.text("'SRD 5.5e (2024)'"),
        ),
    )
    op.create_index("ix_spells_name", "spells", ["name"])
    op.create_index("ix_spells_level", "spells", ["level"])


def downgrade() -> None:
    """Drop the spells table."""
    op.drop_index("ix_spells_level", table_name="spells")
    op.drop_index("ix_spells_name", table_name="spells")
    op.drop_table("spells")
