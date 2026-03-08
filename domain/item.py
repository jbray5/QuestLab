"""Item and LootTable domain models — magic items and loot generation."""

import uuid
from typing import Any, Optional

from pydantic import BaseModel
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.enums import AdventureTier, ItemRarity


class Item(SQLModel, table=True):
    """Item SQLModel table — magic and mundane items."""

    __tablename__ = "items"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(min_length=1, max_length=200)
    rarity: ItemRarity
    item_type: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    attunement_required: bool = Field(default=False)
    value_gp: int = Field(default=0, ge=0)
    is_magic: bool = Field(default=False)
    # JSON column
    properties: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))


class ItemCreate(BaseModel):
    """Input schema for creating an item."""

    name: str
    rarity: ItemRarity
    item_type: str
    description: Optional[str] = None
    attunement_required: bool = False
    properties: Optional[dict[str, Any]] = None
    value_gp: int = Field(default=0, ge=0)
    is_magic: bool = False


class ItemRead(BaseModel):
    """Output schema for reading an item."""

    id: uuid.UUID
    name: str
    rarity: ItemRarity
    item_type: str
    description: Optional[str] = None
    attunement_required: bool
    properties: Optional[dict[str, Any]] = None
    value_gp: int
    is_magic: bool

    model_config = {"from_attributes": True}


class ItemUpdate(BaseModel):
    """Partial update schema for an item."""

    name: Optional[str] = None
    rarity: Optional[ItemRarity] = None
    item_type: Optional[str] = None
    description: Optional[str] = None
    attunement_required: Optional[bool] = None
    properties: Optional[dict[str, Any]] = None
    value_gp: Optional[int] = Field(default=None, ge=0)
    is_magic: Optional[bool] = None


class LootTable(SQLModel, table=True):
    """LootTable SQLModel table — randomisable loot for an adventure."""

    __tablename__ = "loot_tables"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    adventure_id: uuid.UUID = Field(foreign_key="adventures.id", index=True)
    name: str = Field(min_length=1, max_length=200)
    tier: AdventureTier
    # JSON column
    entries: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))


class LootTableCreate(BaseModel):
    """Input schema for creating a loot table."""

    adventure_id: uuid.UUID
    name: str
    tier: AdventureTier
    entries: list[dict[str, Any]] = Field(default_factory=list)


class LootTableRead(BaseModel):
    """Output schema for reading a loot table."""

    id: uuid.UUID
    adventure_id: uuid.UUID
    name: str
    tier: AdventureTier
    entries: list[dict[str, Any]] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class LootTableUpdate(BaseModel):
    """Partial update schema for a loot table."""

    name: Optional[str] = None
    tier: Optional[AdventureTier] = None
    entries: Optional[list[dict[str, Any]]] = None
