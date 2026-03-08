"""PlayerCharacter domain model — full 2024 D&D 5e character sheet."""

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.enums import AbilityScore, CharacterClass


def proficiency_bonus(level: int) -> int:
    """Compute proficiency bonus from character level per 2024 rules."""
    return (level - 1) // 4 + 2


class PlayerCharacter(SQLModel, table=True):
    """PlayerCharacter SQLModel table — full 2024 5e character sheet per campaign."""

    __tablename__ = "player_characters"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    # Identity
    player_name: str = Field(min_length=1, max_length=100)
    character_name: str = Field(min_length=1, max_length=100)
    race: str = Field(min_length=1, max_length=100)
    character_class: CharacterClass
    subclass: Optional[str] = Field(default=None, max_length=100)
    level: int = Field(ge=1, le=20)
    background: Optional[str] = Field(default=None, max_length=100)
    alignment: Optional[str] = Field(default=None, max_length=50)
    # Ability scores
    score_str: int = Field(ge=1, le=30)
    score_dex: int = Field(ge=1, le=30)
    score_con: int = Field(ge=1, le=30)
    score_int: int = Field(ge=1, le=30)
    score_wis: int = Field(ge=1, le=30)
    score_cha: int = Field(ge=1, le=30)
    # Combat
    hp_max: int = Field(ge=1)
    hp_current: int = Field(ge=0)
    ac: int = Field(ge=1, le=30)
    speed: int = Field(ge=0)
    portrait_url: Optional[str] = Field(default=None, max_length=500)
    backstory: Optional[str] = None
    notes: Optional[str] = None
    # JSON columns for complex fields
    saving_throw_proficiencies: Optional[list] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    skill_proficiencies: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    feats: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    equipment: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    spells_known: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    spell_slots: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PlayerCharacterCreate(BaseModel):
    """Input schema for creating a new player character."""

    campaign_id: uuid.UUID
    player_name: str
    character_name: str
    race: str
    character_class: CharacterClass
    subclass: Optional[str] = None
    level: int = Field(ge=1, le=20)
    background: Optional[str] = None
    alignment: Optional[str] = None
    score_str: int = Field(ge=1, le=30)
    score_dex: int = Field(ge=1, le=30)
    score_con: int = Field(ge=1, le=30)
    score_int: int = Field(ge=1, le=30)
    score_wis: int = Field(ge=1, le=30)
    score_cha: int = Field(ge=1, le=30)
    hp_max: int = Field(ge=1)
    hp_current: int = Field(ge=0)
    ac: int = Field(ge=1, le=30)
    speed: int = Field(default=30, ge=0)
    saving_throw_proficiencies: list[AbilityScore] = Field(default_factory=list)
    skill_proficiencies: Optional[dict[str, Any]] = None
    feats: Optional[list[str]] = None
    equipment: Optional[list[dict[str, Any]]] = None
    spells_known: Optional[list[dict[str, Any]]] = None
    spell_slots: Optional[dict[str, Any]] = None
    backstory: Optional[str] = None
    notes: Optional[str] = None
    portrait_url: Optional[str] = None

    @field_validator("hp_current")
    @classmethod
    def validate_hp_current(cls, v: int, info: Any) -> int:
        """hp_current must not exceed hp_max."""
        hp_max = info.data.get("hp_max")
        if hp_max is not None and v > hp_max:
            raise ValueError(f"hp_current ({v}) cannot exceed hp_max ({hp_max})")
        return v


class PlayerCharacterRead(BaseModel):
    """Output schema for reading a player character, includes computed fields."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    player_name: str
    character_name: str
    race: str
    character_class: CharacterClass
    subclass: Optional[str] = None
    level: int
    background: Optional[str] = None
    alignment: Optional[str] = None
    score_str: int
    score_dex: int
    score_con: int
    score_int: int
    score_wis: int
    score_cha: int
    hp_max: int
    hp_current: int
    ac: int
    speed: int
    saving_throw_proficiencies: list[AbilityScore] = Field(default_factory=list)
    skill_proficiencies: Optional[dict[str, Any]] = None
    feats: Optional[list[str]] = None
    equipment: Optional[list[dict[str, Any]]] = None
    spells_known: Optional[list[dict[str, Any]]] = None
    spell_slots: Optional[dict[str, Any]] = None
    backstory: Optional[str] = None
    notes: Optional[str] = None
    portrait_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @property
    def computed_proficiency_bonus(self) -> int:
        """Proficiency bonus derived from level per 2024 rules."""
        return proficiency_bonus(self.level)


class PlayerCharacterUpdate(BaseModel):
    """Partial update schema for a player character."""

    player_name: Optional[str] = None
    character_name: Optional[str] = None
    race: Optional[str] = None
    character_class: Optional[CharacterClass] = None
    subclass: Optional[str] = None
    level: Optional[int] = Field(default=None, ge=1, le=20)
    background: Optional[str] = None
    alignment: Optional[str] = None
    score_str: Optional[int] = Field(default=None, ge=1, le=30)
    score_dex: Optional[int] = Field(default=None, ge=1, le=30)
    score_con: Optional[int] = Field(default=None, ge=1, le=30)
    score_int: Optional[int] = Field(default=None, ge=1, le=30)
    score_wis: Optional[int] = Field(default=None, ge=1, le=30)
    score_cha: Optional[int] = Field(default=None, ge=1, le=30)
    hp_max: Optional[int] = Field(default=None, ge=1)
    hp_current: Optional[int] = Field(default=None, ge=0)
    ac: Optional[int] = Field(default=None, ge=1, le=30)
    speed: Optional[int] = Field(default=None, ge=0)
    saving_throw_proficiencies: Optional[list[AbilityScore]] = None
    skill_proficiencies: Optional[dict[str, Any]] = None
    feats: Optional[list[str]] = None
    equipment: Optional[list[dict[str, Any]]] = None
    spells_known: Optional[list[dict[str, Any]]] = None
    spell_slots: Optional[dict[str, Any]] = None
    backstory: Optional[str] = None
    notes: Optional[str] = None
    portrait_url: Optional[str] = None
