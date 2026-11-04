"""Character counters: hand-made ones and a homebrew subclass's (Plan 135).

Creates ``character_resources``, one row per counter on a character (``character_id``,
indexed; FK ``player_characters.id``). Additive only: no existing table changes.

- ``source`` "custom": a counter the DM made on the sheet (a book subclass's Superiority
  Dice, an NPC's own pool). The row holds ``max_uses`` (1–100), ``die`` ("d4"–"d12" or
  NULL), ``recovery`` ("short", "long" or "none") and ``notes``.
- ``source`` "subclass": only the spent uses of a counter declared by the character's
  homebrew subclass (``homebrew_subclasses.resources``), keyed by ``name``. Its size and die
  are computed from the subclass at read time, so ``max_uses`` and ``die`` stay NULL.

``uses_spent`` counts spent uses (0 = full). Rests set it back to 0. Deleting a character
deletes its counters first (``CharacterRepo.delete``; the FK has no ON DELETE CASCADE, like
``character_features``).

Revision ID: 0064
Revises: 0063
"""

import sqlalchemy as sa

from alembic import op

revision = "0064"
down_revision = "0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create character_resources and its character_id index."""
    op.create_table(
        "character_resources",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "character_id",
            sa.Uuid(),
            sa.ForeignKey("player_characters.id", name="fk_character_resources_character_id"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=10), nullable=False, server_default="custom"),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("die", sa.String(length=3), nullable=True),
        sa.Column("recovery", sa.String(length=5), nullable=False, server_default="long"),
        sa.Column("uses_spent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_character_resources_character_id", "character_resources", ["character_id"])


def downgrade() -> None:
    """Drop character_resources.

    Lossy: every hand-made counter and the spent uses of subclass counters are deleted; the
    subclasses keep their counter definitions. Never downgrade prod.
    """
    op.drop_index("ix_character_resources_character_id", table_name="character_resources")
    op.drop_table("character_resources")
