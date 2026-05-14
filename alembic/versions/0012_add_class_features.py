"""Add class_features catalog + character_features junction.

Plan 00021 — fifth foundation block of the Roll20-killer character sheet.

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create class_features + character_features tables."""
    op.create_table(
        "class_features",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("character_class", sa.String(length=40), nullable=False),
        sa.Column("subclass", sa.String(length=80), nullable=True),
        sa.Column("level_acquired", sa.Integer(), nullable=False),
        sa.Column("recovery", sa.String(length=20), nullable=False),
        sa.Column("uses_formula", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "source",
            sa.String(length=60),
            nullable=False,
            server_default=sa.text("'SRD 5.5e / 2024 PHB'"),
        ),
    )
    op.create_index("ix_class_features_character_class", "class_features", ["character_class"])

    op.create_table(
        "character_features",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "character_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("player_characters.id", name="fk_character_features_character_id"),
            nullable=False,
        ),
        sa.Column(
            "feature_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("class_features.id", name="fk_character_features_feature_id"),
            nullable=False,
        ),
        sa.Column("uses_spent", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("notes", sa.String(length=300), nullable=True),
    )
    op.create_index("ix_character_features_character_id", "character_features", ["character_id"])
    op.create_index("ix_character_features_feature_id", "character_features", ["feature_id"])


def downgrade() -> None:
    """Drop both tables."""
    op.drop_index("ix_character_features_feature_id", table_name="character_features")
    op.drop_index("ix_character_features_character_id", table_name="character_features")
    op.drop_table("character_features")
    op.drop_index("ix_class_features_character_class", table_name="class_features")
    op.drop_table("class_features")
