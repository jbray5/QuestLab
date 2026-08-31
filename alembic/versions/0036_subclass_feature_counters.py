"""Seed the Session-6 subclass feature counters into existing catalogs.

Data-only migration. seed_catalog() only fires on an empty table, so
already-seeded databases need INSERTs for the two new rows:

- Psionic Energy Dice (Rogue / Soulknife, L3): 2 × prof bonus d6 pool,
  regain one on a short rest, all on a long rest (2024 PHB).
- Star Map — Free Guiding Bolt (Druid / Circle of Stars, L3): prof-bonus
  free casts per long rest.

Revision ID: 0036
Revises: 0035
"""

import sqlalchemy as sa

from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None

_ROWS = [
    {
        "name": "Psionic Energy Dice",
        "character_class": "ROGUE",
        "subclass": "Soulknife",
        "level_acquired": 3,
        "recovery": "SHORT_ONE",
        "uses_formula": "PROF_X2",
        "description": (
            "Pool of 2 × proficiency bonus d6s (d8 at L5, d10 at L11, d12 at L17) fueling "
            "Psi-Bolstered Knack and Psychic Whispers. 2024 RAW: regain one die on a short "
            "rest, all on a long rest; also a Bonus Action regains one die, once per "
            "short/long rest."
        ),
    },
    {
        "name": "Star Map — Free Guiding Bolt",
        "character_class": "DRUID",
        "subclass": "Circle of Stars",
        "level_acquired": 3,
        "recovery": "LONG",
        "uses_formula": "PROF_BONUS",
        "description": (
            "Cast Guiding Bolt without expending a spell slot, proficiency-bonus times per "
            "long rest. (Star Map also keeps Guidance and Guiding Bolt always prepared.)"
        ),
    },
]


def upgrade() -> None:
    """Insert each catalog row unless a same-name row already exists."""
    for row in _ROWS:
        op.execute(
            sa.text(
                "INSERT INTO class_features "
                "(id, name, character_class, subclass, level_acquired, recovery, "
                " uses_formula, description, source) "
                "SELECT gen_random_uuid(), :name, :character_class, :subclass, "
                ":level_acquired, :recovery, :uses_formula, :description, "
                "'SRD 5.5e / 2024 PHB' "
                "WHERE NOT EXISTS "
                "(SELECT 1 FROM class_features WHERE name = :name)"
            ).bindparams(**row)
        )


def downgrade() -> None:
    """Remove the two rows (and any per-PC counters hanging off them).

    Deliberate data loss: per-PC uses_spent tracked against these features
    is deleted with them. Do not downgrade past 0036 after live play has
    used these counters.
    """
    for row in _ROWS:
        op.execute(
            sa.text(
                "DELETE FROM character_features WHERE feature_id IN "
                "(SELECT id FROM class_features WHERE name = :name)"
            ).bindparams(name=row["name"])
        )
        op.execute(
            sa.text("DELETE FROM class_features WHERE name = :name").bindparams(name=row["name"])
        )
