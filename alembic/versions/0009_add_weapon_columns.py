"""Add weapon-specific columns to items.

Plan 00018 — second foundation block of the Roll20-killer character sheet.
All columns are nullable; only populated for items that are weapons.

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add weapon columns to the items table."""
    op.add_column("items", sa.Column("weapon_category", sa.String(length=40), nullable=True))
    op.add_column("items", sa.Column("damage_die", sa.String(length=20), nullable=True))
    op.add_column("items", sa.Column("damage_type", sa.String(length=20), nullable=True))
    op.add_column("items", sa.Column("weapon_properties", sa.JSON(), nullable=True))
    op.add_column("items", sa.Column("versatile_damage", sa.String(length=20), nullable=True))
    op.add_column("items", sa.Column("weapon_range", sa.String(length=40), nullable=True))
    op.add_column("items", sa.Column("mastery", sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Drop weapon columns from items."""
    op.drop_column("items", "mastery")
    op.drop_column("items", "weapon_range")
    op.drop_column("items", "versatile_damage")
    op.drop_column("items", "weapon_properties")
    op.drop_column("items", "damage_type")
    op.drop_column("items", "damage_die")
    op.drop_column("items", "weapon_category")
