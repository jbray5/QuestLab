"""Homebrew feats, race speeds and natural weapons, subclass counters (Plan 135).

Creates ``homebrew_feats``: a DM's own feats, each row owned by its author
(``created_by_email``, indexed; SEC-003). ``ruleset`` is "2024", "2014" or NULL (both).

Adds, all additive:

- ``homebrew_races.speeds`` (JSON, NULL) and ``homebrew_races.natural_weapons`` (JSON, NOT
  NULL, server default ``[]``, so existing races read as having none).
- ``homebrew_subclasses.resources`` (JSON, NOT NULL, server default ``[]``).
- ``player_characters.speeds`` (JSON, NULL): every existing character reads as walking only.

The JSON shapes are documented in ``domain/homebrew.py``.

Revision ID: 0063
Revises: 0062
"""

import sqlalchemy as sa

from alembic import op

revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create homebrew_feats and add the four JSON columns."""
    op.create_table(
        "homebrew_feats",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_by_email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("ruleset", sa.String(length=4), nullable=True),
        sa.Column("category", sa.String(length=20), nullable=False, server_default="general"),
        sa.Column("blurb", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("description", sa.String(length=3000), nullable=False, server_default=""),
        sa.Column("prerequisite", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("asi_options", sa.JSON(), nullable=True),
        sa.Column("repeatable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("power_attack", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_homebrew_feats_created_by_email", "homebrew_feats", ["created_by_email"])
    op.add_column("homebrew_races", sa.Column("speeds", sa.JSON(), nullable=True))
    op.add_column(
        "homebrew_races",
        sa.Column("natural_weapons", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "homebrew_subclasses",
        sa.Column("resources", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column("player_characters", sa.Column("speeds", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Drop the four columns and homebrew_feats.

    Lossy: homebrew feats, race speeds and natural weapons, subclass counters and characters'
    other speeds are deleted; characters keep their feats by name. Never downgrade prod.
    """
    op.drop_column("player_characters", "speeds")
    op.drop_column("homebrew_subclasses", "resources")
    op.drop_column("homebrew_races", "natural_weapons")
    op.drop_column("homebrew_races", "speeds")
    op.drop_index("ix_homebrew_feats_created_by_email", table_name="homebrew_feats")
    op.drop_table("homebrew_feats")
