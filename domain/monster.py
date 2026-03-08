"""MonsterStatBlock domain model — 2024 D&D 5e monster definition."""

import uuid
from typing import Any, Optional

from pydantic import BaseModel, field_validator
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.enums import CreatureSize, CreatureType, DamageType

# Valid challenge rating values per D&D 5e
VALID_CRS = {
    "0",
    "1/8",
    "1/4",
    "1/2",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
}


class MonsterStatBlock(SQLModel, table=True):
    """MonsterStatBlock SQLModel table — 2024 5e monster definition."""

    __tablename__ = "monster_stat_blocks"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(min_length=1, max_length=200)
    source: str = Field(default="SRD", max_length=50)
    size: CreatureSize
    creature_type: CreatureType
    alignment: Optional[str] = Field(default=None, max_length=100)
    # Defence
    ac: int = Field(ge=1, le=30)
    ac_notes: Optional[str] = Field(default=None, max_length=200)
    hp_average: int = Field(ge=1)
    hp_formula: str = Field(min_length=1, max_length=50)
    # Ability scores
    score_str: int = Field(ge=1, le=30)
    score_dex: int = Field(ge=1, le=30)
    score_con: int = Field(ge=1, le=30)
    score_int: int = Field(ge=1, le=30)
    score_wis: int = Field(ge=1, le=30)
    score_cha: int = Field(ge=1, le=30)
    # CR
    challenge_rating: str = Field(max_length=5)
    xp: int = Field(ge=0)
    proficiency_bonus: int = Field(ge=2, le=9)
    languages: Optional[str] = Field(default=None, max_length=500)
    is_custom: bool = Field(default=False)
    created_by_email: Optional[str] = Field(default=None, max_length=200)
    # JSON columns
    speed: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    saving_throws: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    skills: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    senses: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    damage_resistances: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    damage_immunities: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    condition_immunities: Optional[list] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    traits: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    actions: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    bonus_actions: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    reactions: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    legendary_actions: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    lair_actions: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))


class MonsterStatBlockCreate(BaseModel):
    """Input schema for creating a monster stat block."""

    name: str
    source: str = "SRD"
    size: CreatureSize
    creature_type: CreatureType
    alignment: Optional[str] = None
    ac: int = Field(ge=1, le=30)
    ac_notes: Optional[str] = None
    hp_average: int = Field(ge=1)
    hp_formula: str
    speed: Optional[dict[str, Any]] = None
    score_str: int = Field(ge=1, le=30)
    score_dex: int = Field(ge=1, le=30)
    score_con: int = Field(ge=1, le=30)
    score_int: int = Field(ge=1, le=30)
    score_wis: int = Field(ge=1, le=30)
    score_cha: int = Field(ge=1, le=30)
    saving_throws: Optional[dict[str, Any]] = None
    skills: Optional[dict[str, Any]] = None
    damage_resistances: list[DamageType] = Field(default_factory=list)
    damage_immunities: list[DamageType] = Field(default_factory=list)
    condition_immunities: Optional[list[str]] = None
    senses: Optional[dict[str, Any]] = None
    languages: Optional[str] = None
    challenge_rating: str
    xp: int = Field(ge=0)
    proficiency_bonus: int = Field(ge=2, le=9)
    traits: Optional[list[dict[str, Any]]] = None
    actions: Optional[list[dict[str, Any]]] = None
    bonus_actions: Optional[list[dict[str, Any]]] = None
    reactions: Optional[list[dict[str, Any]]] = None
    legendary_actions: Optional[list[dict[str, Any]]] = None
    lair_actions: Optional[list[dict[str, Any]]] = None
    is_custom: bool = False
    created_by_email: Optional[str] = None

    @field_validator("challenge_rating")
    @classmethod
    def validate_cr(cls, v: str) -> str:
        """Ensure CR is a recognised D&D 5e challenge rating."""
        if v not in VALID_CRS:
            raise ValueError(f"Invalid challenge rating '{v}'")
        return v


class MonsterStatBlockRead(BaseModel):
    """Output schema for reading a monster stat block."""

    id: uuid.UUID
    name: str
    source: str
    size: CreatureSize
    creature_type: CreatureType
    alignment: Optional[str] = None
    ac: int
    ac_notes: Optional[str] = None
    hp_average: int
    hp_formula: str
    speed: Optional[dict[str, Any]] = None
    score_str: int
    score_dex: int
    score_con: int
    score_int: int
    score_wis: int
    score_cha: int
    saving_throws: Optional[dict[str, Any]] = None
    skills: Optional[dict[str, Any]] = None
    damage_resistances: list[DamageType] = Field(default_factory=list)
    damage_immunities: list[DamageType] = Field(default_factory=list)
    condition_immunities: Optional[list[str]] = None
    senses: Optional[dict[str, Any]] = None
    languages: Optional[str] = None
    challenge_rating: str
    xp: int
    proficiency_bonus: int
    traits: Optional[list[dict[str, Any]]] = None
    actions: Optional[list[dict[str, Any]]] = None
    bonus_actions: Optional[list[dict[str, Any]]] = None
    reactions: Optional[list[dict[str, Any]]] = None
    legendary_actions: Optional[list[dict[str, Any]]] = None
    lair_actions: Optional[list[dict[str, Any]]] = None
    is_custom: bool
    created_by_email: Optional[str] = None

    model_config = {"from_attributes": True}


class MonsterStatBlockUpdate(BaseModel):
    """Partial update schema for a monster stat block."""

    name: Optional[str] = None
    ac: Optional[int] = Field(default=None, ge=1, le=30)
    hp_average: Optional[int] = Field(default=None, ge=1)
    hp_formula: Optional[str] = None
    challenge_rating: Optional[str] = None
    xp: Optional[int] = Field(default=None, ge=0)
    traits: Optional[list[dict[str, Any]]] = None
    actions: Optional[list[dict[str, Any]]] = None
    bonus_actions: Optional[list[dict[str, Any]]] = None
    reactions: Optional[list[dict[str, Any]]] = None
    legendary_actions: Optional[list[dict[str, Any]]] = None
    lair_actions: Optional[list[dict[str, Any]]] = None
