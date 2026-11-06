"""Character claims: the party's join list stops opening a character a player has (Plan 139).

Adds ``claimed_at`` to ``player_characters``. Additive and nullable.

Existing characters with a real player name count as claimed from now on, so nobody can open them
from the list between this deploy and their player's next visit. One still "Not assigned yet" stays
open: it has no player to protect, and the phone asks for a name the first time it's opened. A DM
can reopen any character from its link button.

Revision ID: 0067
Revises: 0066
"""

import sqlalchemy as sa

from alembic import op

revision = "0067"
down_revision = "0066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the column, and mark the characters that already have a player."""
    op.add_column(
        "player_characters", sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        "UPDATE player_characters SET claimed_at = now()"
        " WHERE player_name IS NOT NULL"
        " AND btrim(player_name) <> ''"
        " AND lower(btrim(player_name)) <> 'not assigned yet'"
    )


def downgrade() -> None:
    """Drop it. The list goes back to opening every character. Never downgrade prod."""
    op.drop_column("player_characters", "claimed_at")
