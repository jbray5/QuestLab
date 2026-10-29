"""Level-up guide schemas (Plan 115) — what the player's guide shows, sends, and gets back."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class LevelUpGrant(BaseModel):
    """DM grants a level-up; the player's guide applies it."""

    # Default: one level above the PC's current level.
    to_level: Optional[int] = Field(default=None, ge=2, le=20)


class FeatOption(BaseModel):
    """One feat as the guide lists it, with whether this PC may take it."""

    name: str
    category: str  # general | fighting_style | origin
    blurb: str
    ok: bool
    reason: Optional[str] = None
    popular: bool = False
    srd: bool = False
    asi_options: Optional[list[str]] = None  # abilities the +1 may go to; None = no increase
    save_prof: bool = False
    fixed_spells: list[str] = Field(default_factory=list)
    spell_picks: list[dict[str, Any]] = Field(default_factory=list)
    skill_pick: Optional[dict[str, Any]] = None
    expertise_pick: int = 0
    choice: Optional[dict[str, Any]] = None
    hp_per_level: int = 0
    ac_bonus_in_armor: int = 0


class SpellOption(BaseModel):
    """A catalog spell the picker can offer."""

    name: str
    level: int
    school: str
    classes: list[str] = Field(default_factory=list)


class SpellStep(BaseModel):
    """The spells part of the guide: how many to pick, from what, and swap rules."""

    new_cantrips: int
    new_spells: int
    max_spell_level: int
    prepared_caster: bool  # True: Cleric/Druid/Paladin/Wizard change the list on rests anyway
    cantrip_swap: bool
    spell_swap: bool
    known: list[SpellOption]
    options: list[SpellOption]  # class list, castable, not already known
    note: Optional[str] = None


class NewFeature(BaseModel):
    """A class feature the new level brings."""

    name: str
    note: Optional[str] = None


class LevelUpPlan(BaseModel):
    """Everything the guide needs for one PC's next level."""

    pc_id: str
    character_name: str
    character_class: str
    subclass: Optional[str] = None
    from_level: int
    to_level: int
    pending_level: int
    hit_die: int
    con_mod: int
    hp_max: int
    hp_average_gain: int  # at today's CON, including per-level bonuses
    hp_bonus_per_level: int  # Tough, Dwarf, Draconic Sorcery: already in the average
    new_features: list[NewFeature]
    scaling: list[str]
    slots_before: dict[str, int]
    slots_after: dict[str, int]
    needs_subclass: bool
    subclass_options: list[str]
    asi_level: bool
    feats: list[FeatOption]
    scores: dict[str, int]
    skills: dict[str, int]
    saves: list[str]
    all_skills: list[str]
    spellcasting: Optional[SpellStep] = None
    # Level 0-1 spells across every list, for feat picks (Fey Touched, Magic Initiate).
    feat_spells: list[SpellOption] = Field(default_factory=list)
    # When a score that feeds AC rises, the guide asks what armor the PC wears.
    ac: int
    ac_abilities: list[str]


class SpellSwap(BaseModel):
    """Replace one known spell with another on level-up."""

    forget: str = Field(min_length=1, max_length=80)
    learn: str = Field(min_length=1, max_length=80)


class FeatChoice(BaseModel):
    """The feat (or ASI) a player takes, and its sub-picks."""

    name: str = Field(min_length=1, max_length=80)
    from_book: bool = False  # a feat not in the list: recorded by name, the player plays it
    asi: dict[str, int] = Field(default_factory=dict)  # {"WIS": 2} or {"STR": 1, "CHA": 1}
    choice: Optional[str] = Field(default=None, max_length=40)
    spells: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    expertise: list[str] = Field(default_factory=list)


class LevelUpChoices(BaseModel):
    """What the player picked in the guide."""

    hp_method: Literal["average", "roll"] = "average"
    hp_roll: Optional[int] = Field(default=None, ge=1, le=12)
    subclass: Optional[str] = Field(default=None, max_length=100)
    feat: Optional[FeatChoice] = None
    cantrips: list[str] = Field(default_factory=list)
    spells: list[str] = Field(default_factory=list)
    cantrip_swap: Optional[SpellSwap] = None
    spell_swap: Optional[SpellSwap] = None
    armor: Optional[Literal["none", "light", "medium", "heavy"]] = None


class LevelUpResult(BaseModel):
    """What changed, for the guide's last screen."""

    character_name: str
    level: int
    hp_max: int
    hp_gain: int
    ac: int
    summary: list[str]
    features_granted: list[str]
    warnings: list[str]
    more_levels: bool  # the DM granted more than one level; the banner stays up
