"""Homebrew races and subclasses (Plan 133): a DM's own character options.

James (beta, 11/3) runs a 2014 Zelda campaign and needed races with more than ability bonuses
(traits, skills, speed, languages) and subclasses with real features. A DM makes them in the
"Races & subclasses" catalog; every character built in that DM's campaigns can pick them.

Ownership (SEC-003): every row belongs to the DM who made it (``created_by_email``). There
are no shared rows: the SRD races and subclasses live in ``integrations/dnd_rules`` and are
never stored here. Only the owner (or an admin) changes a row; lists show the caller's own.

``ruleset`` is "2024", "2014" or NULL (valid in both editions, the default).

Stored shapes (JSON columns, all validated here before they are written):

- ``HomebrewRace.ability_bonuses``: ``{"DEX": 2, "WIS": 1}``. Each +1 or +2. 2014 only: in
  the 2024 rules a background gives the bonuses, so the 2024 builder ignores it.
- ``HomebrewRace.ability_choice``: ``{"choose": 2, "amount": 1, "exclude": ["CHA"]}`` or
  NULL: "plus two +1s of the player's choice, not on Charisma".
- ``HomebrewRace.skills``: canonical skill names (``SKILLS``), e.g. ``["Perception"]``.
- ``HomebrewRace.traits``: ``[{"name": "Hylian Ears", "text": "..."}]``.
- ``HomebrewSubclass.features``: ``[{"level": 3, "name": "...", "text": "..."}]``, kept
  sorted by level.
- ``HomebrewSubclass.always_prepared``: ``{"3": ["Shield"], "5": ["Misty Step"]}`` or NULL.
  Keys are levels as strings (JSON object keys are strings).
- ``HomebrewSubclass.character_class``: the class name as players read it ("Paladin"), the
  ``CharacterClass`` value. Not the enum NAME ("PALADIN") that ``class_features`` and
  ``player_characters`` store through SQLAlchemy's Enum type: this is a plain str column,
  and the name is what the builder's ``CLASSES`` tables are keyed by.

Plan 135 (James, round 2):

- ``HomebrewRace.speeds``: ``{"fly": 30, "swim": 30}`` or NULL, the speeds besides walking.
- ``HomebrewRace.natural_weapons``: ``[{"name": "Claws", "damage": "1d6", "damage_type":
  "slashing", "ability": "STR", "note": ""}]``. Attacks every PC of the race has.
- ``HomebrewSubclass.resources``: counters like Superiority Dice (``SubclassResource``): the
  uses and the die come from level tables, so they grow as the PC levels.
- ``HomebrewFeat``: a DM's own feat; ``power_attack`` is an optional "−5 to hit, +10 damage"
  trade the sheet's attacks offer as a toggle.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel
from pydantic import Field as PField
from pydantic import StringConstraints, field_validator, model_validator
from sqlalchemy import Column
from sqlalchemy.types import JSON, DateTime
from sqlmodel import Field, SQLModel

from domain.enums import RULESET_PATTERN, CharacterClass

ABILITIES = ("STR", "DEX", "CON", "INT", "WIS", "CHA")

# The 18 skills, as the builder spells them (``srd_character_options_2024.SKILLS``, which the
# domain may not import; a test keeps the two lists equal).
SKILLS = (
    "Acrobatics",
    "Animal Handling",
    "Arcana",
    "Athletics",
    "Deception",
    "History",
    "Insight",
    "Intimidation",
    "Investigation",
    "Medicine",
    "Nature",
    "Perception",
    "Performance",
    "Persuasion",
    "Religion",
    "Sleight of Hand",
    "Stealth",
    "Survival",
)

# The 12 classes the builder can make (the SRD ``CLASSES`` of both editions; no Artificer).
CLASS_NAMES = tuple(c.value for c in CharacterClass if c is not CharacterClass.ARTIFICER)

# A race's fixed bonuses plus the player's picks: at most +6 in all, so a Human-style
# "+1 to every ability" race fits (lead, 11/03; the Half-Elf is +4).
MAX_RACE_BONUS = 6
DARKVISION_RANGES = (30, 60, 120)
MAX_TRAITS = 20
MAX_FEATURES = 40
MAX_PREPARED_PER_LEVEL = 10
# Plan 135
SPEED_KINDS = ("fly", "swim", "climb", "burrow")
MAX_NATURAL_WEAPONS = 4
MAX_RESOURCES = 4
DAMAGE_TYPES = (
    "acid",
    "bludgeoning",
    "cold",
    "fire",
    "force",
    "lightning",
    "necrotic",
    "piercing",
    "poison",
    "psychic",
    "radiant",
    "slashing",
    "thunder",
)
# "1d6", "2d4", or a flat number like an unarmed strike's 1.
NATURAL_DAMAGE_PATTERN = r"^(\d{1,2}d(4|6|8|10|12)|\d{1,2})$"
DieSize = Literal["d4", "d6", "d8", "d10", "d12"]
# How a counter's uses can follow the PC instead of a table: the proficiency bonus (or twice
# it), the level (or half, rounded down, at least 1), or an ability modifier (at least 1).
UsesFormulaName = Literal[
    "prof_bonus", "prof_x2", "level", "half_level", "STR", "DEX", "CON", "INT", "WIS", "CHA"
]
FeatCategory = Literal["general", "origin", "fighting_style", "epic_boon"]

HomebrewName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
TraitName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
SpellName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Size = Literal["Small", "Medium"]


class HomebrewConflictError(ValueError):
    """A homebrew change that clashes (an HTTP 409): a name taken, or the row still in use.

    The message is a plain sentence, shown to the DM as is.
    """


class HomebrewNotFoundError(LookupError):
    """No homebrew race or subclass with that id (an HTTP 404)."""


def _aware_now() -> datetime:
    """Now, in UTC (SQLModel refuses naive datetimes for timezone-aware columns)."""
    return datetime.now(UTC)


def _ts_column() -> Column:
    """A NOT NULL timezone-aware timestamp column (one fresh Column per table field)."""
    return Column(DateTime(timezone=True), nullable=False)


# ── Shared validators ───────────────────────────────────────────────────────


_ABILITY_WORDS = {
    "STRENGTH": "STR",
    "DEXTERITY": "DEX",
    "CONSTITUTION": "CON",
    "INTELLIGENCE": "INT",
    "WISDOM": "WIS",
    "CHARISMA": "CHA",
}


def _ability(value: str) -> str:
    """The ability code for ``value`` ("dex" or "Dexterity" → "DEX"), or ValueError."""
    word = str(value).strip().upper()
    code = _ABILITY_WORDS.get(word, word)
    if code not in ABILITIES:
        raise ValueError(f"{value!r} isn't an ability. Use STR, DEX, CON, INT, WIS or CHA.")
    return code


def _check_bonuses(value: Optional[dict[str, Any]]) -> dict[str, int]:
    """Clean ability bonuses: codes upper-cased, +0 dropped, each +1 or +2."""
    out: dict[str, int] = {}
    for key, amount in (value or {}).items():
        code = _ability(key)
        try:
            n = int(amount)
        except (TypeError, ValueError):
            raise ValueError(f"The {code} bonus must be a number: +1 or +2.") from None
        if n == 0:
            continue
        if n not in (1, 2):
            raise ValueError(f"The {code} bonus must be +1 or +2.")
        if code in out:
            raise ValueError(f"{code} is listed twice.")
        out[code] = n
    return out


def _check_skills(value: Optional[list[str]]) -> list[str]:
    """Canonical skill names, each once, in the order given."""
    by_key = {s.casefold(): s for s in SKILLS}
    out: list[str] = []
    for raw in value or []:
        skill = by_key.get(str(raw).strip().casefold())
        if skill is None:
            raise ValueError(
                f"{raw!r} isn't a skill. Pick from the 18 skills on a character sheet."
            )
        if skill not in out:
            out.append(skill)
    return out


def _check_darkvision(value: Optional[int]) -> Optional[int]:
    """None, or 30/60/120 feet (0 means none)."""
    if value is None or value == 0:
        return None
    if value not in DARKVISION_RANGES:
        raise ValueError("Darkvision is 30, 60 or 120 feet, or none.")
    return value


def _check_speed(value: int) -> int:
    """Walking speed in steps of 5 feet."""
    if value % 5:
        raise ValueError("Speed goes in steps of 5 feet, like 25, 30 or 35.")
    return value


def _check_class(value: str) -> str:
    """The class name ("paladin" or "PALADIN" → "Paladin"), one of the 12 classes."""
    key = str(value).strip().casefold()
    for name in CLASS_NAMES:
        if key == name.casefold():
            return name
    raise ValueError(f"{value!r} isn't one of the 12 classes.")


def _check_total(bonuses: dict[str, int], choice: Optional["AbilityChoice"]) -> None:
    """A race gives at most +6 in all, counting the player's picks."""
    total = sum(bonuses.values()) + (choice.choose * choice.amount if choice else 0)
    if total > MAX_RACE_BONUS:
        raise ValueError(
            f"A race gives at most +{MAX_RACE_BONUS} in all, counting the player's picks; "
            f"this one gives +{total}."
        )


def _check_prepared(value: Optional[dict[Any, list[str]]]) -> Optional[dict[str, list[str]]]:
    """Always-prepared spells by level: keys "1"–"20", names trimmed, empty levels dropped."""
    if not value:
        return None
    if not isinstance(value, dict):
        raise ValueError("Always-prepared spells go by level: {level: [spell names]}.")
    out: dict[str, list[str]] = {}
    for key, names in value.items():
        if not isinstance(names, list):
            raise ValueError("List the always-prepared spells for each level.")
        try:
            level = int(str(key).strip())
        except ValueError:
            raise ValueError(f"{key!r} isn't a level: use 1 to 20.") from None
        if not 1 <= level <= 20:
            raise ValueError(f"Level {level} isn't a character level: use 1 to 20.")
        clean: list[str] = []
        for raw in names or []:
            name = str(raw).strip()
            if not name:
                continue
            if len(name) > 120:
                raise ValueError(f"The spell name {name[:40]!r}… is too long.")
            if name.casefold() not in (n.casefold() for n in clean):
                clean.append(name)
        if len(clean) > MAX_PREPARED_PER_LEVEL:
            raise ValueError(
                f"At most {MAX_PREPARED_PER_LEVEL} always-prepared spells at one level."
            )
        if clean:
            out[str(level)] = sorted(out.get(str(level), []) + clean, key=str.casefold)
    return dict(sorted(out.items(), key=lambda kv: int(kv[0]))) or None


def check_speeds(value: Optional[dict[str, Any]]) -> Optional[dict[str, int]]:
    """Other speeds: kinds from ``SPEED_KINDS``, 5–120 ft in steps of 5, 0 dropped."""
    if not value:
        return None
    out: dict[str, int] = {}
    for key, raw in value.items():
        kind = str(key).strip().lower()
        if kind not in SPEED_KINDS:
            raise ValueError(f"{key!r} isn't a speed. Use fly, swim, climb or burrow.")
        try:
            feet = int(raw)
        except (TypeError, ValueError):
            raise ValueError(f"The {kind} speed must be a number of feet.") from None
        if feet == 0:
            continue
        if not 5 <= feet <= 120 or feet % 5:
            raise ValueError(f"The {kind} speed goes from 5 to 120 feet, in steps of 5.")
        out[kind] = feet
    return {k: out[k] for k in SPEED_KINDS if k in out} or None


def _check_level_table(value: Optional[dict[Any, Any]], what: str) -> Optional[dict[str, Any]]:
    """A by-level table ({"3": 4, "7": 5}): keys "1"–"20", sorted; None when empty."""
    if not value:
        return None
    out: dict[int, Any] = {}
    for key, entry in value.items():
        try:
            level = int(str(key).strip())
        except ValueError:
            raise ValueError(f"{key!r} isn't a level: use 1 to 20.") from None
        if not 1 <= level <= 20:
            raise ValueError(f"Level {level} isn't a character level: use 1 to 20.")
        if level in out:
            raise ValueError(f"Level {level} is listed twice in the {what}.")
        out[level] = entry
    return {str(k): out[k] for k in sorted(out)}


def _at_level(table: Optional[dict[str, Any]], level: int) -> Any:
    """The entry for ``level``: the one at the highest listed level not above it, or None."""
    best: Any = None
    for key, entry in (table or {}).items():
        if int(key) <= level:
            best = entry
    return best


# ── Nested shapes ───────────────────────────────────────────────────────────


class NaturalWeapon(BaseModel):
    """A race's built-in attack (claws, a bite, horns): always proficient, no item needed.

    ``ability`` is the attack's ability: "STR", "DEX", or "best" (the higher of the two,
    like a finesse weapon).
    """

    name: TraitName
    damage: str = PField(pattern=NATURAL_DAMAGE_PATTERN)
    damage_type: str
    ability: Literal["STR", "DEX", "best"] = "STR"
    note: str = PField(default="", max_length=200)

    @field_validator("damage", mode="before")
    @classmethod
    def _dice(cls, value: Any) -> Any:
        """Dice in lower case with no spaces ("1D6 " → "1d6")."""
        return str(value).strip().lower().replace(" ", "") if value is not None else value

    @field_validator("damage_type")
    @classmethod
    def _type(cls, value: str) -> str:
        """One of the 13 damage types, in lower case."""
        word = value.strip().lower()
        if word not in DAMAGE_TYPES:
            raise ValueError(f"{value!r} isn't a damage type, like slashing or piercing.")
        return word

    @field_validator("note")
    @classmethod
    def _trim(cls, value: str) -> str:
        """Trim the note."""
        return value.strip()


class SubclassResource(BaseModel):
    """A subclass counter, like Superiority Dice: uses (and a die) that grow with level.

    It arrives at ``level``. The uses come from ``uses`` (a by-level table, which needs an
    entry at ``level``) or from ``uses_formula``, exactly one of the two. ``die`` is an
    optional by-level table of die sizes. A table's entry holds from its level until the next.
    """

    name: TraitName
    level: int = PField(default=3, ge=1, le=20)
    recovery: Literal["short", "long"] = "long"
    uses: Optional[dict[str, int]] = None
    uses_formula: Optional[UsesFormulaName] = None
    die: Optional[dict[str, DieSize]] = None
    text: str = PField(default="", max_length=1000)

    @field_validator("uses", mode="before")
    @classmethod
    def _uses(cls, value: Any) -> Optional[dict[str, Any]]:
        """Levels "1"–"20", sorted."""
        return _check_level_table(value, "uses")

    @field_validator("uses")
    @classmethod
    def _counts(cls, value: Optional[dict[str, int]]) -> Optional[dict[str, int]]:
        """Each count 1 to 50."""
        for level, n in (value or {}).items():
            if not 1 <= n <= 50:
                raise ValueError(f"The uses at level {level} must be 1 to 50.")
        return value

    @field_validator("die", mode="before")
    @classmethod
    def _die(cls, value: Any) -> Optional[dict[str, Any]]:
        """Levels "1"–"20", sorted; sizes in lower case ("D8" → "d8")."""
        table = _check_level_table(value, "die sizes")
        return {k: str(v).strip().lower() for k, v in table.items()} if table else None

    @field_validator("text")
    @classmethod
    def _trim(cls, value: str) -> str:
        """Trim the text."""
        return value.strip()

    @model_validator(mode="after")
    def _one_source(self) -> "SubclassResource":
        """Exactly one of ``uses`` and ``uses_formula``; a table starts at ``level``."""
        if (self.uses is None) == (self.uses_formula is None):
            raise ValueError(
                f"{self.name}: give its uses by level, or say what they follow "
                "(proficiency bonus, level, an ability), not both."
            )
        if self.uses is not None and str(self.level) not in self.uses:
            raise ValueError(
                f"{self.name} arrives at level {self.level}, so its uses need a number "
                f"at level {self.level}."
            )
        return self

    def state_at(
        self, pc_level: int, scores: dict[str, int], prof: int
    ) -> Optional[tuple[int, Optional[str]]]:
        """``(max uses, die size or None)`` for a PC, or None before the counter arrives.

        Args:
            pc_level: The PC's level (in this class).
            scores: Ability scores by code ({"WIS": 16}).
            prof: The PC's proficiency bonus.

        Returns:
            The counter's size and die at that level, or None below ``level``.
        """
        if pc_level < self.level:
            return None
        formula = self.uses_formula
        if formula is None:
            uses = int(_at_level(self.uses, pc_level) or 0)
        elif formula == "prof_bonus":
            uses = prof
        elif formula == "prof_x2":
            uses = 2 * prof
        elif formula == "level":
            uses = pc_level
        elif formula == "half_level":
            uses = pc_level // 2
        else:
            uses = (int(scores.get(formula, 10)) - 10) // 2
        return max(1, uses), _at_level(self.die, pc_level)


class PowerAttack(BaseModel):
    """A feat's "−5 to hit, +10 damage" trade, offered as a toggle on qualifying attacks.

    ``weapons``: "ranged" (any ranged weapon), "heavy" (melee weapons with the Heavy
    property), "melee" (any melee weapon) or "any".
    """

    to_hit: int = PField(ge=-10, le=-1)
    damage: int = PField(ge=1, le=20)
    weapons: Literal["ranged", "heavy", "melee", "any"] = "any"


class AbilityChoice(BaseModel):
    """ "Plus N +1s of the player's choice" on a race (the 2014 Half-Elf's two +1s)."""

    choose: int = PField(ge=1, le=3)
    amount: Literal[1] = 1
    exclude: list[str] = PField(default_factory=list, max_length=6)

    @field_validator("exclude")
    @classmethod
    def _codes(cls, value: list[str]) -> list[str]:
        """Ability codes, each once."""
        return list(dict.fromkeys(_ability(v) for v in value))

    @model_validator(mode="after")
    def _room_to_pick(self) -> "AbilityChoice":
        """Enough abilities left to pick from."""
        if len(ABILITIES) - len(self.exclude) < self.choose:
            raise ValueError("Too many abilities ruled out: the player has nothing left to pick.")
        return self


class RaceTrait(BaseModel):
    """One racial trait: a short name and what it does."""

    name: TraitName
    text: str = PField(default="", max_length=1000)

    @field_validator("text")
    @classmethod
    def _trim(cls, value: str) -> str:
        """Trim the text."""
        return value.strip()


class SubclassFeature(BaseModel):
    """One subclass feature: the level it arrives at, its name and what it does."""

    level: int = PField(ge=1, le=20)
    name: TraitName
    text: str = PField(default="", max_length=2000)

    @field_validator("text")
    @classmethod
    def _trim(cls, value: str) -> str:
        """Trim the text."""
        return value.strip()


# ── Races ───────────────────────────────────────────────────────────────────


class HomebrewRace(SQLModel, table=True):
    """A DM's homebrew race (species), offered in the builder of every campaign they run."""

    __tablename__ = "homebrew_races"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_by_email: str = Field(max_length=320, index=True)
    name: str = Field(min_length=1, max_length=100)
    # "2024" | "2014" | NULL (both editions).
    ruleset: Optional[str] = Field(default=None, max_length=4)
    size: str = Field(default="Medium", max_length=10)
    speed: int = Field(default=30)
    ability_bonuses: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    ability_choice: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    skills: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    skill_choice: int = Field(default=0)
    traits: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    languages: str = Field(default="", max_length=200)
    hp_per_level: int = Field(default=0)
    darkvision: Optional[int] = Field(default=None)
    # Plan 135
    speeds: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    natural_weapons: list = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]")
    )
    created_at: datetime = Field(default_factory=_aware_now, sa_column=_ts_column())
    updated_at: datetime = Field(default_factory=_aware_now, sa_column=_ts_column())


class _RaceChecks(BaseModel):
    """The race form's checks, shared by the create and the partial update (None = unset)."""

    @field_validator("ability_bonuses", check_fields=False)
    @classmethod
    def _bonuses(cls, value: Optional[dict[str, int]]) -> Optional[dict[str, int]]:
        """Ability codes upper-cased, +0 dropped, each +1 or +2."""
        return None if value is None else _check_bonuses(value)

    @field_validator("skills", check_fields=False)
    @classmethod
    def _skills(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        """Canonical skill names, each once."""
        return None if value is None else _check_skills(value)

    @field_validator("darkvision", check_fields=False)
    @classmethod
    def _darkvision(cls, value: Optional[int]) -> Optional[int]:
        """30, 60 or 120 feet, or none."""
        return _check_darkvision(value)

    @field_validator("speed", check_fields=False)
    @classmethod
    def _speed(cls, value: Optional[int]) -> Optional[int]:
        """Steps of 5 feet."""
        return None if value is None else _check_speed(value)

    @field_validator("languages", check_fields=False)
    @classmethod
    def _languages(cls, value: Optional[str]) -> Optional[str]:
        """Trim the languages line."""
        return None if value is None else value.strip()

    @field_validator("speeds", mode="before", check_fields=False)
    @classmethod
    def _speeds(cls, value: Any) -> Optional[dict[str, int]]:
        """Fly, swim, climb or burrow; 5–120 ft in steps of 5; 0 dropped."""
        return check_speeds(value)


class HomebrewRaceCreate(_RaceChecks):
    """A new homebrew race, as the Race form sends it."""

    name: HomebrewName
    ruleset: Optional[str] = PField(default=None, pattern=RULESET_PATTERN)
    size: Size = "Medium"
    speed: int = PField(default=30, ge=10, le=60)
    ability_bonuses: dict[str, int] = PField(default_factory=dict)
    ability_choice: Optional[AbilityChoice] = None
    skills: list[str] = PField(default_factory=list, max_length=len(SKILLS))
    skill_choice: int = PField(default=0, ge=0, le=4)
    traits: list[RaceTrait] = PField(default_factory=list, max_length=MAX_TRAITS)
    languages: str = PField(default="", max_length=200)
    hp_per_level: int = PField(default=0, ge=0, le=2)
    darkvision: Optional[int] = None
    speeds: Optional[dict[str, int]] = None
    natural_weapons: list[NaturalWeapon] = PField(
        default_factory=list, max_length=MAX_NATURAL_WEAPONS
    )

    @model_validator(mode="after")
    def _within_total(self) -> "HomebrewRaceCreate":
        """At most +6 in all, counting the player's picks."""
        _check_total(self.ability_bonuses, self.ability_choice)
        return self


class HomebrewRaceUpdate(_RaceChecks):
    """A partial change to a homebrew race (the same limits as ``HomebrewRaceCreate``).

    ``ruleset``, ``ability_choice``, ``darkvision`` and ``speeds`` may be cleared with null
    (null rules = both editions); the other fields can't be null. The +6 total is checked by
    the service against the merged row.
    """

    name: Optional[HomebrewName] = None
    ruleset: Optional[str] = PField(default=None, pattern=RULESET_PATTERN)
    size: Optional[Size] = None
    speed: Optional[int] = PField(default=None, ge=10, le=60)
    ability_bonuses: Optional[dict[str, int]] = None
    ability_choice: Optional[AbilityChoice] = None
    skills: Optional[list[str]] = PField(default=None, max_length=len(SKILLS))
    skill_choice: Optional[int] = PField(default=None, ge=0, le=4)
    traits: Optional[list[RaceTrait]] = PField(default=None, max_length=MAX_TRAITS)
    languages: Optional[str] = PField(default=None, max_length=200)
    hp_per_level: Optional[int] = PField(default=None, ge=0, le=2)
    darkvision: Optional[int] = None
    speeds: Optional[dict[str, int]] = None
    natural_weapons: Optional[list[NaturalWeapon]] = PField(
        default=None, max_length=MAX_NATURAL_WEAPONS
    )

    @field_validator(
        "name",
        "size",
        "speed",
        "ability_bonuses",
        "skills",
        "skill_choice",
        "traits",
        "languages",
        "hp_per_level",
        "natural_weapons",
        mode="before",
    )
    @classmethod
    def _not_null(cls, value: Any) -> Any:
        """Refuse an explicit null for a field every race has."""
        if value is None:
            raise ValueError("can't be empty")
        return value


def check_race_total(bonuses: dict[str, int], choice: Optional[dict[str, Any]]) -> None:
    """Refuse a race over +4 in all (the service checks a partial update's merged row).

    Args:
        bonuses: The fixed ability bonuses.
        choice: The ``ability_choice`` dict, or None.

    Raises:
        ValueError: If the fixed bonuses plus the player's picks pass +4.
    """
    _check_total(bonuses, AbilityChoice.model_validate(choice) if choice else None)


class HomebrewRaceRead(BaseModel):
    """A homebrew race as the API returns it."""

    id: uuid.UUID
    created_by_email: str
    name: str
    ruleset: Optional[str] = None
    size: str
    speed: int
    ability_bonuses: dict[str, int] = PField(default_factory=dict)
    ability_choice: Optional[AbilityChoice] = None
    skills: list[str] = PField(default_factory=list)
    skill_choice: int = 0
    traits: list[RaceTrait] = PField(default_factory=list)
    languages: str = ""
    hp_per_level: int = 0
    darkvision: Optional[int] = None
    speeds: Optional[dict[str, int]] = None
    natural_weapons: list[NaturalWeapon] = PField(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("ability_bonuses", mode="before")
    @classmethod
    def _no_bonuses(cls, value: Any) -> Any:
        """A NULL JSON column reads as no bonuses."""
        return {} if value is None else value

    @field_validator("skills", "traits", "natural_weapons", mode="before")
    @classmethod
    def _no_rows(cls, value: Any) -> Any:
        """A NULL JSON column reads as an empty list."""
        return [] if value is None else value


class RaceTemplate(BaseModel):
    """An SRD race laid out as a homebrew race, to start a new one from (no checks).

    The SRD Human's +1 to all six (+6) is over a homebrew race's +4, so this shape doesn't
    validate; the form shows what to change.
    """

    name: str
    ruleset: str
    size: str
    speed: int
    ability_bonuses: dict[str, int] = PField(default_factory=dict)
    ability_choice: Optional[dict[str, Any]] = None
    skills: list[str] = PField(default_factory=list)
    skill_choice: int = 0
    traits: list[RaceTrait] = PField(default_factory=list)
    languages: str = ""
    hp_per_level: int = 0
    darkvision: Optional[int] = None
    speeds: Optional[dict[str, int]] = None
    natural_weapons: list[NaturalWeapon] = PField(default_factory=list)


# ── Subclasses ──────────────────────────────────────────────────────────────


class HomebrewSubclass(SQLModel, table=True):
    """A DM's homebrew subclass for one class, offered wherever that class picks one."""

    __tablename__ = "homebrew_subclasses"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_by_email: str = Field(max_length=320, index=True)
    name: str = Field(min_length=1, max_length=100)
    # The class name ("Paladin"), a CharacterClass value. See the module docstring.
    character_class: str = Field(max_length=20)
    ruleset: Optional[str] = Field(default=None, max_length=4)
    features: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    always_prepared: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    blurb: str = Field(default="", max_length=300)
    # Plan 135: counters (``SubclassResource``), like Superiority Dice.
    resources: list = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]")
    )
    created_at: datetime = Field(default_factory=_aware_now, sa_column=_ts_column())
    updated_at: datetime = Field(default_factory=_aware_now, sa_column=_ts_column())


class _SubclassChecks(BaseModel):
    """The subclass form's checks, shared by the create and the partial update."""

    @field_validator("character_class", check_fields=False)
    @classmethod
    def _cls(cls, value: Optional[str]) -> Optional[str]:
        """One of the 12 class names ("paladin" → "Paladin")."""
        return None if value is None else _check_class(value)

    @field_validator("features", check_fields=False)
    @classmethod
    def _features(cls, value: Optional[list[SubclassFeature]]) -> Optional[list[SubclassFeature]]:
        """Features in level order (a stable sort keeps the DM's order within a level)."""
        return None if value is None else sorted(value, key=lambda f: f.level)

    @field_validator("always_prepared", mode="before", check_fields=False)
    @classmethod
    def _prepared(cls, value: Any) -> Optional[dict[str, list[str]]]:
        """Levels "1"–"20", names trimmed and de-duplicated, empty levels dropped."""
        return _check_prepared(value)

    @field_validator("blurb", check_fields=False)
    @classmethod
    def _blurb(cls, value: Optional[str]) -> Optional[str]:
        """Trim the blurb."""
        return None if value is None else value.strip()

    @field_validator("resources", check_fields=False)
    @classmethod
    def _resources(
        cls, value: Optional[list[SubclassResource]]
    ) -> Optional[list[SubclassResource]]:
        """Counter names unique within the subclass, ignoring case."""
        seen: set[str] = set()
        for r in value or []:
            if r.name.casefold() in seen:
                raise ValueError(f"Two counters are called {r.name}. Give each its own name.")
            seen.add(r.name.casefold())
        return value


class HomebrewSubclassCreate(_SubclassChecks):
    """A new homebrew subclass, as the Subclass form sends it."""

    name: HomebrewName
    character_class: str
    ruleset: Optional[str] = PField(default=None, pattern=RULESET_PATTERN)
    features: list[SubclassFeature] = PField(default_factory=list, max_length=MAX_FEATURES)
    always_prepared: Optional[dict[str, list[str]]] = None
    blurb: str = PField(default="", max_length=300)
    resources: list[SubclassResource] = PField(default_factory=list, max_length=MAX_RESOURCES)


class HomebrewSubclassUpdate(_SubclassChecks):
    """A partial change to a homebrew subclass (the same limits as the create).

    ``ruleset`` and ``always_prepared`` may be cleared with null; the rest can't be null.
    """

    name: Optional[HomebrewName] = None
    character_class: Optional[str] = None
    ruleset: Optional[str] = PField(default=None, pattern=RULESET_PATTERN)
    features: Optional[list[SubclassFeature]] = PField(default=None, max_length=MAX_FEATURES)
    always_prepared: Optional[dict[str, list[str]]] = None
    blurb: Optional[str] = PField(default=None, max_length=300)
    resources: Optional[list[SubclassResource]] = PField(default=None, max_length=MAX_RESOURCES)

    @field_validator("name", "character_class", "features", "blurb", "resources", mode="before")
    @classmethod
    def _not_null(cls, value: Any) -> Any:
        """Refuse an explicit null for a field every subclass has."""
        if value is None:
            raise ValueError("can't be empty")
        return value


class HomebrewSubclassRead(BaseModel):
    """A homebrew subclass as the API returns it."""

    id: uuid.UUID
    created_by_email: str
    name: str
    character_class: str
    ruleset: Optional[str] = None
    features: list[SubclassFeature] = PField(default_factory=list)
    always_prepared: Optional[dict[str, list[str]]] = None
    blurb: str = ""
    resources: list[SubclassResource] = PField(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("features", "resources", mode="before")
    @classmethod
    def _none_is_empty(cls, value: Any) -> Any:
        """A NULL JSON column reads as empty."""
        return [] if value is None else value


# ── Feats (Plan 135) ────────────────────────────────────────────────────────


class HomebrewFeat(SQLModel, table=True):
    """A DM's homebrew feat, offered wherever a character in their campaigns picks a feat.

    ``asi_options`` is where the feat's +1 may go: None (no increase), "any" (all six), or a
    list of ability codes, the way the rules' ``FEATS`` rows say it. ``prerequisite`` is
    shown to the player and not enforced. ``power_attack`` is a ``PowerAttack`` or None.
    """

    __tablename__ = "homebrew_feats"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_by_email: str = Field(max_length=320, index=True)
    name: str = Field(min_length=1, max_length=100)
    ruleset: Optional[str] = Field(default=None, max_length=4)
    category: str = Field(default="general", max_length=20)
    blurb: str = Field(default="", max_length=300)
    description: str = Field(default="", max_length=3000)
    prerequisite: str = Field(default="", max_length=200)
    asi_options: Optional[Any] = Field(default=None, sa_column=Column(JSON, nullable=True))
    repeatable: bool = Field(default=False)
    power_attack: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    created_at: datetime = Field(default_factory=_aware_now, sa_column=_ts_column())
    updated_at: datetime = Field(default_factory=_aware_now, sa_column=_ts_column())


def _check_asi_options(value: Any) -> Optional[Union[str, list[str]]]:
    """None, "any", or ability codes each once (an empty list is None)."""
    if value is None:
        return None
    if isinstance(value, str):
        if value.strip().lower() == "any":
            return "any"
        raise ValueError('The +1 goes to "any" ability or to a list of abilities.')
    codes = list(dict.fromkeys(_ability(v) for v in value))
    if len(codes) == len(ABILITIES):
        return "any"
    return codes or None


class _FeatChecks(BaseModel):
    """The feat form's checks, shared by the create and the partial update."""

    @field_validator("asi_options", mode="before", check_fields=False)
    @classmethod
    def _asi(cls, value: Any) -> Optional[Union[str, list[str]]]:
        """None, "any", or ability codes each once."""
        return _check_asi_options(value)

    @field_validator("blurb", "description", "prerequisite", check_fields=False)
    @classmethod
    def _trim(cls, value: Optional[str]) -> Optional[str]:
        """Trim the text."""
        return None if value is None else value.strip()


class HomebrewFeatCreate(_FeatChecks):
    """A new homebrew feat, as the Feat form sends it."""

    name: HomebrewName
    ruleset: Optional[str] = PField(default=None, pattern=RULESET_PATTERN)
    category: FeatCategory = "general"
    blurb: str = PField(default="", max_length=300)
    description: str = PField(default="", max_length=3000)
    prerequisite: str = PField(default="", max_length=200)
    asi_options: Optional[Union[Literal["any"], list[str]]] = None
    repeatable: bool = False
    power_attack: Optional[PowerAttack] = None


class HomebrewFeatUpdate(_FeatChecks):
    """A partial change to a homebrew feat (the same limits as the create).

    ``ruleset``, ``asi_options`` and ``power_attack`` may be cleared with null; the rest
    can't be null.
    """

    name: Optional[HomebrewName] = None
    ruleset: Optional[str] = PField(default=None, pattern=RULESET_PATTERN)
    category: Optional[FeatCategory] = None
    blurb: Optional[str] = PField(default=None, max_length=300)
    description: Optional[str] = PField(default=None, max_length=3000)
    prerequisite: Optional[str] = PField(default=None, max_length=200)
    asi_options: Optional[Union[Literal["any"], list[str]]] = None
    repeatable: Optional[bool] = None
    power_attack: Optional[PowerAttack] = None

    @field_validator(
        "name", "category", "blurb", "description", "prerequisite", "repeatable", mode="before"
    )
    @classmethod
    def _not_null(cls, value: Any) -> Any:
        """Refuse an explicit null for a field every feat has."""
        if value is None:
            raise ValueError("can't be empty")
        return value


class HomebrewFeatRead(BaseModel):
    """A homebrew feat as the API returns it."""

    id: uuid.UUID
    created_by_email: str
    name: str
    ruleset: Optional[str] = None
    category: str = "general"
    blurb: str = ""
    description: str = ""
    prerequisite: str = ""
    asi_options: Optional[Union[Literal["any"], list[str]]] = None
    repeatable: bool = False
    power_attack: Optional[PowerAttack] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
