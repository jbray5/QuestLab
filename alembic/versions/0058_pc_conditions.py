"""PC conditions that last between fights (UX-001).

Conditions a DM set on a party card lived only in that browser tab outside a
fight, and the phone showed conditions only during one. ``conditions`` (JSON
list of names) keeps them on the character; the tracker row mirrors
them while a fight runs. Nullable: no existing PC has any.

Revision ID: 0058
Revises: 0057
"""

import sqlalchemy as sa

from alembic import op

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add conditions (nullable JSON) to player_characters."""
    op.add_column("player_characters", sa.Column("conditions", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Drop conditions."""
    op.drop_column("player_characters", "conditions")
