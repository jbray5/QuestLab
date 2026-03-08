"""Map domain models — node-graph dungeon and overworld maps."""

import uuid
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Field, SQLModel

from domain.enums import MapNodeType


class MapBase(SQLModel):
    """Shared fields for Map create and read schemas."""

    name: str = Field(min_length=1, max_length=200)
    grid_width: int = Field(default=20, ge=5, le=100)
    grid_height: int = Field(default=20, ge=5, le=100)
    background_color: str = Field(default="#1a1a2e", max_length=20)


class Map(MapBase, table=True):
    """Map SQLModel table — belongs to an Adventure."""

    __tablename__ = "maps"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    adventure_id: uuid.UUID = Field(foreign_key="adventures.id", index=True)


class MapCreate(MapBase):
    """Input schema for creating a map."""

    adventure_id: uuid.UUID


class MapRead(MapBase):
    """Output schema for reading a map."""

    id: uuid.UUID
    adventure_id: uuid.UUID

    model_config = {"from_attributes": True}


class MapUpdate(BaseModel):
    """Partial update schema for a map."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    grid_width: Optional[int] = Field(default=None, ge=5, le=100)
    grid_height: Optional[int] = Field(default=None, ge=5, le=100)
    background_color: Optional[str] = Field(default=None, max_length=20)


class MapNodeBase(SQLModel):
    """Shared fields for MapNode create and read schemas."""

    label: str = Field(min_length=1, max_length=100)
    node_type: MapNodeType
    x: int = Field(ge=0, description="Grid column position")
    y: int = Field(ge=0, description="Grid row position")
    description: Optional[str] = None
    encounter_id: Optional[uuid.UUID] = Field(default=None, foreign_key="encounters.id")
    loot_table_id: Optional[uuid.UUID] = Field(default=None, foreign_key="loot_tables.id")
    notes: Optional[str] = None


class MapNode(MapNodeBase, table=True):
    """MapNode SQLModel table — a single node on a Map."""

    __tablename__ = "map_nodes"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    map_id: uuid.UUID = Field(foreign_key="maps.id", index=True)


class MapNodeCreate(MapNodeBase):
    """Input schema for creating a map node."""

    map_id: uuid.UUID


class MapNodeRead(MapNodeBase):
    """Output schema for reading a map node."""

    id: uuid.UUID
    map_id: uuid.UUID

    model_config = {"from_attributes": True}


class MapNodeUpdate(BaseModel):
    """Partial update schema for a map node."""

    label: Optional[str] = Field(default=None, min_length=1, max_length=100)
    node_type: Optional[MapNodeType] = None
    x: Optional[int] = Field(default=None, ge=0)
    y: Optional[int] = Field(default=None, ge=0)
    description: Optional[str] = None
    encounter_id: Optional[uuid.UUID] = None
    loot_table_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class MapEdgeBase(SQLModel):
    """Shared fields for MapEdge create and read schemas."""

    from_node_id: uuid.UUID = Field(foreign_key="map_nodes.id")
    to_node_id: uuid.UUID = Field(foreign_key="map_nodes.id")
    label: Optional[str] = Field(default=None, max_length=100)
    is_secret: bool = Field(default=False, description="Hidden passage not shown to players")


class MapEdge(MapEdgeBase, table=True):
    """MapEdge SQLModel table — a directed connection between two MapNodes."""

    __tablename__ = "map_edges"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    map_id: uuid.UUID = Field(foreign_key="maps.id", index=True)


class MapEdgeCreate(MapEdgeBase):
    """Input schema for creating a map edge."""

    map_id: uuid.UUID


class MapEdgeRead(MapEdgeBase):
    """Output schema for reading a map edge."""

    id: uuid.UUID
    map_id: uuid.UUID

    model_config = {"from_attributes": True}


class MapEdgeUpdate(BaseModel):
    """Partial update schema for a map edge."""

    label: Optional[str] = Field(default=None, max_length=100)
    is_secret: Optional[bool] = None
