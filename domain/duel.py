"""A duel that lives on the server, so everybody can be on their own phone (Plan 104).

The Practice Arena is deliberately stateless: the phone holds the whole fight as
one sealed document and the server only transforms it. That works perfectly for
one device passed round a table, and not at all for two — two copies of a fight
have no authority between them.

So a duel fought on separate devices gets a row. The rules engine is untouched:
``services/arena_service.py`` still computes every turn, and the row is only
where the document rests between them.
"""

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from pydantic import BaseModel
from pydantic import Field as PydField
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.arena import ArenaAction, ArenaState


class Duel(SQLModel, table=True):
    """One live duel: its seats, its fight, and whether it is still going."""

    __tablename__ = "duels"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    # Who called it. Only the host can pull the whole thing down.
    host_pc_id: uuid.UUID = Field(foreign_key="player_characters.id", index=True)
    # JSON list[str] of the characters in the ring — the seats. Holding one of
    # these characters' links is what lets you read and act on this duel.
    seat_ids: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # The sealed ArenaState, as JSON.
    state: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    phase: str = Field(default="live", max_length=12)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DuelSeat(BaseModel):
    """One character in a duel, for the lobby list."""

    pc_id: uuid.UUID
    name: str
    player_name: str = ""
    hp: int = 0
    hp_max: int = 0
    up: bool = False


class DuelRead(BaseModel):
    """A duel as a player's phone sees it."""

    id: uuid.UUID
    host_pc_id: uuid.UUID
    phase: str
    seats: list[DuelSeat] = PydField(default_factory=list)
    # Whose turn it is, and whether that is the phone asking.
    up_pc_id: Optional[uuid.UUID] = None
    your_turn: bool = False
    updated_at: datetime
    state: ArenaState


class DuelSummary(BaseModel):
    """A duel you have been called into, for the challenge banner."""

    id: uuid.UUID
    host_pc_id: uuid.UUID
    host_name: str = ""
    phase: str = "live"
    seats: list[str] = PydField(default_factory=list)
    your_turn: bool = False
    updated_at: datetime


class DuelStartBody(BaseModel):
    """Call out two or more characters to a duel on their own devices."""

    pc_ids: list[uuid.UUID] = PydField(min_length=2, max_length=8)


class DuelActBody(BaseModel):
    """One action in a server-held duel. The state stays on the server."""

    action: ArenaAction


def state_to_json(state: ArenaState) -> dict[str, Any]:
    """Serialize a fight for the ``duels.state`` column.

    Args:
        state: The sealed fight.

    Returns:
        A JSON-safe dict, exactly as the seal signed it.
    """
    return state.model_dump(mode="json")
