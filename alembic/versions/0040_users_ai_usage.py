"""Users + AI usage (Plan 73 — publishable QuestLab).

Adds ``users`` (OAuth-backed accounts keyed by email, Patreon membership
snapshot) and ``ai_usage`` (per-user, per-day generation counters).

Revision ID: 0040
Revises: 0039
"""

import sqlalchemy as sa

from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create users and ai_usage."""
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("avatar_url", sa.String(length=1000), nullable=True),
        sa.Column("discord_id", sa.String(length=64), nullable=True),
        sa.Column("patreon_id", sa.String(length=64), nullable=True),
        sa.Column("patron_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("patron_tier_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("patron_checked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_discord_id", "users", ["discord_id"])
    op.create_index("ix_users_patreon_id", "users", ["patreon_id"])
    op.create_table(
        "ai_usage",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("day", sa.String(length=10), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_ai_usage_email", "ai_usage", ["email"])
    op.create_index("ix_ai_usage_day", "ai_usage", ["day"])


def downgrade() -> None:
    """Drop ai_usage and users."""
    op.drop_index("ix_ai_usage_day", table_name="ai_usage")
    op.drop_index("ix_ai_usage_email", table_name="ai_usage")
    op.drop_table("ai_usage")
    op.drop_index("ix_users_patreon_id", table_name="users")
    op.drop_index("ix_users_discord_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
