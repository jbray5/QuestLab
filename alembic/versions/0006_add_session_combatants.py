"""Add session_combatants table and combat_* columns to sessions.

Plan 00015 — persists the live initiative tracker so a browser refresh
during play does not wipe combatants, HP, or round state.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create session_combatants table and add combat_* columns to sessions."""
    op.create_table(
        "session_combatants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", name="fk_session_combatants_session_id"),
            nullable=False,
        ),
        sa.Column("sort_index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("dex_score", sa.Integer(), nullable=False),
        sa.Column("initiative_roll", sa.Integer(), nullable=False),
        sa.Column("hp_current", sa.Integer(), nullable=False),
        sa.Column("hp_max", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("defeated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("monster_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("conditions", sa.JSON(), nullable=True),
    )
    op.create_index(
        "ix_session_combatants_session_id",
        "session_combatants",
        ["session_id"],
    )

    op.add_column(
        "sessions",
        sa.Column(
            "combat_round",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )
    op.add_column(
        "sessions",
        sa.Column(
            "combat_active_combatant_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Drop session_combatants table and remove combat_* columns from sessions."""
    op.drop_column("sessions", "combat_active_combatant_id")
    op.drop_column("sessions", "combat_round")
    op.drop_index("ix_session_combatants_session_id", table_name="session_combatants")
    op.drop_table("session_combatants")
