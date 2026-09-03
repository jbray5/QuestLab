"""Email + password accounts (Plan 73b).

Adds ``password_hash`` to users so a DM can sign up with a name, email and
password without any third-party OAuth app configured.

Revision ID: 0041
Revises: 0040
"""

import sqlalchemy as sa

from alembic import op

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the nullable password_hash column."""
    op.add_column("users", sa.Column("password_hash", sa.String(length=300), nullable=True))


def downgrade() -> None:
    """Drop password_hash."""
    op.drop_column("users", "password_hash")
