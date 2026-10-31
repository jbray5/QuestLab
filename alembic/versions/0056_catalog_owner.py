"""Catalog ownership (SEC-003).

Adds ``created_by_email`` to items and spells (monsters already have it). A DM's
homebrew row is stamped with their email; rows with no owner are the shared SRD
catalog and only an admin can change them. Nullable: every existing row becomes
a shared row, which is what they were.

Revision ID: 0056
Revises: 0055
"""

import sqlalchemy as sa

from alembic import op

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add created_by_email (nullable, indexed) to items and spells."""
    for table in ("items", "spells"):
        op.add_column(table, sa.Column("created_by_email", sa.String(length=200), nullable=True))
        op.create_index(f"ix_{table}_created_by_email", table, ["created_by_email"])


def downgrade() -> None:
    """Drop created_by_email from items and spells."""
    for table in ("items", "spells"):
        op.drop_index(f"ix_{table}_created_by_email", table_name=table)
        op.drop_column(table, "created_by_email")
