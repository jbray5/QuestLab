"""Rigged 3D figures for the immersive table (Plan 111).

Adds ``model_url`` to player_characters and monster_stat_blocks — the ``.glb``
the engine walks for that PC or monster, beside the 2D standee it already
carries in ``figure_url``.

Revision ID: 0050
Revises: 0049
"""

import sqlalchemy as sa

from alembic import op

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add model_url (nullable) to PCs and monsters."""
    op.add_column("player_characters", sa.Column("model_url", sa.String(length=500), nullable=True))
    op.add_column(
        "monster_stat_blocks", sa.Column("model_url", sa.String(length=500), nullable=True)
    )


def downgrade() -> None:
    """Drop model_url."""
    op.drop_column("monster_stat_blocks", "model_url")
    op.drop_column("player_characters", "model_url")
