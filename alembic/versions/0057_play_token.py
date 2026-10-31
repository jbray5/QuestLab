"""Per-PC player-link tokens (SEC-002).

A player's link used to be ``/play/{pc_id}``: the character's UUID was the
secret, but UUIDs show up in the projector feed, the join roster and party
lists, and a link could never be taken back. Each PC now has an unguessable
``play_token`` (the new link) that the DM can reset.

Existing PCs keep opening by UUID until ``legacy_uuid_until`` (2026-12-01 UTC)
so the links already in players' hands keep working while the app upgrades
them; a reset ends that at once. New PCs never open by UUID.

Revision ID: 0057
Revises: 0056
"""

import secrets
from datetime import datetime, timezone

import sqlalchemy as sa

from alembic import op

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None

_GRACE_UNTIL = datetime(2026, 12, 1, tzinfo=timezone.utc)


def upgrade() -> None:
    """Add play_token + legacy_uuid_until, give every existing PC a token and the grace period."""
    op.add_column("player_characters", sa.Column("play_token", sa.String(length=64), nullable=True))
    op.add_column(
        "player_characters",
        sa.Column("legacy_uuid_until", sa.DateTime(timezone=True), nullable=True),
    )
    bind = op.get_bind()
    pcs = sa.table(
        "player_characters",
        sa.column("id", sa.Uuid()),
        sa.column("play_token", sa.String()),
        sa.column("legacy_uuid_until", sa.DateTime(timezone=True)),
    )
    for (pc_id,) in bind.execute(sa.select(pcs.c.id)).all():
        bind.execute(
            pcs.update()
            .where(pcs.c.id == pc_id)
            .values(play_token=secrets.token_urlsafe(16), legacy_uuid_until=_GRACE_UNTIL)
        )
    op.create_index(
        "ix_player_characters_play_token", "player_characters", ["play_token"], unique=True
    )


def downgrade() -> None:
    """Drop the token columns (links go back to UUIDs)."""
    op.drop_index("ix_player_characters_play_token", table_name="player_characters")
    op.drop_column("player_characters", "legacy_uuid_until")
    op.drop_column("player_characters", "play_token")
