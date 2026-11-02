"""Spell domain model — D&D 5.5e (2024) SRD spell catalog.

Plan 00017 — first foundation block of the Roll20-killer character sheet.
Catalog-only: no PC↔Spell link yet (lands in Plan 00020).
"""

import uuid
from typing import Annotated, Optional

from pydantic import BaseModel
from pydantic import Field as PydanticField
from pydantic import StringConstraints, field_validator
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from domain.enums import RULESET_PATTERN


class SpellConflictError(ValueError):
    """A homebrew spell change that clashes (Plan 132): a name already taken, or still known."""


# Plan 132 — a spell's name, trimmed before its length is checked (so "  " is refused).
SpellName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class Spell(SQLModel, table=True):
    """Spell SQLModel table — one row per SRD 5.5e spell.

    Most fields mirror the printed spell block. Mechanical hints
    (``damage_dice``, ``save_ability``, ``attack_type``) are optional and
    drive the auto-roll buttons that Plan 00023 will add — when absent,
    the spell is treated as descriptive-only.
    """

    __tablename__ = "spells"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(min_length=1, max_length=120, index=True)
    # 0 = cantrip
    level: int = Field(ge=0, le=9, index=True)
    school: str = Field(min_length=1, max_length=40)
    # SRD allows long reaction-trigger descriptions in casting_time (Counterspell, Shield),
    # so cap higher than the printed-block size.
    casting_time: str = Field(min_length=1, max_length=400)
    range: str = Field(min_length=1, max_length=120)
    components_v: bool = Field(default=False)
    components_s: bool = Field(default=False)
    # Material component text. None when M is not part of the spell's components.
    components_m: Optional[str] = Field(default=None, max_length=600)
    duration: str = Field(min_length=1, max_length=120)
    is_ritual: bool = Field(default=False)
    is_concentration: bool = Field(default=False)
    description: str = Field(min_length=1)
    # Per-slot upcasting text, e.g. "When cast at 2nd level or higher..."
    higher_levels: Optional[str] = Field(default=None)
    # Optional mechanical hints — drive clickable auto-roll buttons later.
    damage_dice: Optional[str] = Field(default=None, max_length=40)
    damage_type: Optional[str] = Field(default=None, max_length=40)
    # Ability targeted by the spell's saving throw ("DEX", "WIS", ...).
    save_ability: Optional[str] = Field(default=None, max_length=10)
    # "ranged" | "melee" | None.
    attack_type: Optional[str] = Field(default=None, max_length=20)
    # JSON list of class names that can learn this spell.
    classes: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    source: str = Field(default="SRD 5.5e (2024)", max_length=60)
    # Plan 131 — "2024" or "2014" for the SRD rows; NULL for a DM's homebrew (valid in both).
    ruleset: Optional[str] = Field(default=None, max_length=4, index=True)
    # SEC-003: the DM who authored a homebrew spell; NULL = the shared SRD
    # catalog (admin-only to change). Stamped server-side.
    created_by_email: Optional[str] = Field(default=None, max_length=200, index=True)


class SpellCreate(BaseModel):
    """Input schema for creating a spell."""

    name: SpellName
    level: int = PydanticField(ge=0, le=9)
    school: str = PydanticField(min_length=1, max_length=40)
    casting_time: str = PydanticField(min_length=1, max_length=400)
    range: str = PydanticField(min_length=1, max_length=120)
    components_v: bool = False
    components_s: bool = False
    components_m: Optional[str] = PydanticField(default=None, max_length=600)
    duration: str = PydanticField(min_length=1, max_length=120)
    is_ritual: bool = False
    is_concentration: bool = False
    description: str = PydanticField(min_length=1)
    higher_levels: Optional[str] = None
    # Plan 132 — the column sizes, so a homebrew form gets a 422 rather than a DB error.
    damage_dice: Optional[str] = PydanticField(default=None, max_length=40)
    damage_type: Optional[str] = PydanticField(default=None, max_length=40)
    save_ability: Optional[str] = PydanticField(default=None, max_length=10)
    attack_type: Optional[str] = PydanticField(default=None, max_length=20)
    classes: list[str] = PydanticField(default_factory=list)
    source: str = PydanticField(default="SRD 5.5e (2024)", max_length=60)
    # Plan 131 — the seeds set "2024"/"2014"; a DM's homebrew leaves it None (both rulesets).
    ruleset: Optional[str] = PydanticField(default=None, pattern=RULESET_PATTERN)


class SpellRead(BaseModel):
    """Output schema for reading a spell."""

    id: uuid.UUID
    name: str
    level: int
    school: str
    casting_time: str
    range: str
    components_v: bool
    components_s: bool
    components_m: Optional[str] = None
    duration: str
    is_ritual: bool
    is_concentration: bool
    description: str
    higher_levels: Optional[str] = None
    damage_dice: Optional[str] = None
    damage_type: Optional[str] = None
    save_ability: Optional[str] = None
    attack_type: Optional[str] = None
    classes: list[str] = PydanticField(default_factory=list)
    source: str
    ruleset: Optional[str] = None
    # SEC-003: None for the shared catalog; the author's email for homebrew.
    created_by_email: Optional[str] = None

    model_config = {"from_attributes": True}


class SpellUpdate(BaseModel):
    """Partial update for a spell.

    Plan 132 — the same limits as ``SpellCreate``; a field that can't be empty can't be
    cleared with null either (only the optional texts and rolls can).
    """

    name: Optional[SpellName] = None
    level: Optional[int] = PydanticField(default=None, ge=0, le=9)
    school: Optional[str] = PydanticField(default=None, min_length=1, max_length=40)
    casting_time: Optional[str] = PydanticField(default=None, min_length=1, max_length=400)
    range: Optional[str] = PydanticField(default=None, min_length=1, max_length=120)
    components_v: Optional[bool] = None
    components_s: Optional[bool] = None
    components_m: Optional[str] = PydanticField(default=None, max_length=600)
    duration: Optional[str] = PydanticField(default=None, min_length=1, max_length=120)
    is_ritual: Optional[bool] = None
    is_concentration: Optional[bool] = None
    description: Optional[str] = PydanticField(default=None, min_length=1)
    higher_levels: Optional[str] = None
    damage_dice: Optional[str] = PydanticField(default=None, max_length=40)
    damage_type: Optional[str] = PydanticField(default=None, max_length=40)
    save_ability: Optional[str] = PydanticField(default=None, max_length=10)
    attack_type: Optional[str] = PydanticField(default=None, max_length=20)
    classes: Optional[list[str]] = None

    @field_validator(
        "name",
        "level",
        "school",
        "casting_time",
        "range",
        "components_v",
        "components_s",
        "duration",
        "is_ritual",
        "is_concentration",
        "description",
        "classes",
    )
    @classmethod
    def _not_null(cls, value):
        """Refuse an explicit null for a field every spell must have."""
        if value is None:
            raise ValueError("can't be empty")
        return value
