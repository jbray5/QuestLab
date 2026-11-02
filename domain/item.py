"""Item and LootTable domain models — magic items and loot generation."""

import re
import uuid
from typing import Any, Optional

from pydantic import BaseModel
from pydantic import Field as PField
from pydantic import field_validator
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.enums import AdventureTier, ItemRarity


class Item(SQLModel, table=True):
    """Item SQLModel table — magic and mundane items.

    Weapon-specific fields (``weapon_category`` through ``mastery``) are
    nullable. They populate for any item that's a weapon, mundane or magical.
    See Plan 00018.
    """

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
    image_url: Optional[str] = Field(default=None, max_length=500)
    # JSON column
    properties: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))

    # ── Weapon fields (Plan 00018, nullable for non-weapons) ────────────────
    # "Simple Melee", "Simple Ranged", "Martial Melee", "Martial Ranged"
    weapon_category: Optional[str] = Field(default=None, max_length=40)
    # "1d6", "2d6", "1d8"
    damage_die: Optional[str] = Field(default=None, max_length=20)
    # "slashing", "piercing", "bludgeoning"
    damage_type: Optional[str] = Field(default=None, max_length=20)
    # JSON list of property names: ["Finesse", "Light", "Thrown"]
    weapon_properties: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Two-handed damage die for Versatile weapons. None if not Versatile.
    versatile_damage: Optional[str] = Field(default=None, max_length=20)
    # Range string for ranged/thrown weapons, e.g. "20/60", "80/320"
    weapon_range: Optional[str] = Field(default=None, max_length=40)
    # 2024 Weapon Mastery property (e.g. "Vex", "Nick", "Cleave")
    mastery: Optional[str] = Field(default=None, max_length=20)
    # SEC-003: the DM who authored a homebrew row; NULL = the shared SRD catalog
    # (admin-only to change). Stamped server-side, never taken from a request.
    created_by_email: Optional[str] = Field(default=None, max_length=200, index=True)


# Plan 132: weapon dice the attack preview can read ("1d8", "2d6+1") or a flat number
# (the SRD blowgun deals 1).
_DAMAGE_RE = re.compile(
    r"^\s*(\d{1,2}d(4|6|8|10|12|20|100)\s*([+-]\s*\d{1,3})?|\d{1,3})\s*$", re.IGNORECASE
)


def _check_damage(value: Optional[str]) -> Optional[str]:
    """Trim a weapon damage field; blank means none; refuse what no roll can read.

    Args:
        value: The submitted damage string, or None.

    Returns:
        The trimmed value, or None when blank.

    Raises:
        ValueError: If it is neither dice like ``1d8``/``2d6+1`` nor a flat number.
    """
    if value is None or not value.strip():
        return None
    if not _DAMAGE_RE.match(value):
        raise ValueError("Damage must be dice like 1d8 or 2d6+1, or a flat number.")
    return value.strip()


class ItemCreate(BaseModel):
    """Input schema for creating an item.

    Lengths match the table's columns (Plan 132: a DM's homebrew form writes
    here, so an over-long field is a plain 422, not a database error).
    """

    name: str = PField(min_length=1, max_length=200)
    rarity: ItemRarity
    item_type: str = PField(min_length=1, max_length=100)
    description: Optional[str] = PField(default=None, max_length=10000)
    attunement_required: bool = False
    properties: Optional[dict[str, Any]] = None
    value_gp: int = Field(default=0, ge=0)
    is_magic: bool = False
    image_url: Optional[str] = PField(default=None, max_length=500)
    # Weapon fields (Plan 00018, all optional)
    weapon_category: Optional[str] = PField(default=None, max_length=40)
    damage_die: Optional[str] = PField(default=None, max_length=20)
    damage_type: Optional[str] = PField(default=None, max_length=20)
    weapon_properties: Optional[list[str]] = None
    versatile_damage: Optional[str] = PField(default=None, max_length=20)
    weapon_range: Optional[str] = PField(default=None, max_length=40)
    mastery: Optional[str] = PField(default=None, max_length=20)

    @field_validator("name", "item_type")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        """Trim the name and type; a blank one is refused."""
        if not value.strip():
            raise ValueError("This can't be blank.")
        return value.strip()

    @field_validator("damage_die", "versatile_damage")
    @classmethod
    def _dice(cls, value: Optional[str]) -> Optional[str]:
        """Weapon damage must be dice or a flat number."""
        return _check_damage(value)


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
    image_url: Optional[str] = None
    # Weapon fields (Plan 00018)
    weapon_category: Optional[str] = None
    damage_die: Optional[str] = None
    damage_type: Optional[str] = None
    weapon_properties: Optional[list[str]] = None
    versatile_damage: Optional[str] = None
    weapon_range: Optional[str] = None
    mastery: Optional[str] = None
    # SEC-003: None for the shared catalog; the author's email for homebrew.
    created_by_email: Optional[str] = None

    model_config = {"from_attributes": True}


class ItemUpdate(BaseModel):
    """Partial update schema for an item (same limits as ``ItemCreate``)."""

    name: Optional[str] = PField(default=None, min_length=1, max_length=200)
    rarity: Optional[ItemRarity] = None
    item_type: Optional[str] = PField(default=None, min_length=1, max_length=100)
    description: Optional[str] = PField(default=None, max_length=10000)
    attunement_required: Optional[bool] = None
    properties: Optional[dict[str, Any]] = None
    value_gp: Optional[int] = Field(default=None, ge=0)
    is_magic: Optional[bool] = None
    image_url: Optional[str] = PField(default=None, max_length=500)
    # Weapon fields
    weapon_category: Optional[str] = PField(default=None, max_length=40)
    damage_die: Optional[str] = PField(default=None, max_length=20)
    damage_type: Optional[str] = PField(default=None, max_length=20)
    weapon_properties: Optional[list[str]] = None
    versatile_damage: Optional[str] = PField(default=None, max_length=20)
    weapon_range: Optional[str] = PField(default=None, max_length=40)
    mastery: Optional[str] = PField(default=None, max_length=20)

    @field_validator("name", "item_type")
    @classmethod
    def _not_blank(cls, value: Optional[str]) -> Optional[str]:
        """Trim the name and type; a blank one is refused."""
        if value is None:
            return None
        if not value.strip():
            raise ValueError("This can't be blank.")
        return value.strip()

    @field_validator("damage_die", "versatile_damage")
    @classmethod
    def _dice(cls, value: Optional[str]) -> Optional[str]:
        """Weapon damage must be dice or a flat number (blank clears it)."""
        return _check_damage(value)


class ItemConflictError(Exception):
    """A homebrew item change that clashes with the catalog (Plan 132): an HTTP 409.

    Raised when an item can't be deleted because something still holds it, or when a
    homebrew name is one its DM can already see (kits and shops look items up by name).
    The message is a plain sentence, shown to the DM as is.
    """


class WeaponAttackPreview(BaseModel):
    """Computed attack-roll output for a PC wielding a weapon (Plan 00018).

    Pure function output — no DB writes. Front-ends render the values directly
    (e.g. "Rapier: +5 to hit, 1d8+3 piercing, mastery: Vex").
    """

    weapon_id: uuid.UUID
    character_id: uuid.UUID
    # "STR" | "DEX" — the ability score used for this attack
    ability: str
    # The number to add to a d20 roll
    hit_bonus: int
    # Display string like "1d8+3" or "2d6-1"
    damage_roll: str
    damage_type: str
    # 2024 Weapon Mastery property name, if applicable
    mastery: Optional[str] = None
    proficient: bool = True
    two_handed: bool = False
    # Plan 132: a magic weapon's +1/+2/+3 (``properties["bonus"]``), already
    # included in ``hit_bonus`` and ``damage_roll``; 0 for a mundane weapon.
    magic_bonus: int = 0


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
