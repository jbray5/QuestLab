"""Rulesets (Plan 131): a campaign plays by the 2024 rules or the 2014 rules.

Adds ``ruleset`` ("2024" or "2014") to campaigns, player_characters and
class_features. Each is NOT NULL with a server default of "2024", so every
existing row reads as 2024, unchanged. ``spells.ruleset`` is nullable: the
shared SRD rows are backfilled to "2024", and a DM's homebrew stays NULL,
which means it is valid in both rulesets. Additive only.

Revision ID: 0061
Revises: 0060
"""

import sqlalchemy as sa

from alembic import op

revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None

_TABLES = ("campaigns", "player_characters", "class_features")


def upgrade() -> None:
    """Add the ruleset columns and mark the existing SRD spells as 2024."""
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("ruleset", sa.String(length=4), nullable=False, server_default="2024"),
        )
    op.add_column("spells", sa.Column("ruleset", sa.String(length=4), nullable=True))
    op.execute(sa.text("UPDATE spells SET ruleset = '2024' WHERE created_by_email IS NULL"))
    op.create_index("ix_spells_ruleset", "spells", ["ruleset"])


def downgrade() -> None:
    """Drop the ruleset columns.

    Lossy once 2014 data exists: the 2014 spell and class-feature rows stay behind with
    nothing marking them, and 2014 campaigns read as 2024. Never downgrade prod.
    """
    op.drop_index("ix_spells_ruleset", table_name="spells")
    op.drop_column("spells", "ruleset")
    for table in reversed(_TABLES):
        op.drop_column(table, "ruleset")
