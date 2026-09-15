"""Practice Arena models (Plans 84, 85, 87).

A one-on-one sparring match between a player's real sheet and an SRD foe,
refereed by the rules engine in ``services/arena_service.py``. Nothing here
touches the database: the whole fight is one JSON document the phone holds
between turns (HMAC-sealed), so a practice round never writes to the real
character.
"""

import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field

Cost = Literal["action", "bonus", "reaction", "free"]


class ArenaAttack(BaseModel):
    """One thing the player can do: a weapon, a cantrip, a spell, a feature with dice.

    ``effect`` names the special handling the referee applies (``divine_smite``,
    ``guiding_bolt``, ``hex``, ``sleep`` …); attacks without one are plain
    attack-roll or save-based damage.
    """

    key: str
    name: str
    kind: Literal["weapon", "unarmed", "cantrip", "spell", "heal", "buff", "feature"]
    cost: Cost = "action"
    hit_bonus: Optional[int] = None
    save_ability: Optional[str] = None
    save_dc: Optional[int] = None
    half_on_save: bool = False
    damage: str = Field(default="0", max_length=40)
    damage_type: str = "bludgeoning"
    spell_level: int = Field(default=0, ge=0, le=9)
    melee: bool = True
    finesse: bool = False
    two_handed: bool = False
    effect: Optional[str] = None
    # Riders that need a hit this turn (Divine Smite, Searing Smite, Stunning Strike).
    after_melee_hit: bool = False
    note: str = ""
    # Plan 89 — per-slot-level scaling: a die ("1d8"), "count" (one more dart/ray), or "".
    upcast: str = ""


class ArenaFeature(BaseModel):
    """A modeled class feature with uses left in this fight."""

    key: str
    name: str
    uses_left: int = Field(ge=0)
    cost: Cost
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


class ArenaBeast(BaseModel):
    """A Wild Shape form: the beast's numbers over the druid's HP (Plan 87)."""

    name: str
    ac: int
    temp_hp: int
    attacks: list[ArenaFoeAttack] = Field(default_factory=list)


class ArenaPc(ArenaSide):
    """The player's side, built from their real sheet at the start of the fight."""

    level: int = 1
    character_class: str = ""
    subclass: str = ""
    # Plan 106 — the face at the top of the card. The sheet's portrait, copied
    # in at the start of the fight like every other number here.
    portrait_url: Optional[str] = None
    feats: list[str] = Field(default_factory=list)
    attacks: list[ArenaAttack] = Field(default_factory=list)
    features: list[ArenaFeature] = Field(default_factory=list)
    slots: dict[str, int] = Field(default_factory=dict)
    # Plan 89 — the sheet's maximum per level: the phone shows 3/4, a regained slot is real.
    slots_max: dict[str, int] = Field(default_factory=dict)
    raging: bool = False
    attacks_per_action: int = Field(default=1, ge=1, le=4)
    # Plan 87 — the numbers riders need.
    prof: int = 2
    mods: dict[str, int] = Field(default_factory=dict)
    spell_mod: int = 0
    spell_dc: Optional[int] = None
    spell_attack: Optional[int] = None
    sneak_dice: int = 0
    martial_die: int = 0
    focus: int = 0
    sorcery: int = 0
    sorcery_max: int = 0
    temp_hp: int = 0
    ac_bonus: int = 0
    beast: Optional[ArenaBeast] = None
    # Plan 88 — subclass layer.
    metamagic: list[str] = Field(default_factory=list)
    wild_magic: bool = False
    starry_form: Optional[str] = None


class ArenaFoe(ArenaSide):
    """The foe, snapshotted from its stat block."""

    monster_id: Optional[str] = None
    cr: str = ""
    creature_type: str = ""
    attacks: list[ArenaFoeAttack] = Field(default_factory=list)
    saves: dict[str, int] = Field(default_factory=dict)
    conditions: list[str] = Field(default_factory=list)
    image_url: Optional[str] = None


class ArenaSlot(BaseModel):
    """One combatant's record for the turns when it is not acting (Plan 101).

    The engine only ever has one actor and one target in play, so a fight of
    any size is run by stowing the acting creature back here at the end of its
    turn and drawing the next one into the working set. Everything that has to
    survive somebody else's turn lives on the slot: hit points and slots ride
    on ``pc``/``foe``, and the rest is listed out below.
    """

    kind: Literal["pc", "monster"]
    label: str = ""
    # Which real character sits here. A monster has none. On a duel fought
    # across several devices this is how the server knows whose turn it is.
    pc_id: Optional[uuid.UUID] = None
    # 0 is the party's side. In a free-for-all duel every combatant gets its
    # own team number, so everyone is everyone else's enemy.
    team: int = 0
    # True when the referee decides this side's turns: a monster always, and an
    # ally in a boss battle that the player is not controlling.
    auto: bool = False
    pc: Optional[ArenaPc] = None
    foe: Optional[ArenaFoe] = None
    # Carried across other creatures' turns.
    concentration: Optional[str] = None
    marks: list[str] = Field(default_factory=list)
    blessed: bool = False
    faith: bool = False
    innate_sorcery: int = 0
    spiritual_weapon: bool = False
    effects: dict[str, int] = Field(default_factory=dict)
    tides_primed: bool = False
    # A reaction comes back at the start of your own turn, so it belongs here.
    reaction_used: bool = False
    initiative: int = 0


class ArenaLogLine(BaseModel):
    """One line of the fight log, with the dice that produced it."""

    round: int
    who: Literal["you", "foe", "ref"]
    text: str
    dice: Optional[str] = None
    hit: Optional[bool] = None
    crit: bool = False
    # Plan 105 — which creature's turn wrote this line. Every line of one turn
    # shares a beat, and the phone reveals a whole beat at a time.
    beat: int = 0
    # Everybody's hit points the moment this line was written, in roster order
    # (or ``[you, foe]`` in a solo fight). The bars are drawn from the line
    # being shown, so they fall in step with the narration instead of jumping
    # to the end of the fight.
    hp: Optional[list[int]] = None


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

    version: int = 2
    pc_id: uuid.UUID
    round: int = Field(default=1, ge=1)
    phase: Literal["your_turn", "over"] = "your_turn"
    action_used: bool = False
    bonus_used: bool = False
    extra_action: bool = False
    reaction_used: bool = False
    dodging: bool = False
    attacks_left: int = Field(default=0, ge=0)
    # Plan 87 — turn state the riders read.
    hit_this_turn: bool = False
    melee_hit_this_turn: bool = False
    sneak_used: bool = False
    stun_used: bool = False
    reckless: bool = False
    adv_next: bool = False
    foe_disadv_next: bool = False
    concentration: Optional[str] = None
    marks: list[str] = Field(default_factory=list)
    blessed: bool = False
    faith: bool = False
    innate_sorcery: int = 0
    spiritual_weapon: bool = False
    auto_reactions: bool = True
    # Plan 88 — timed effects (surges, forms): key → rounds left.
    effects: dict[str, int] = Field(default_factory=dict)
    tides_primed: bool = False
    result: Optional[Literal["won", "lost", "fled"]] = None
    pc: ArenaPc
    foe: ArenaFoe
    # Plan 101 — a fight of more than two. Empty for the solo arena, which
    # keeps exactly its old shape and its old code path.
    mode: Literal["solo", "duel", "boss"] = "solo"
    # Who the working set is aimed at. A real field: the whole state round
    # trips to the phone between turns.
    target_index: Optional[int] = None
    roster: list[ArenaSlot] = Field(default_factory=list)
    order: list[int] = Field(default_factory=list)
    turn: int = 0
    # Plan 105 — bumped whenever a new creature takes over, so the log can say
    # where one turn's lines end and the next begin.
    beat: int = 0
    log: list[ArenaLogLine] = Field(default_factory=list)
    stats: ArenaStats = Field(default_factory=ArenaStats)
    tips: list[str] = Field(default_factory=list)
    sig: str = ""


class ArenaAction(BaseModel):
    """What the player chose to do."""

    kind: Literal[
        "attack",
        "cast",
        "dodge",
        "feature",
        "reckless",
        "wild_shape",
        "toggle_reactions",
        "end_turn",
        "flee",
        # Plan 101 — switch which enemy you are swinging at. Costs nothing.
        "aim",
    ]
    key: Optional[str] = None
    slot_level: Optional[int] = Field(default=None, ge=1, le=9)
    # Roster index to aim at. None means the first living enemy.
    target: Optional[int] = Field(default=None, ge=0)


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
    tier: str = "fits"
    image_url: Optional[str] = None


class ArenaDuelBody(BaseModel):
    """Start a hot-seat duel between two or more characters (Plan 101)."""

    pc_ids: list[uuid.UUID] = Field(min_length=2, max_length=8)


class ArenaBossBody(BaseModel):
    """Start a boss battle: the party, one monster, one character you drive."""

    pc_ids: list[uuid.UUID] = Field(min_length=1, max_length=8)
    monster_id: uuid.UUID
    controlled: uuid.UUID
