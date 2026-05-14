"""Add character_spells table + spell_slots_used column on player_characters.

Plan 00020 — fourth foundation block of the Roll20-killer character sheet.

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create character_spells table and add spell_slots_used column."""
    op.create_table(
        "character_spells",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "character_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("player_characters.id", name="fk_character_spells_character_id"),
            nullable=False,
        ),
        sa.Column(
            "spell_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spells.id", name="fk_character_spells_spell_id"),
            nullable=False,
        ),
        sa.Column("known", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("prepared", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "added_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_character_spells_character_id", "character_spells", ["character_id"])
    op.create_index("ix_character_spells_spell_id", "character_spells", ["spell_id"])

    op.add_column("player_characters", sa.Column("spell_slots_used", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Drop character_spells table and the spell_slots_used column."""
    op.drop_column("player_characters", "spell_slots_used")
    op.drop_index("ix_character_spells_spell_id", table_name="character_spells")
    op.drop_index("ix_character_spells_character_id", table_name="character_spells")
    op.drop_table("character_spells")
