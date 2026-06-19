"""Add NPC Table-face fields (Plan 40 — runbook redesign).

The DM wanted a glanceable at-the-table read alongside the rich prep
content. The existing rich fields (appearance, personality, motivation,
secret, notes) become the Prep face; these new short fields are what
the DM looks at mid-conversation.

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-19
"""

import sqlalchemy as sa

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add six new nullable Table-face columns to ``npcs``."""
    op.add_column("npcs", sa.Column("quick_who", sa.String(length=120), nullable=True))
    op.add_column("npcs", sa.Column("want_now", sa.String(length=200), nullable=True))
    op.add_column("npcs", sa.Column("knows", sa.JSON(), nullable=True))
    op.add_column("npcs", sa.Column("voice", sa.String(length=200), nullable=True))
    op.add_column("npcs", sa.Column("secret_short", sa.String(length=200), nullable=True))
    op.add_column("npcs", sa.Column("relationship_pings", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Drop the Table-face columns."""
    op.drop_column("npcs", "relationship_pings")
    op.drop_column("npcs", "secret_short")
    op.drop_column("npcs", "voice")
    op.drop_column("npcs", "knows")
    op.drop_column("npcs", "want_now")
    op.drop_column("npcs", "quick_who")
