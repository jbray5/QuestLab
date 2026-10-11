"""Drop the active-station column.

The Summer Games station control was built for one session and has been
removed along with the tracker it drove, so the column it wrote to is no
longer read by anything. It only ever held a camera-preset name, so dropping
it loses nothing worth keeping.

Revision ID: 0053
Revises: 0052
"""

import sqlalchemy as sa

from alembic import op

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Drop station from table_states."""
    op.drop_column("table_states", "station")


def downgrade() -> None:
    """Put the nullable station column back, empty."""
    op.add_column("table_states", sa.Column("station", sa.String(length=24), nullable=True))
