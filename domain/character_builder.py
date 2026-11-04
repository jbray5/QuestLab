"""Character builder schemas (Plan 74) — what the player's wizard sends and gets.

Plan 126: the DM builds with the same wizard, and a build at level 4 or higher carries one
Ability Score Improvement (or feat) pick per improvement level it has passed.

Plan 128: the build also carries the class's own choices (Fighting Style, Weapon Mastery,
Expertise, Divine Order, Eldritch Invocations...) and the Origin feats' picks (Magic Initiate's
spells, Skilled's skills); the options carry what the wizard needs to ask for them, and each
spell's casting time, range, duration and its full text.

Plan 131: a campaign can play by the 2014 rules. The build gains the 2014 picks (a subrace, the
Half-Elf's two +1s, a book background's skills, the Dragonborn's ancestry, a Wizard's prepared
spells out of its spellbook), all optional with empty defaults so a 2024 build is unchanged; the
options say which ruleset they are for and carry the 2014-only tables.

Plan 133: the options carry the campaign DM's homebrew races and subclasses, and whether the
campaign uses custom origin; a 2014 build with custom origin on may move its racial bonuses
(``origin_bonus``).

Plan 135: the options' ``feats`` carry the campaign DM's homebrew feats too.
"""

from typing import Annotated, Any, Optional

from pydantic import BaseModel, Field

from domain.enums import Ruleset
from domain.level_up import FeatChoice


class BuildAsiChoice(FeatChoice):
    """One Ability Score Improvement level's pick in the creator: +2/+1+1, a feat, or a book feat.

    Same shape as the level-up guide's ``FeatChoice`` (Plan 115), plus the class level it is for.
    """

    level: int = Field(ge=1, le=20)


_Name = Annotated[str, Field(min_length=1, max_length=80)]


class ClassChoicePick(BaseModel):
    """One class choice (Plan 128): Fighting Style, Weapon Mastery, Expertise, Divine Order...

    ``key`` is a choice from ``levelup_2024.CHOICE_KINDS``; ``picks`` are names from its list;
    ``book`` are names typed from the player's book, where the choice allows it.
    """

    key: str = Field(min_length=1, max_length=40)
    picks: list[_Name] = Field(default_factory=list, max_length=12)
    book: list[_Name] = Field(default_factory=list, max_length=12)


class OriginFeatPicks(BaseModel):
    """An Origin feat's own picks (Plan 128): Magic Initiate's list and spells, Skilled's skills."""

    choice: Optional[str] = Field(default=None, max_length=40)  # Magic Initiate's spell list
    spells: list[_Name] = Field(default_factory=list, max_length=6)
    skills: list[_Name] = Field(default_factory=list, max_length=6)


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
    # Plan 128 — the class's own choices and the Origin feats' picks. The wizard always sends a
    # list here (empty when the class has nothing to choose), and then every choice is checked:
    # the class choices, Magic Initiate's spells and Skilled's skills, and the spell counts.
    # None means a caller that predates Plan 128 (a script or an old client): those aren't
    # asked for, and the result's warnings say what's still open.
    class_choices: Optional[list[ClassChoicePick]] = Field(default=None, max_length=20)
    background_feat_picks: Optional[OriginFeatPicks] = None  # the background's Origin feat
    origin_feat_picks: Optional[OriginFeatPicks] = None  # a Human's Versatile feat
    appearance: Optional[str] = Field(default=None, max_length=600)
    backstory: Optional[str] = Field(default=None, max_length=4000)
    # Plan 131 — 2014 rules only (a 2024 build leaves them empty, and is refused if it doesn't).
    # The subrace an SRD race needs ("Hill Dwarf"), or one typed from the player's book.
    subrace: Optional[str] = Field(default=None, max_length=100)
    # Racial bonuses the player chooses: the Half-Elf's two +1s ({"DEX": 1, "CON": 1}), or the
    # bonuses a race or subrace from the player's book gives.
    ability_choice: dict[str, int] = Field(default_factory=dict)
    # A background from the player's book: the 2 skills it gives (any skills).
    background_skills: list[_Name] = Field(default_factory=list, max_length=4)
    # A race's own choices, in the class-choice shape: the Dragonborn's Draconic Ancestry is
    # {"key": "dragonborn_ancestry", "picks": ["Red"]} (keys from SPECIES_CHOICE_KINDS).
    species_choices: list[ClassChoicePick] = Field(default_factory=list, max_length=4)
    # A Wizard's prepared spells, out of ``spells`` (which is the spellbook for a 2014 Wizard).
    prepared_spells: list[_Name] = Field(default_factory=list, max_length=40)
    # Plan 133 — custom origin (a 2014 campaign with the switch on): the race's fixed bonuses
    # moved onto other abilities, the same amounts each on a different ability. A Hill Dwarf's
    # +2 CON and +1 WIS can become {"DEX": 2, "INT": 1}. Empty keeps the race's own.
    origin_bonus: dict[str, int] = Field(default_factory=dict, max_length=6)


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
    # The spell catalog for the picker: name, level, classes, school, and (Plan 128) casting
    # time, range, duration, components, concentration, ritual and the full text.
    spells: list[dict[str, Any]]
    # Catalog weapons the kits reference, by name.
    weapons: list[dict[str, Any]]
    # Plan 126 — what the wizard needs to explain each choice and run the improvement step.
    # Plan 135: the rules' feat rows, then the campaign DM's homebrew feats in the same shape
    # with ``homebrew: True`` and their ``description``, ``prerequisite`` and ``power_attack``.
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
    # Plan 128 — the class choices (what, when, how many, from what), the always-prepared spell
    # tables, the weapons Weapon Mastery can name, and the numbers each class tracks by level.
    choice_kinds: dict[str, dict[str, Any]] = Field(default_factory=dict)
    class_choices: dict[str, dict[str, list[list[int]]]] = Field(default_factory=dict)
    subclass_choices: dict[str, dict[str, list[list[int]]]] = Field(default_factory=dict)
    fighting_style_extras: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    mastery_weapons: list[dict[str, Any]] = Field(default_factory=list)
    weapon_mastery_filter: dict[str, str] = Field(default_factory=dict)
    always_prepared_class: dict[str, dict[int, list[str]]] = Field(default_factory=dict)
    always_prepared_subclass: dict[str, dict[int, list[str]]] = Field(default_factory=dict)
    always_prepared_source: dict[str, str] = Field(default_factory=dict)
    land_spells: dict[str, dict[int, list[str]]] = Field(default_factory=dict)
    extra_spell_lists: dict[str, dict[int, list[str]]] = Field(default_factory=dict)
    class_scales: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    # Plan 131 — which rules these options are for, and the tables only the 2014 rules have
    # (empty for a 2024 campaign): the Wizard's spellbook size by level (one entry per level
    # 1-20), unarmored Armor Class bases (Draconic Resilience: 13 + DEX), armor a subclass adds
    # (the Life Domain's heavy armor), and a subclass's expanded spell list (The Fiend).
    ruleset: Ruleset = Ruleset.R2024
    spellbook_size: dict[str, list[int]] = Field(default_factory=dict)
    unarmored_ac_base_subclass: dict[str, int] = Field(default_factory=dict)
    subclass_armor: dict[str, list[str]] = Field(default_factory=dict)
    expanded_spells: dict[str, dict[int, list[str]]] = Field(default_factory=dict)
    # Plan 133 — the campaign DM's homebrew. Their races join ``species`` (marked
    # ``homebrew: True``); their subclasses are listed here by class, ``{"Paladin": [{"name",
    # "blurb", "features": [{"level", "name", "text"}]}]}``, and their features and
    # always-prepared spells are merged into ``subclass_features``, ``feature_notes`` and
    # ``always_prepared_subclass``. ``custom_origin``: the 2014 switch that lets a race's
    # bonuses move (always False in 2024).
    homebrew_subclasses: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    custom_origin: bool = False


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
