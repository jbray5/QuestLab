"""Pydantic and SQLModel domain models. No DB sessions. No service calls."""

# Import all SQLModel table=True classes so SQLAlchemy can resolve FK
# relationships regardless of which module is imported first.
from domain.adventure import Adventure as Adventure  # noqa: F401
from domain.battle_map import BattleMap as BattleMap  # noqa: F401
from domain.campaign import Campaign as Campaign  # noqa: F401
from domain.character import CharacterFeature as CharacterFeature  # noqa: F401
from domain.character import CharacterItem as CharacterItem  # noqa: F401
from domain.character import CharacterSpell as CharacterSpell  # noqa: F401
from domain.character import ClassFeature as ClassFeature  # noqa: F401
from domain.character import PlayerCharacter as PlayerCharacter  # noqa: F401
from domain.combat_beat import CombatBeat as CombatBeat  # noqa: F401
from domain.encounter import Encounter as Encounter  # noqa: F401
from domain.item import Item as Item  # noqa: F401
from domain.item import LootTable as LootTable  # noqa: F401
from domain.map import Map as Map  # noqa: F401
from domain.map import MapEdge as MapEdge  # noqa: F401
from domain.map import MapNode as MapNode  # noqa: F401
from domain.monster import MonsterStatBlock as MonsterStatBlock  # noqa: F401
from domain.npc import Npc as Npc  # noqa: F401
from domain.session import Session as Session  # noqa: F401
from domain.session import SessionRunbook as SessionRunbook  # noqa: F401
from domain.session_brief import SessionBrief as SessionBrief  # noqa: F401
from domain.shop import Shop as Shop  # noqa: F401
from domain.shop import ShopItem as ShopItem  # noqa: F401
from domain.spell import Spell as Spell  # noqa: F401
from domain.table_state import TableState as TableState  # noqa: F401
