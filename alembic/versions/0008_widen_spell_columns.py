"""Widen spell text columns to fit verbatim SRD entries.

Plan 00017 follow-up — the SRD 5.2.1 has long reaction-trigger descriptions
in casting_time (e.g. Counterspell: 167 chars) and long range descriptions
(e.g. "Self (60-foot cone)"). Migration 0007 sized these conservatively
for the printed-block form; this widens them.

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Widen casting_time, range, components_m, and duration columns."""
    with op.batch_alter_table("spells") as batch:
        batch.alter_column("casting_time", type_=sa.String(length=400))
        batch.alter_column("range", type_=sa.String(length=120))
        batch.alter_column("components_m", type_=sa.String(length=600))
        batch.alter_column("duration", type_=sa.String(length=120))


def downgrade() -> None:
    """Restore the narrower column sizes from 0007.

    Note: rows containing wider text will fail to fit. Run a cleanup pass
    before downgrading in production.
    """
    with op.batch_alter_table("spells") as batch:
        batch.alter_column("casting_time", type_=sa.String(length=60))
        batch.alter_column("range", type_=sa.String(length=60))
        batch.alter_column("components_m", type_=sa.String(length=300))
        batch.alter_column("duration", type_=sa.String(length=60))
