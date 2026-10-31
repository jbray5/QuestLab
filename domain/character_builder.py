"""Character builder schemas (Plan 74) — what the player's wizard sends and gets.

Plan 126: the DM builds with the same wizard, and a build at level 4 or higher carries one
Ability Score Improvement (or feat) pick per improvement level it has passed.
"""

from typing import Any, Optional

from pydantic import BaseModel, Field

from domain.level_up import FeatChoice


class BuildAsiChoice(FeatChoice):
    """One Ability Score Improvement level's pick in the creator: +2/+1+1, a feat, or a book feat.

    Same shape as the level-up guide's ``FeatChoice`` (Plan 115), plus the class level it is for.
    """

    level: int = Field(ge=1, le=20)


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
    # Plan 126 — one pick per Ability Score Improvement level up to ``level`` (4, 8, ...; the
    # Fighter and Rogue have more; 19 is the Epic Boon). Empty below level 4.
    asi: list[BuildAsiChoice] = Field(default_factory=list, max_length=10)
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
    # Plan 126 — what the wizard needs to explain each choice and run the improvement step.
    feats: list[dict[str, Any]] = Field(default_factory=list)  # the level-up feat catalog
    asi_levels: dict[str, list[int]] = Field(default_factory=dict)  # per class
    popular_feats: dict[str, list[str]] = Field(default_factory=dict)  # per class
    class_features: dict[str, dict[int, list[str]]] = Field(default_factory=dict)
    subclass_features: dict[str, dict[int, list[str]]] = Field(default_factory=dict)
    feature_notes: dict[str, str] = Field(default_factory=dict)  # "Name" or "Class: Name"
    fighting_style_level: dict[str, int] = Field(default_factory=dict)
    caster_subclasses: list[str] = Field(default_factory=list)
    hp_per_level_species: dict[str, int] = Field(default_factory=dict)
    hp_per_level_subclass: dict[str, int] = Field(default_factory=dict)
    unarmored_ac_subclass: dict[str, str] = Field(default_factory=dict)
    # Spell slots per class, one entry per level 1-20 (Warlock: {"pact": n, "level": L}).
    spell_slots: dict[str, list[dict[str, int]]] = Field(default_factory=dict)


class BuildResult(BaseModel):
    """What the player gets back: their new sheet's id, its link secret and a summary."""

    pc_id: str
    # SEC-002 — the secret for /play/{play_key}; the phone opens and remembers this.
    play_key: str = ""
    character_name: str
    hp_max: int
    ac: int
    features_granted: list[str]
    warnings: list[str]
