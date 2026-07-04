"""Add session_briefs table (Plan 43 — generate_dm_brief).

One glanceable DM brief per session (1:1): cold open, premise, danger dial,
fallback, plus JSON lists for beats (with machine triggers), NPC play-faces,
per-PC spotlight cues, and open-ending "roads". The generated, reusable form of
the session-2 run-sheet.

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-04
"""

import sqlalchemy as sa

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the session_briefs table."""
    op.create_table(
        "session_briefs",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "session_id",
            sa.Uuid(),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("model_used", sa.String(length=100), nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("cold_open", sa.Text(), nullable=False, server_default=""),
        sa.Column("premise", sa.Text(), nullable=False, server_default=""),
        sa.Column("danger_dial", sa.Text(), nullable=False, server_default=""),
        sa.Column("fallback", sa.Text(), nullable=True),
        sa.Column("beats", sa.JSON(), nullable=True),
        sa.Column("npc_faces", sa.JSON(), nullable=True),
        sa.Column("spotlight", sa.JSON(), nullable=True),
        sa.Column("roads", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    """Drop the session_briefs table."""
    op.drop_table("session_briefs")
