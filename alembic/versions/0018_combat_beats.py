"""Add combat_beats table (Plan 40 Change 3 — state-triggered beats).

A combat_beat is attached either to a single combatant (HP threshold) or
to a session as a whole (round threshold). When the trigger condition is
met the beat fires; the DM dismisses it once delivered. Session-scoped,
not preserved across sessions.

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-19
"""

import sqlalchemy as sa

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the combat_beats table."""
    op.create_table(
        "combat_beats",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column(
            "session_id",
            sa.UUID(),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "combatant_id",
            sa.UUID(),
            sa.ForeignKey("session_combatants.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("trigger_kind", sa.String(length=20), nullable=False),
        sa.Column("trigger_value", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_combat_beats_session_id", "combat_beats", ["session_id"]
    )


def downgrade() -> None:
    """Drop the combat_beats table."""
    op.drop_index("ix_combat_beats_session_id", table_name="combat_beats")
    op.drop_table("combat_beats")
