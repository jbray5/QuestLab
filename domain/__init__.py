"""Pydantic and SQLModel domain models. No DB sessions. No service calls."""

# Import all SQLModel table=True classes so SQLAlchemy can resolve FK
# relationships regardless of which module is imported first.
from domain.adventure import Adventure as Adventure  # noqa: F401
from domain.campaign import Campaign as Campaign  # noqa: F401
from domain.character import PlayerCharacter as PlayerCharacter  # noqa: F401
from domain.encounter import Encounter as Encounter  # noqa: F401
from domain.item import Item as Item, LootTable as LootTable  # noqa: F401
from domain.map import Map as Map, MapEdge as MapEdge, MapNode as MapNode  # noqa: F401
from domain.monster import MonsterStatBlock as MonsterStatBlock  # noqa: F401
from domain.session import Session as Session, SessionRunbook as SessionRunbook  # noqa: F401
