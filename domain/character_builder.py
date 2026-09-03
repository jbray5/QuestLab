"""Character builder schemas (Plan 74) — what the player's wizard sends and gets."""

from typing import Any, Optional

from pydantic import BaseModel, Field


class CharacterBuild(BaseModel):
    """A finished build from the player-facing creator."""

    character_name: str = Field(min_length=1, max_length=100)
    player_name: str = Field(min_length=1, max_length=100)
    species: str = Field(min_length=1, max_length=100)
    # "from my book" species/subclass are free text; the SRD ones come from options.
    character_class: str = Field(min_length=1, max_length=40)
    subclass: Optional[str] = Field(default=None, max_length=100)
    background: str = Field(min_length=1, max_length=100)
    level: int = Field(default=1, ge=1, le=20)
    # Base scores BEFORE background bonuses: standard array, point buy, or manual.
    scores: dict[str, int]
    score_method: str = Field(default="standard", max_length=20)  # standard | pointbuy | manual
    # Background bonus: {"STR": 2, "DEX": 1} (a +2/+1) or three +1s.
    background_bonus: dict[str, int] = Field(default_factory=dict)
    skills: list[str] = Field(default_factory=list)  # class picks (+ Human/Skilled extras)
    origin_feat: Optional[str] = Field(default=None, max_length=60)  # Human's Versatile pick
    cantrips: list[str] = Field(default_factory=list)
    spells: list[str] = Field(default_factory=list)
    kit: Optional[str] = Field(default=None, max_length=80)  # starting-equipment kit name
    appearance: Optional[str] = Field(default=None, max_length=600)
    backstory: Optional[str] = Field(default=None, max_length=4000)


class BuilderOptions(BaseModel):
    """Everything the creator needs to render its steps."""

    campaign_name: str
    species: list[dict[str, Any]]
    backgrounds: list[dict[str, Any]]
    origin_feats: list[dict[str, str]]
    classes: dict[str, Any]
    skills: dict[str, str]
    standard_array: list[int]
    point_buy_cost: dict[int, int]
    point_buy_budget: int
    armor: dict[str, Any]
    # Spell catalog trimmed for the picker: name, level, classes, school.
    spells: list[dict[str, Any]]
    # Catalog weapons the kits reference, by name.
    weapons: list[dict[str, Any]]


class BuildResult(BaseModel):
    """What the player gets back: their new sheet's id and a summary."""

    pc_id: str
    character_name: str
    hp_max: int
    ac: int
    features_granted: list[str]
    warnings: list[str]
