"""Animated map surfaces (Plan 71).

Adds ``video_url`` to battle_maps: a looping MP4/WebM the projector
plays under the table layers; image_url remains the poster/fallback.

Revision ID: 0039
Revises: 0038
"""

import sqlalchemy as sa

from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the nullable video_url column."""
    op.add_column("battle_maps", sa.Column("video_url", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    """Drop video_url."""
    op.drop_column("battle_maps", "video_url")
