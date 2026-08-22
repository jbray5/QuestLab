"""Paladin Channel Divinity — 2 uses at L3 per the 2024 PHB.

Data-only migration. The seeded catalog row carried the 2014 numbers
(1 use, scaling at L11/L17); the 2024 PHB gives Paladins two uses of
Channel Divinity at level 3 (regain one on a short rest, all on a long
rest), with Divine Sense as an always-available option. seed_catalog()
only fires on an empty table, so existing databases need this UPDATE.

Revision ID: 0035
Revises: 0034
"""

import sqlalchemy as sa

from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None

_FEATURE_NAME = "Channel Divinity (Paladin)"

_DESCRIPTION_2024 = (
    "Use Divine Sense (Bonus Action: detect Celestials, Fiends, and Undead within "
    "60 ft for 10 minutes) or one of your subclass's Channel Divinity options. "
    "2024 RAW: regain one use on a short rest, all uses on a long rest."
)

_DESCRIPTION_OLD = (
    "Use one of your subclass's Channel Divinity options. Recharges on short or long rest."
)


def upgrade() -> None:
    """Set the Paladin Channel Divinity row to 2 uses + the 2024 description."""
    op.execute(
        sa.text(
            "UPDATE class_features "
            "SET uses_formula = 'FIXED_2', description = :description "
            "WHERE name = :name AND character_class = 'PALADIN'"
        ).bindparams(description=_DESCRIPTION_2024, name=_FEATURE_NAME)
    )


def downgrade() -> None:
    """Revert the Paladin Channel Divinity row to the pre-2024 values."""
    op.execute(
        sa.text(
            "UPDATE class_features "
            "SET uses_formula = 'FIXED_1', description = :description "
            "WHERE name = :name AND character_class = 'PALADIN'"
        ).bindparams(description=_DESCRIPTION_OLD, name=_FEATURE_NAME)
    )
