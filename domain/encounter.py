"""Encounter domain model — combat or social challenge within an Adventure."""

import uuid
from typing import Any, Optional

from pydantic import BaseModel, field_validator
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.enums import EncounterDifficulty


class Encounter(SQLModel, table=True):
    """Encounter SQLModel table — belongs to an Adventure."""

    __tablename__ = "encounters"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    adventure_id: uuid.UUID = Field(foreign_key="adventures.id", index=True)
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    difficulty: EncounterDifficulty = Field(default=EncounterDifficulty.MODERATE)
    xp_budget: int = Field(ge=0)
    terrain_notes: Optional[str] = None
    read_aloud_text: Optional[str] = None
    dm_notes: Optional[str] = None
    reward_xp: int = Field(default=0, ge=0)
    loot_table_id: Optional[uuid.UUID] = Field(default=None, foreign_key="loot_tables.id")
    # JSON column
    monster_roster: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))


class EncounterCreate(BaseModel):
    """Input schema for creating an encounter."""

    adventure_id: uuid.UUID
    name: str
    description: Optional[str] = None
    difficulty: EncounterDifficulty = EncounterDifficulty.MODERATE
    xp_budget: int = Field(default=0, ge=0)
    monster_roster: list[dict[str, Any]] = Field(default_factory=list)
    terrain_notes: Optional[str] = None
    read_aloud_text: Optional[str] = None
    dm_notes: Optional[str] = None
    reward_xp: int = Field(default=0, ge=0)
    loot_table_id: Optional[uuid.UUID] = None

    @field_validator("monster_roster")
    @classmethod
    def validate_roster(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Each roster entry must have monster_id and count >= 1."""
        for entry in v:
            if "monster_id" not in entry:
                raise ValueError("Each monster_roster entry must include 'monster_id'")
            if "count" not in entry or int(entry["count"]) < 1:
                raise ValueError("Each monster_roster entry must have count >= 1")
        return v


class EncounterRead(BaseModel):
    """Output schema for reading an encounter."""

    id: uuid.UUID
    adventure_id: uuid.UUID
    name: str
    description: Optional[str] = None
    difficulty: EncounterDifficulty
    xp_budget: int
    monster_roster: list[dict[str, Any]] = Field(default_factory=list)
    terrain_notes: Optional[str] = None
    read_aloud_text: Optional[str] = None
    dm_notes: Optional[str] = None
    reward_xp: int
    loot_table_id: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}


class EncounterUpdate(BaseModel):
    """Partial update schema for an encounter."""

    name: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[EncounterDifficulty] = None
    xp_budget: Optional[int] = Field(default=None, ge=0)
    monster_roster: Optional[list[dict[str, Any]]] = None
    terrain_notes: Optional[str] = None
    read_aloud_text: Optional[str] = None
    dm_notes: Optional[str] = None
    reward_xp: Optional[int] = Field(default=None, ge=0)
    loot_table_id: Optional[uuid.UUID] = None
