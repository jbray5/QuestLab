"""Homebrew races and subclasses, and the custom origin switch (Plan 133).

Creates ``homebrew_races`` and ``homebrew_subclasses``: a DM's own character options, each
row owned by its author (``created_by_email``, indexed; SEC-003). ``ruleset`` is "2024",
"2014" or NULL (both editions). Their JSON columns hold the shapes documented in
``domain/homebrew.py``.

Adds ``campaigns.custom_origin`` (Tasha's custom origin, 2014 campaigns only): NOT NULL with a
server default of false, so every existing campaign reads as off, unchanged. Additive only.

Revision ID: 0062
Revises: 0061
"""

import sqlalchemy as sa

from alembic import op

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the two homebrew tables and add campaigns.custom_origin."""
    op.create_table(
        "homebrew_races",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_by_email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("ruleset", sa.String(length=4), nullable=True),
        sa.Column("size", sa.String(length=10), nullable=False, server_default="Medium"),
        sa.Column("speed", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("ability_bonuses", sa.JSON(), nullable=False),
        sa.Column("ability_choice", sa.JSON(), nullable=True),
        sa.Column("skills", sa.JSON(), nullable=False),
        sa.Column("skill_choice", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("traits", sa.JSON(), nullable=False),
        sa.Column("languages", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("hp_per_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("darkvision", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_homebrew_races_created_by_email", "homebrew_races", ["created_by_email"])
    op.create_table(
        "homebrew_subclasses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_by_email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("character_class", sa.String(length=20), nullable=False),
        sa.Column("ruleset", sa.String(length=4), nullable=True),
        sa.Column("features", sa.JSON(), nullable=False),
        sa.Column("always_prepared", sa.JSON(), nullable=True),
        sa.Column("blurb", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_homebrew_subclasses_created_by_email", "homebrew_subclasses", ["created_by_email"]
    )
    op.add_column(
        "campaigns",
        sa.Column("custom_origin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Drop campaigns.custom_origin and both homebrew tables.

    Lossy: every DM's homebrew races and subclasses are deleted, and characters built with
    them keep only the name. Never downgrade prod.
    """
    op.drop_column("campaigns", "custom_origin")
    op.drop_index("ix_homebrew_subclasses_created_by_email", table_name="homebrew_subclasses")
    op.drop_table("homebrew_subclasses")
    op.drop_index("ix_homebrew_races_created_by_email", table_name="homebrew_races")
    op.drop_table("homebrew_races")
