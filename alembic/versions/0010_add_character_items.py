"""Add character_items junction table (PC inventory).

Plan 00019 — third foundation block of the Roll20-killer character sheet.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the character_items table."""
    op.create_table(
        "character_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "character_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("player_characters.id", name="fk_character_items_character_id"),
            nullable=False,
        ),
        sa.Column(
            "item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("items.id", name="fk_character_items_item_id"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("equipped", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("attuned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("attuned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "acquired_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("notes", sa.String(length=500), nullable=True),
    )
    op.create_index("ix_character_items_character_id", "character_items", ["character_id"])
    op.create_index("ix_character_items_item_id", "character_items", ["item_id"])


def downgrade() -> None:
    """Drop the character_items table."""
    op.drop_index("ix_character_items_item_id", table_name="character_items")
    op.drop_index("ix_character_items_character_id", table_name="character_items")
    op.drop_table("character_items")
