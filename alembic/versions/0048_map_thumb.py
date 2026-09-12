"""Battle-map thumbnail (Plan 99).

Adds ``thumb_url``: a small JPEG for pickers and grids. The map library grew to
42 boards totalling ~199 MB, several of them 30-46 megapixels, and every picker
rendered the full-size image into a ~200px box — decoding a 46 MP JPEG costs
~185 MB of bitmap, which is what made the HUD crawl.

Revision ID: 0048
Revises: 0047
"""

import sqlalchemy as sa

from alembic import op

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add thumb_url (nullable — the full image stays the fallback)."""
    op.add_column("battle_maps", sa.Column("thumb_url", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    """Drop thumb_url."""
    op.drop_column("battle_maps", "thumb_url")
