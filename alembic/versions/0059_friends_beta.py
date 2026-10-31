"""The friends beta (Plan 125): invite codes and feedback.

Adds ``beta_invites`` (personal invite codes with a use limit), ``feedback``
(notes DMs send from the app) and ``users.invite_code`` (which invite started
an account). Additive only.

Revision ID: 0059
Revises: 0058
"""

import sqlalchemy as sa

from alembic import op

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create beta_invites and feedback; add users.invite_code."""
    op.create_table(
        "beta_invites",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("uses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_email", sa.String(length=320), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_beta_invites_code", "beta_invites", ["code"], unique=True)
    op.create_table(
        "feedback",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="idea"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("page", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("viewport", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("seen", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_feedback_email", "feedback", ["email"])
    op.add_column("users", sa.Column("invite_code", sa.String(length=40), nullable=True))
    op.create_index("ix_users_invite_code", "users", ["invite_code"])


def downgrade() -> None:
    """Drop the beta tables and users.invite_code."""
    op.drop_index("ix_users_invite_code", table_name="users")
    op.drop_column("users", "invite_code")
    op.drop_index("ix_feedback_email", table_name="feedback")
    op.drop_table("feedback")
    op.drop_index("ix_beta_invites_code", table_name="beta_invites")
    op.drop_table("beta_invites")
