"""Level-up guide schemas (Plan 115) — what the player's guide shows, sends, and gets back.

Plan 131: the plan says which rules it follows (``ruleset``). A 2014 plan also carries the
class choices the new level brings (Pact Boon, Eldritch Invocations, Metamagic...), the
spells that become always prepared, and the counts the 2014 spell rules use.

Plan 133: the campaign DM's homebrew subclasses are offered next to the SRD ones, and a
homebrew subclass's features (``NewFeature.homebrew``) and always-prepared spells arrive at
the levels the DM set, in both editions.

Plan 134: a 2024 plan carries its class choices and always-prepared spells too, with the
2024 kinds ("weapon" for Weapon Mastery) and an option's own cantrips (Blessed Warrior).
"""

from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, Field

from domain.enums import Ruleset

# A name the player typed or picked (a feat, a spell, a choice option).
PickName = Annotated[str, Field(min_length=1, max_length=80)]


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


class GrantedSpell(BaseModel):
    """A spell the new level adds by itself: always prepared, no pick spent (Plan 131)."""

    name: str
    source: str  # "Life Domain", "Circle of the Land (Forest)"
    subclass: Optional[str] = None  # only if this subclass is the one picked at this level


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
    # Plan 131 (2014 rules). How many spells the PC prepares each day at the new level
    # (Cleric, Druid, Paladin, Wizard); None for a known caster and for every 2024 plan.
    prepared_count: Optional[int] = None
    spellbook: bool = False  # Wizard: the new spells go in the spellbook
    first_spells: bool = False  # the level spellcasting starts (a 2014 Paladin or Ranger at 2)
    always_prepared: list[GrantedSpell] = Field(default_factory=list)
    # Plan 134: cantrips from another class's list that a class choice option teaches
    # (``ChoiceOption.cantrip_list``: Blessed Warrior's Cleric ones), offered once it's picked.
    choice_cantrips: list[SpellOption] = Field(default_factory=list)


class NewFeature(BaseModel):
    """A class feature the new level brings."""

    name: str
    note: Optional[str] = None
    # Plan 131: set when the feature comes with a subclass picked at this level.
    subclass: Optional[str] = None
    # Plan 133: a feature of the campaign DM's homebrew subclass (``note`` is the DM's text).
    homebrew: bool = False


class HomebrewSubclassOption(BaseModel):
    """A subclass the campaign's DM made, offered at the subclass level (Plan 133)."""

    name: str
    blurb: str = ""


class ChoiceOption(BaseModel):
    """One pick a class choice offers, and whether this PC may take it now (Plan 131)."""

    name: str
    blurb: str = ""  # kind "weapon": the weapon's mastery property ("Sap")
    ok: bool = True
    reason: Optional[str] = None
    # Plan 134: cantrips this option alone teaches, from ``cantrip_list`` (Blessed Warrior:
    # 2 Cleric cantrips); a grant every option shares is ``ChoiceStep.cantrips`` instead.
    cantrips: int = 0
    cantrip_list: Optional[str] = None
    category: Optional[str] = None  # kind "weapon": "Simple Melee", "Martial Ranged"...


class ChoiceStep(BaseModel):
    """A class choice the new level brings (Plan 131; 2024 rules too since Plan 134).

    ``count`` is the number of *new* picks: the class tables hold running totals, so a
    2014 Warlock going from 4 to 5 picks one more invocation, not three.
    """

    key: str  # "pact_boon", "invocations", "metamagic", "expertise", "weapon_mastery"...
    label: str
    kind: str  # "option" | "feat" | "expertise" | "skill" | "spell" | "weapon"
    note: Optional[str] = None
    count: int
    book: bool = False  # "From my book" names are accepted
    options: list[ChoiceOption] = Field(default_factory=list)  # kinds "option", "feat", "weapon"
    spells: list[SpellOption] = Field(default_factory=list)  # kind "spell"
    skills: Optional[list[str]] = None  # kinds "skill"/"expertise": allowed skills, None = any
    taken: list[str] = Field(default_factory=list)  # earlier picks already on the sheet
    cantrips: int = 0  # every option also teaches this many class cantrips (the Land's)
    subclass: Optional[str] = None  # only if this subclass is the one picked at this level


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
    # Plan 131 — the rules this plan follows, and the class choices to make (2024 too since
    # Plan 134).
    ruleset: Ruleset = Ruleset.R2024
    class_choices: list[ChoiceStep] = Field(default_factory=list)
    # Plan 133 — the campaign DM's homebrew subclasses for this class and edition. Their
    # names are also in ``subclass_options``, after the SRD ones.
    homebrew_subclasses: list[HomebrewSubclassOption] = Field(default_factory=list)


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


class ClassChoicePick(BaseModel):
    """The player's picks for one class choice (Plan 131): listed names and book names."""

    key: str = Field(min_length=1, max_length=40)
    picks: list[PickName] = Field(default_factory=list, max_length=12)
    book: list[PickName] = Field(default_factory=list, max_length=12)


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
    # Plan 131 — the class choices of the plan (``LevelUpPlan.class_choices``).
    class_choices: list[ClassChoicePick] = Field(default_factory=list, max_length=12)


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
