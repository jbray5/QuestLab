"""Side quests: DM-written quests players finish on their phones (Plan 136).

Creates ``side_quests`` (owned by a campaign; ``steps`` is the JSON documented in
``domain/side_quest.py``) and ``side_quest_runs`` (one character's private run, unique per quest
and character). Additive only: no existing table changes.

Revision ID: 0065
Revises: 0064
"""

import sqlalchemy as sa

from alembic import op

revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create side_quests and side_quest_runs, with their indexes."""
    op.create_table(
        "side_quests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id", name="fk_side_quests_campaign_id"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("teaser", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("start_step", sa.String(length=40), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_side_quests_campaign_id", "side_quests", ["campaign_id"])
    op.create_table(
        "side_quest_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "quest_id",
            sa.Uuid(),
            sa.ForeignKey("side_quests.id", name="fk_side_quest_runs_quest_id"),
            nullable=False,
        ),
        sa.Column(
            "character_id",
            sa.Uuid(),
            sa.ForeignKey("player_characters.id", name="fk_side_quest_runs_character_id"),
            nullable=False,
        ),
        sa.Column("step_id", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="new"),
        sa.Column("log", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("quest_id", "character_id", name="uq_side_quest_runs_quest_character"),
    )
    op.create_index("ix_side_quest_runs_quest_id", "side_quest_runs", ["quest_id"])
    op.create_index("ix_side_quest_runs_character_id", "side_quest_runs", ["character_id"])


def downgrade() -> None:
    """Drop both tables.

    Lossy: quests and their logs are deleted. Gold and items already paid stay on the sheets.
    Never downgrade prod.
    """
    op.drop_index("ix_side_quest_runs_character_id", table_name="side_quest_runs")
    op.drop_index("ix_side_quest_runs_quest_id", table_name="side_quest_runs")
    op.drop_table("side_quest_runs")
    op.drop_index("ix_side_quests_campaign_id", table_name="side_quests")
    op.drop_table("side_quests")
