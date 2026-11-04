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
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, Optional

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


# ── Nested shapes ───────────────────────────────────────────────────────────


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

    @model_validator(mode="after")
    def _within_total(self) -> "HomebrewRaceCreate":
        """At most +6 in all, counting the player's picks."""
        _check_total(self.ability_bonuses, self.ability_choice)
        return self


class HomebrewRaceUpdate(_RaceChecks):
    """A partial change to a homebrew race (the same limits as ``HomebrewRaceCreate``).

    ``ruleset``, ``ability_choice`` and ``darkvision`` may be cleared with null (null rules =
    both editions); the other fields can't be null. The +4 total is checked by the service
    against the merged row.
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("ability_bonuses", mode="before")
    @classmethod
    def _no_bonuses(cls, value: Any) -> Any:
        """A NULL JSON column reads as no bonuses."""
        return {} if value is None else value

    @field_validator("skills", "traits", mode="before")
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


class HomebrewSubclassCreate(_SubclassChecks):
    """A new homebrew subclass, as the Subclass form sends it."""

    name: HomebrewName
    character_class: str
    ruleset: Optional[str] = PField(default=None, pattern=RULESET_PATTERN)
    features: list[SubclassFeature] = PField(default_factory=list, max_length=MAX_FEATURES)
    always_prepared: Optional[dict[str, list[str]]] = None
    blurb: str = PField(default="", max_length=300)


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

    @field_validator("name", "character_class", "features", "blurb", mode="before")
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("features", mode="before")
    @classmethod
    def _none_is_empty(cls, value: Any) -> Any:
        """A NULL JSON column reads as empty."""
        return [] if value is None else value
