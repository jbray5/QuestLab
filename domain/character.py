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
    # Plan 00020 — persistent slot-consumption tracker. Keyed by slot level
    # as a string (Postgres JSON keys are strings): {"1": 2, "2": 1, ...}.
    # remaining = compute_spell_slots(class, level)[level] - spell_slots_used[level]
    spell_slots_used: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PlayerCharacterCreate(BaseModel):
    """Input schema for creating a new player character."""

    campaign_id: Optional[uuid.UUID] = None
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
    spell_slots_used: Optional[dict[str, int]] = None
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


# ---------------------------------------------------------------------------
# Plan 00019 — PC inventory: junction between PlayerCharacter and Item
# ---------------------------------------------------------------------------


class AttunementLimitError(ValueError):
    """Raised when a PC tries to attune to a 4th item (RAW cap is 3)."""


class CharacterItem(SQLModel, table=True):
    """A PC's instance of an item (from the items compendium).

    Quantity > 1 for stackables (potions, ammunition). One row per stack,
    not per copy. Equipped + attuned flags drive the character sheet display
    and the attack-preview integration for weapons.
    """

    __tablename__ = "character_items"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    character_id: uuid.UUID = Field(foreign_key="player_characters.id", index=True)
    item_id: uuid.UUID = Field(foreign_key="items.id", index=True)
    quantity: int = Field(default=1, ge=1)
    equipped: bool = Field(default=False)
    attuned: bool = Field(default=False)
    attuned_at: Optional[datetime] = Field(default=None)
    acquired_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    notes: Optional[str] = Field(default=None, max_length=500)


class CharacterItemCreate(BaseModel):
    """Input schema for adding an item to a PC's inventory."""

    item_id: uuid.UUID
    quantity: int = Field(default=1, ge=1)
    equipped: bool = False
    attuned: bool = False
    notes: Optional[str] = Field(default=None, max_length=500)


class CharacterItemRead(BaseModel):
    """Output schema for a PC inventory row."""

    id: uuid.UUID
    character_id: uuid.UUID
    item_id: uuid.UUID
    quantity: int
    equipped: bool
    attuned: bool
    attuned_at: Optional[datetime] = None
    acquired_at: datetime
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class CharacterItemUpdate(BaseModel):
    """Partial update for a PC inventory row."""

    quantity: Optional[int] = Field(default=None, ge=0)
    equipped: Optional[bool] = None
    attuned: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=500)


# ---------------------------------------------------------------------------
# Plan 00020 — PC spell knowledge + slot tracking
# ---------------------------------------------------------------------------


class NoSpellSlotError(ValueError):
    """Raised when a PC tries to expend a slot of a level they have none of."""


class CharacterSpell(SQLModel, table=True):
    """A PC's known/prepared spell, referencing the spells catalog.

    Two boolean flags: ``known`` (on the PC's spellbook / class list) and
    ``prepared`` (selected for today). For classes that don't distinguish
    (Sorcerer, Warlock), the UI keeps both flags in sync.
    """

    __tablename__ = "character_spells"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    character_id: uuid.UUID = Field(foreign_key="player_characters.id", index=True)
    spell_id: uuid.UUID = Field(foreign_key="spells.id", index=True)
    known: bool = Field(default=True)
    prepared: bool = Field(default=False)
    added_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CharacterSpellCreate(BaseModel):
    """Input schema for adding a spell to a PC's spell list."""

    spell_id: uuid.UUID
    known: bool = True
    prepared: bool = False


class CharacterSpellRead(BaseModel):
    """Output schema for a PC's spell list row."""

    id: uuid.UUID
    character_id: uuid.UUID
    spell_id: uuid.UUID
    known: bool
    prepared: bool
    added_at: datetime

    model_config = {"from_attributes": True}


class CharacterSpellUpdate(BaseModel):
    """Partial update for a PC's spell list row."""

    known: Optional[bool] = None
    prepared: Optional[bool] = None


class SpellSlotLevelState(BaseModel):
    """Per-level slot state for a PC: max, used, remaining."""

    max: int = Field(ge=0)
    used: int = Field(ge=0)
    remaining: int = Field(ge=0)


class SpellSlotStateRead(BaseModel):
    """Aggregate slot state for a PC (Plan 00020).

    ``levels`` keys are slot levels as strings ("1".."9"). Cantrips (level 0)
    are not slot-consuming and are omitted.
    """

    character_id: uuid.UUID
    levels: dict[str, SpellSlotLevelState] = Field(default_factory=dict)
