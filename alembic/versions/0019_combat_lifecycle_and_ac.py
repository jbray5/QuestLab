"""Add combat lifecycle state + persistent combatant AC (Plan 41).

``sessions.combat_state`` ('idle' | 'running' | 'ended', default 'idle')
makes the in-combat lifecycle explicit instead of inferring it from a
non-null active-combatant id. Inference caused false "it's your turn" pings
to player phones (auto-reseed after End Combat) and stale-combat leaks
across sessions. ``session_combatants.ac`` persists a combatant's armor
class so a mid-combat browser refresh no longer resets monster AC to a
default.

Both columns are additive: combat_state has a server_default so existing
rows backfill to 'idle'; ac is nullable.

Revision ID: 0019
Revises: 0018
Create Date: 2026-07-03
"""

import sqlalchemy as sa

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add sessions.combat_state and session_combatants.ac."""
    op.add_column(
        "sessions",
        sa.Column("combat_state", sa.String(length=20), nullable=False, server_default="idle"),
    )
    op.add_column(
        "session_combatants",
        sa.Column("ac", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Drop session_combatants.ac and sessions.combat_state."""
    op.drop_column("session_combatants", "ac")
    op.drop_column("sessions", "combat_state")
