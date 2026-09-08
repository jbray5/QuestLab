"""DM vault note path on NPCs, monsters and battle maps (Plan 93).

Adds ``dm_note``: an Obsidian vault path ("People/Auntie Sorrel") the DM
follows in one click from a card. DM-only — it is a spoiler, and never
crosses a player-facing boundary.

Revision ID: 0045
Revises: 0044
"""

import sqlalchemy as sa

from alembic import op

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None

_TABLES = ("npcs", "monster_stat_blocks", "battle_maps")


def upgrade() -> None:
    """Add the nullable dm_note column to each card-bearing table."""
    for table in _TABLES:
        op.add_column(table, sa.Column("dm_note", sa.String(length=300), nullable=True))


def downgrade() -> None:
    """Drop dm_note."""
    for table in _TABLES:
        op.drop_column(table, "dm_note")
