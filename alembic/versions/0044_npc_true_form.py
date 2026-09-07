"""NPC true form (Plan 91).

Adds ``true_form_url`` and ``true_form_revealed`` to npcs: the portrait an NPC
wears after the reveal (the hag under the kindly aunt), and whether players
and the table see it yet.

Revision ID: 0044
Revises: 0043
"""

import sqlalchemy as sa

from alembic import op

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add true_form_url (nullable) and true_form_revealed (default false)."""
    op.add_column("npcs", sa.Column("true_form_url", sa.String(length=500), nullable=True))
    op.add_column(
        "npcs",
        sa.Column("true_form_revealed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Drop the true-form columns."""
    op.drop_column("npcs", "true_form_revealed")
    op.drop_column("npcs", "true_form_url")
