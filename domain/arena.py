"""Practice Arena models (Plan 84).

A one-on-one sparring match between a player's real sheet and an SRD foe,
refereed by the rules engine in ``services/arena_service.py``. Nothing here
touches the database: the whole fight is one JSON document the phone holds
between turns, so a practice round never writes to the real character.
"""

import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field


class ArenaAttack(BaseModel):
    """One thing the player can do with their action: a weapon, a cantrip, a spell."""

    key: str
    name: str
    kind: Literal["weapon", "unarmed", "cantrip", "spell"]
    # Attack-roll attacks carry a to-hit bonus; save-based spells a DC the foe rolls against.
    hit_bonus: Optional[int] = None
    save_ability: Optional[str] = None
    save_dc: Optional[int] = None
    half_on_save: bool = False
    damage: str = Field(min_length=1, max_length=40)
    damage_type: str = "bludgeoning"
    spell_level: int = Field(default=0, ge=0, le=9)
    melee: bool = True
    note: str = ""


class ArenaFeature(BaseModel):
    """A modeled class feature with uses left in this fight."""

    key: Literal["second_wind", "action_surge", "rage", "cunning_dodge", "lay_on_hands"]
    name: str
    uses_left: int = Field(ge=0)
    cost: Literal["action", "bonus", "free"]
    blurb: str


class ArenaFoeAttack(BaseModel):
    """A foe's attack parsed from its stat block's action text."""

    name: str
    hit_bonus: int
    damage: str
    damage_type: str = ""
    count: int = Field(default=1, ge=1, le=6)


class ArenaSide(BaseModel):
    """Shared combatant numbers."""

    name: str
    ac: int
    hp: int
    hp_max: int
    dex_mod: int = 0


class ArenaPc(ArenaSide):
    """The player's side, built from their real sheet at the start of the fight."""

    level: int = 1
    character_class: str = ""
    attacks: list[ArenaAttack] = Field(default_factory=list)
    features: list[ArenaFeature] = Field(default_factory=list)
    slots: dict[str, int] = Field(default_factory=dict)
    raging: bool = False
    # Plan 85 — Extra Attack: weapon swings per Attack action.
    attacks_per_action: int = Field(default=1, ge=1, le=4)


class ArenaFoe(ArenaSide):
    """The foe, snapshotted from its stat block."""

    monster_id: Optional[str] = None
    cr: str = ""
    creature_type: str = ""
    attacks: list[ArenaFoeAttack] = Field(default_factory=list)
    saves: dict[str, int] = Field(default_factory=dict)
    image_url: Optional[str] = None


class ArenaLogLine(BaseModel):
    """One line of the fight log, with the dice that produced it."""

    round: int
    who: Literal["you", "foe", "ref"]
    text: str
    dice: Optional[str] = None
    hit: Optional[bool] = None
    crit: bool = False


class ArenaStats(BaseModel):
    """What happened, for the end screen."""

    dealt: int = 0
    taken: int = 0
    hits: int = 0
    misses: int = 0
    crits: int = 0
    rounds: int = 0
    slots_spent: int = 0
    healed: int = 0


class ArenaState(BaseModel):
    """The whole fight. The phone holds it; the server only ever transforms it."""

    version: int = 1
    pc_id: uuid.UUID
    round: int = Field(default=1, ge=1)
    phase: Literal["your_turn", "over"] = "your_turn"
    action_used: bool = False
    bonus_used: bool = False
    extra_action: bool = False
    dodging: bool = False
    # Plan 85 — swings left in the current Attack action (Extra Attack).
    attacks_left: int = Field(default=0, ge=0)
    result: Optional[Literal["won", "lost", "fled"]] = None
    pc: ArenaPc
    foe: ArenaFoe
    log: list[ArenaLogLine] = Field(default_factory=list)
    stats: ArenaStats = Field(default_factory=ArenaStats)
    tips: list[str] = Field(default_factory=list)
    # Plan 85 — tamper seal; the server refuses a state it didn't hand out.
    sig: str = ""


class ArenaAction(BaseModel):
    """What the player chose to do."""

    kind: Literal["attack", "cast", "dodge", "feature", "end_turn", "flee"]
    key: Optional[str] = None


class ArenaStartBody(BaseModel):
    """Start a fight: a specific foe, or none for one that fits the level."""

    monster_id: Optional[uuid.UUID] = None


class ArenaActBody(BaseModel):
    """One turn: the state the phone holds plus the action taken."""

    state: ArenaState
    action: ArenaAction


class ArenaFoeOption(BaseModel):
    """A foe the player can pick from the catalog."""

    id: uuid.UUID
    name: str
    cr: str
    ac: int
    hp_average: int
    creature_type: str
    suggested: bool = False
    # Plan 85 — "easy" | "fits" | "tough" | "deadly" against the PC's level.
    tier: str = "fits"
    image_url: Optional[str] = None
