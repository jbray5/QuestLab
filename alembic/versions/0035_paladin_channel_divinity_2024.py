"""Channel Divinity + Second Wind — 2024 PHB recovery numbers.

Data-only migration. The seeded catalog carried 2014-era recovery:
- Paladin Channel Divinity: 1 use (2024 grants 2 at level 3)
- All three "regain one on a short rest, all on a long rest" features
  (Paladin/Cleric Channel Divinity, Fighter Second Wind) were tagged
  recovery=SHORT, which refills EVERYTHING on a short rest.

The new RecoveryType.SHORT_ONE models the 2024 pattern. seed_catalog()
only fires on an empty table, so existing databases need these UPDATEs.

Revision ID: 0035
Revises: 0034
"""

import sqlalchemy as sa

from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None

_PALADIN_CD = "Channel Divinity (Paladin)"

_PALADIN_CD_DESCRIPTION_2024 = (
    "Use Divine Sense (Bonus Action: detect Celestials, Fiends, and Undead within "
    "60 ft for 10 minutes) or one of your subclass's Channel Divinity options. "
    "2024 RAW: regain one use on a short rest, all uses on a long rest."
)

_PALADIN_CD_DESCRIPTION_OLD = (
    "Use one of your subclass's Channel Divinity options. Recharges on short or long rest."
)

_CLERIC_CD_DESCRIPTION_2024 = (
    "Use a Channel Divinity option (Turn Undead at L2; others granted by subclass). "
    "2024 RAW: regain one use on a short rest, all uses on a long rest."
)

_CLERIC_CD_DESCRIPTION_OLD = (
    "Use a Channel Divinity option (Turn Undead at L2; others granted by subclass). "
    "Uses recharge on short or long rest."
)

_SECOND_WIND_DESCRIPTION_2024 = (
    "Bonus action: regain Hit Points equal to 1d10 + Fighter level. Two uses. "
    "2024 RAW: regain one use on a short rest, all uses on a long rest."
)

_SECOND_WIND_DESCRIPTION_OLD = (
    "Bonus action: regain Hit Points equal to 1d10 + Fighter level. Two uses, recharging "
    "on short or long rest."
)


def _update(name: str, character_class: str, **values: str) -> None:
    """Apply a name+class-scoped UPDATE to class_features."""
    assignments = ", ".join(f"{col} = :{col}" for col in values)
    op.execute(
        sa.text(
            f"UPDATE class_features SET {assignments} "  # noqa: S608 — cols are literals
            "WHERE name = :name AND character_class = :character_class"
        ).bindparams(name=name, character_class=character_class, **values)
    )


def upgrade() -> None:
    """Apply the 2024 PHB use-counts and SHORT_ONE recovery."""
    _update(
        _PALADIN_CD,
        "PALADIN",
        uses_formula="FIXED_2",
        recovery="SHORT_ONE",
        description=_PALADIN_CD_DESCRIPTION_2024,
    )
    _update(
        "Channel Divinity",
        "CLERIC",
        recovery="SHORT_ONE",
        description=_CLERIC_CD_DESCRIPTION_2024,
    )
    _update(
        "Second Wind",
        "FIGHTER",
        recovery="SHORT_ONE",
        description=_SECOND_WIND_DESCRIPTION_2024,
    )


def downgrade() -> None:
    """Revert to the pre-2024 recovery values."""
    _update(
        _PALADIN_CD,
        "PALADIN",
        uses_formula="FIXED_1",
        recovery="SHORT",
        description=_PALADIN_CD_DESCRIPTION_OLD,
    )
    _update(
        "Channel Divinity",
        "CLERIC",
        recovery="SHORT",
        description=_CLERIC_CD_DESCRIPTION_OLD,
    )
    _update(
        "Second Wind",
        "FIGHTER",
        recovery="SHORT",
        description=_SECOND_WIND_DESCRIPTION_OLD,
    )
