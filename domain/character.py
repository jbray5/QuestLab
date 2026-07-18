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
    # Full-body transparent minifig standee for the 3D board (Plan 45).
    figure_url: Optional[str] = Field(default=None, max_length=500)
    # Plan 00048 — the player's own look: appearance notes they edit from
    # the Character Forge, the full-body hero render, and the forge
    # cooldown anchor (player-triggered paid generation).
    appearance: Optional[str] = None
    hero_url: Optional[str] = Field(default=None, max_length=500)
    # The "dressed" render: the base model painted wearing the equipped
    # loadout (image-to-image from hero_url, so identity is preserved).
    loadout_url: Optional[str] = Field(default=None, max_length=500)
    hero_generated_at: Optional[datetime] = Field(default=None)
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
    # Plan 00023 — combat state
    temp_hp: int = Field(default=0, ge=0)
    heroic_inspiration: bool = Field(default=False)
    # Free-text label of the spell/effect the PC is concentrating on.
    concentration_on: Optional[str] = Field(default=None, max_length=120)
    # Death save pips — 0..3 each; auto-zeroed when hp_current > 0.
    death_save_successes: int = Field(default=0, ge=0, le=3)
    death_save_failures: int = Field(default=0, ge=0, le=3)
    # Plan 00024 — hit dice spent (recovered on long rest), exhaustion 0..6,
    # currency in copper/silver/electrum/gold/platinum.
    hit_dice_spent: int = Field(default=0, ge=0)
    exhaustion: int = Field(default=0, ge=0, le=6)
    cp: int = Field(default=0, ge=0)
    sp: int = Field(default=0, ge=0)
    ep: int = Field(default=0, ge=0)
    gp: int = Field(default=0, ge=0)
    pp: int = Field(default=0, ge=0)
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
    # Combat state (Plan 00023)
    temp_hp: int = 0
    heroic_inspiration: bool = False
    concentration_on: Optional[str] = None
    death_save_successes: int = 0
    death_save_failures: int = 0
    # Plan 00024 — caster stats are computed on read (services), not stored.
    hit_dice_spent: int = 0
    exhaustion: int = 0
    cp: int = 0
    sp: int = 0
    ep: int = 0
    gp: int = 0
    pp: int = 0
    backstory: Optional[str] = None
    notes: Optional[str] = None
    portrait_url: Optional[str] = None
    figure_url: Optional[str] = None
    # Plan 00048 — Character Forge
    appearance: Optional[str] = None
    hero_url: Optional[str] = None
    loadout_url: Optional[str] = None
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
    # Combat state (Plan 00023) — DM can set any of these via PATCH
    temp_hp: Optional[int] = Field(default=None, ge=0)
    heroic_inspiration: Optional[bool] = None
    concentration_on: Optional[str] = Field(default=None, max_length=120)
    death_save_successes: Optional[int] = Field(default=None, ge=0, le=3)
    death_save_failures: Optional[int] = Field(default=None, ge=0, le=3)
    # Plan 00024 — hit dice / exhaustion / currency
    hit_dice_spent: Optional[int] = Field(default=None, ge=0)
    exhaustion: Optional[int] = Field(default=None, ge=0, le=6)
    cp: Optional[int] = Field(default=None, ge=0)
    sp: Optional[int] = Field(default=None, ge=0)
    ep: Optional[int] = Field(default=None, ge=0)
    gp: Optional[int] = Field(default=None, ge=0)
    pp: Optional[int] = Field(default=None, ge=0)
    backstory: Optional[str] = None
    notes: Optional[str] = None
    portrait_url: Optional[str] = None
    figure_url: Optional[str] = None
    # Plan 00048 — Character Forge (hero_generated_at is set service-side
    # alongside hero_url to anchor the forge cooldown)
    appearance: Optional[str] = None
    hero_url: Optional[str] = None
    loadout_url: Optional[str] = None
    hero_generated_at: Optional[datetime] = None


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


# ---------------------------------------------------------------------------
# Plan 00021 — Class features + per-PC usage tracking
# ---------------------------------------------------------------------------


from domain.enums import RecoveryType, UsesFormula  # noqa: E402


class ClassFeature(SQLModel, table=True):
    """One row per published 2024 SRD/PHB class feature with a use-counter.

    Passive features (Sneak Attack damage, Fighting Style, ASI) are not
    catalogued here — only features with limited daily/short-rest uses
    that the DM needs to track at the table.
    """

    __tablename__ = "class_features"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(min_length=1, max_length=80)
    character_class: CharacterClass = Field(index=True)
    subclass: Optional[str] = Field(default=None, max_length=80)
    level_acquired: int = Field(ge=1, le=20)
    recovery: RecoveryType
    uses_formula: UsesFormula
    description: str
    source: str = Field(default="SRD 5.5e / 2024 PHB", max_length=60)


class ClassFeatureCreate(BaseModel):
    """Input schema for cataloguing a class feature."""

    name: str = Field(min_length=1, max_length=80)
    character_class: CharacterClass
    subclass: Optional[str] = None
    level_acquired: int = Field(ge=1, le=20)
    recovery: RecoveryType
    uses_formula: UsesFormula
    description: str
    source: str = "SRD 5.5e / 2024 PHB"


class ClassFeatureRead(BaseModel):
    """Output schema for a class feature."""

    id: uuid.UUID
    name: str
    character_class: CharacterClass
    subclass: Optional[str] = None
    level_acquired: int
    recovery: RecoveryType
    uses_formula: UsesFormula
    description: str
    source: str

    model_config = {"from_attributes": True}


class CharacterFeature(SQLModel, table=True):
    """A PC's instance of a class feature, with current usage."""

    __tablename__ = "character_features"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    character_id: uuid.UUID = Field(foreign_key="player_characters.id", index=True)
    feature_id: uuid.UUID = Field(foreign_key="class_features.id", index=True)
    uses_spent: int = Field(default=0, ge=0)
    notes: Optional[str] = Field(default=None, max_length=300)


class CharacterFeatureCreate(BaseModel):
    """Input schema for adding a feature to a PC."""

    feature_id: uuid.UUID
    uses_spent: int = Field(default=0, ge=0)
    notes: Optional[str] = None


class CharacterFeatureRead(BaseModel):
    """Output schema for a PC feature row, with computed max uses + name.

    ``max_uses`` and ``feature_name`` are populated by the service layer at
    read time so the frontend has a single payload to render.
    """

    id: uuid.UUID
    character_id: uuid.UUID
    feature_id: uuid.UUID
    feature_name: str = ""
    uses_spent: int
    max_uses: int = 0
    recovery: RecoveryType = RecoveryType.NONE
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class CharacterFeatureUpdate(BaseModel):
    """Partial update for a PC feature row."""

    uses_spent: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=300)


class RestSummary(BaseModel):
    """Service output for a rest operation (per PC)."""

    character_id: uuid.UUID
    character_name: str
    rest_type: str  # "short" | "long"
    features_restored: list[str] = Field(default_factory=list)
    slot_levels_restored: list[str] = Field(default_factory=list)
    hp_restored: int = 0
