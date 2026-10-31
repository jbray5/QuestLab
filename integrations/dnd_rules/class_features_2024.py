"""Curated 2024 PHB / SRD 5.5e class features (Plans 00021, 128).

Two kinds of data live here:

- ``CLASS_FEATURES_2024``: the *tracked* catalog. Features with limited uses
  (a counter or a pool the table spends and a rest brings back), plus a few
  older passive rows kept so existing databases stay in step. The service
  seeds every row that is missing, matched on name + class + subclass.
- ``features_for_level``: every class and subclass feature a character has
  at its level, passive ones included (Extra Attack, Weapon Mastery, auras),
  each with a plain-words note. Names come from the SRD 5.2.1 class tables in
  ``levelup_2024``; the notes are our own words, not book text.

Sources:
- D&D 5.5e SRD 5.2.1 (Wizards of the Coast, CC-BY-4.0)
- Hand-curated against the 2024 PHB for features the SRD covers
"""

from __future__ import annotations

import math
from typing import Any, Optional

from domain.character import ClassFeatureCreate
from domain.enums import CharacterClass, RecoveryType, UsesFormula
from integrations.dnd_rules import levelup_2024 as rules

# Plan 77 — these subclasses are not in SRD 5.2.1; their feature text is
# seeded for the deployment owner's own table and never granted to, or
# listed for, anyone else (see feature_service + auth_service.personal_content_allowed).
NON_SRD_SUBCLASSES: frozenset[str] = frozenset({"Circle of Stars", "Soulknife"})

_B = CharacterClass.BARBARIAN
_BD = CharacterClass.BARD
_C = CharacterClass.CLERIC
_D = CharacterClass.DRUID
_F = CharacterClass.FIGHTER
_M = CharacterClass.MONK
_P = CharacterClass.PALADIN
_R = CharacterClass.RANGER
_RO = CharacterClass.ROGUE
_S = CharacterClass.SORCERER
_W = CharacterClass.WARLOCK
_WZ = CharacterClass.WIZARD


def _row(
    name: str,
    character_class: CharacterClass,
    level: int,
    recovery: RecoveryType,
    uses: UsesFormula,
    description: str,
    subclass: Optional[str] = None,
) -> ClassFeatureCreate:
    """One validated catalog row (keeps the table below readable)."""
    return ClassFeatureCreate(
        name=name,
        character_class=character_class,
        subclass=subclass,
        level_acquired=level,
        recovery=recovery,
        uses_formula=uses,
        description=description,
    )


_LONG = RecoveryType.LONG
_SHORT = RecoveryType.SHORT
_SHORT_ONE = RecoveryType.SHORT_ONE
_NONE = RecoveryType.NONE

CLASS_FEATURES_2024: list[ClassFeatureCreate] = [
    # ── Barbarian ────────────────────────────────────────────────────────
    _row(
        "Rage",
        _B,
        1,
        _SHORT_ONE,
        UsesFormula.RAGE,
        "Bonus action: enter a rage. Advantage on STR checks/saves, +rage damage on STR "
        "attacks, resistance to B/P/S damage. 2024 RAW: regain one use on a short rest, all "
        "uses on a long rest.",
    ),
    _row(
        "Persistent Rage",
        _B,
        15,
        _LONG,
        UsesFormula.FIXED_1,
        "When you roll initiative, regain all expended Rage uses. Once per long rest.",
    ),
    _row(
        "Intimidating Presence",
        _B,
        14,
        _LONG,
        UsesFormula.FIXED_1,
        "Bonus action: frighten creatures of your choice within 30 ft (WIS save). Once per "
        "long rest, or spend a Rage use to restore it.",
        subclass="Berserker",
    ),
    # ── Bard ─────────────────────────────────────────────────────────────
    _row(
        "Bardic Inspiration",
        _BD,
        1,
        _LONG,  # Font of Inspiration (L5) adds short-rest recovery; tracked as LONG
        UsesFormula.CHA_MOD,
        "Bonus action: give a creature within 60 ft a Bardic Inspiration die (d6 at L1). "
        "They can add it to one ability check, attack roll, or saving throw within 10 minutes.",
    ),
    # ── Cleric ───────────────────────────────────────────────────────────
    _row(
        "Channel Divinity",
        _C,
        2,
        _SHORT_ONE,
        UsesFormula.CHANNEL_DIVINITY,
        "Use a Channel Divinity option (Divine Spark or Turn Undead; others granted by "
        "subclass). 2024 RAW: regain one use on a short rest, all uses on a long rest.",
    ),
    _row(
        "Divine Intervention",
        _C,
        10,
        _LONG,
        UsesFormula.FIXED_1,
        "Magic action: cast any Cleric spell of level 5 or lower without a slot or material "
        "components. Once per long rest.",
    ),
    # ── Druid ────────────────────────────────────────────────────────────
    _row(
        "Wild Shape",
        _D,
        2,
        _SHORT_ONE,
        UsesFormula.FIXED_2,  # 2, 3 at L6, 4 at L17 (see USES_BY_LEVEL)
        "Bonus action: assume the shape of a Beast form you know. 2024 RAW: regain one use "
        "on a short rest, all uses on a long rest.",
    ),
    _row(
        "Wild Resurgence",
        _D,
        5,
        _LONG,
        UsesFormula.FIXED_1,
        "Expend a Wild Shape use to gain a level 1 spell slot. Once per long rest. (Trading a "
        "slot for a Wild Shape use when you have none left needs no counter.)",
    ),
    _row(
        "Nature Magician",
        _D,
        20,
        _LONG,
        UsesFormula.FIXED_1,
        "Archdruid: convert Wild Shape uses into one spell slot (2 levels per use). Once per "
        "long rest.",
    ),
    _row(
        "Natural Recovery (free spell)",
        _D,
        6,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast one level 1+ Circle spell you have prepared without a slot. Once per long rest.",
        subclass="Circle of the Land",
    ),
    _row(
        "Natural Recovery (slots)",
        _D,
        6,
        _LONG,
        UsesFormula.FIXED_1,
        "When you finish a short rest, recover spell slots with a combined level up to half "
        "your Druid level (rounded up), none level 6+. Once per long rest.",
        subclass="Circle of the Land",
    ),
    _row(
        "Star Map — Free Guiding Bolt",
        _D,
        3,
        _LONG,
        UsesFormula.PROF_BONUS,
        "Cast Guiding Bolt without expending a spell slot, proficiency-bonus times per "
        "long rest. (Star Map also keeps Guidance and Guiding Bolt always prepared.)",
        subclass="Circle of Stars",
    ),
    _row(
        "Cosmic Omen",
        _D,
        6,
        _LONG,
        UsesFormula.WIS_MOD,
        "Reaction: add or subtract a d6 from a creature's d20 test (Weal or Woe, by your last "
        "long rest's omen). Uses equal to your WIS modifier per long rest.",
        subclass="Circle of Stars",
    ),
    # ── Fighter ──────────────────────────────────────────────────────────
    _row(
        "Second Wind",
        _F,
        1,
        _SHORT_ONE,
        UsesFormula.SECOND_WIND,
        "Bonus action: regain Hit Points equal to 1d10 + Fighter level. Two uses. "
        "2024 RAW: regain one use on a short rest, all uses on a long rest.",
    ),
    _row(
        "Action Surge",
        _F,
        2,
        _SHORT,
        UsesFormula.FIXED_1,  # 2 at L17 (see USES_BY_LEVEL)
        "On your turn, take one additional action (not a Magic action). Once per short or "
        "long rest; twice from level 17, but only once a turn.",
    ),
    _row(
        "Indomitable",
        _F,
        9,
        _LONG,
        UsesFormula.FIXED_1,  # 2 at L13, 3 at L17 (see USES_BY_LEVEL)
        "Reroll a saving throw you fail, adding your Fighter level. You must use the new roll. "
        "Recharges on long rest.",
    ),
    # ── Monk ─────────────────────────────────────────────────────────────
    _row(
        "Focus Points (Ki)",
        _M,
        2,
        _SHORT,
        UsesFormula.LEVEL,
        "Spend Focus Points to fuel Monk features (Flurry of Blows, Patient Defense, "
        "Step of the Wind). All Focus Points return on a short or long rest.",
    ),
    _row(
        "Uncanny Metabolism",
        _M,
        2,
        _LONG,
        UsesFormula.FIXED_1,
        "When you roll initiative, regain all expended Focus Points and heal Martial Arts die "
        "+ Monk level. Once per long rest.",
    ),
    _row(
        "Wholeness of Body",
        _M,
        6,
        _LONG,
        UsesFormula.WIS_MOD,
        "Bonus action: heal your Martial Arts die + WIS modifier. Uses equal to your WIS "
        "modifier (minimum 1) per long rest.",
        subclass="Warrior of the Open Hand",
    ),
    # ── Paladin ──────────────────────────────────────────────────────────
    _row(
        "Lay on Hands",
        _P,
        1,
        _LONG,
        UsesFormula.LEVEL,  # the pool is 5 × Paladin level (see POOL_PER_LEVEL)
        "Pool of healing HP equal to 5 × Paladin level. Bonus action: touch a creature to "
        "restore HP from the pool, or spend 5 HP to cure poison. Refills on long rest.",
    ),
    _row(
        "Paladin's Smite",
        _P,
        2,
        _LONG,
        UsesFormula.FIXED_1,
        "Divine Smite is always prepared. Cast it once without a spell slot; regain that on a "
        "long rest.",
    ),
    _row(
        "Channel Divinity (Paladin)",
        _P,
        3,
        _SHORT_ONE,
        UsesFormula.FIXED_2,  # 2024 PHB: 2 uses at L3, 3 at L11 (see USES_BY_LEVEL)
        "Use Divine Sense (Bonus Action: detect Celestials, Fiends, and Undead within "
        "60 ft for 10 minutes) or one of your subclass's Channel Divinity options. "
        "2024 RAW: regain one use on a short rest, all uses on a long rest.",
    ),
    _row(
        "Faithful Steed",
        _P,
        5,
        _LONG,
        UsesFormula.FIXED_1,
        "Find Steed is always prepared. Cast it once without a spell slot; regain that on a "
        "long rest.",
    ),
    _row(
        "Holy Nimbus",
        _P,
        20,
        _LONG,
        UsesFormula.FIXED_1,
        "Bonus action: radiate holy light for 10 minutes. Once per long rest, or expend a "
        "level 5 spell slot to restore it.",
        subclass="Oath of Devotion",
    ),
    # ── Ranger ───────────────────────────────────────────────────────────
    _row(
        "Favored Enemy",
        _R,
        1,
        _LONG,
        UsesFormula.PROF_BONUS,  # 2/3/4/5/6 at 1/5/9/13/17, the same steps as proficiency
        "Cast Hunter's Mark without expending a spell slot a number of times equal to your "
        "proficiency bonus per long rest.",
    ),
    _row(
        "Tireless",
        _R,
        10,
        _LONG,
        UsesFormula.WIS_MOD,
        "Magic action: gain 1d8 + WIS modifier temporary HP. Uses equal to your WIS modifier "
        "(minimum 1) per long rest.",
    ),
    _row(
        "Nature's Veil",
        _R,
        14,
        _LONG,
        UsesFormula.WIS_MOD,
        "Bonus action: become Invisible until the end of your next turn. Uses equal to your "
        "WIS modifier (minimum 1) per long rest.",
    ),
    # ── Rogue ────────────────────────────────────────────────────────────
    _row(
        "Cunning Strike (Withdraw / Trip / Poison)",
        _RO,
        5,
        _NONE,  # tied to Sneak Attack dice, not a separate counter
        UsesFormula.NONE,
        "When you deal Sneak Attack damage, trade dice for effects: forgo 1d6 for "
        "Withdraw or Trip; 2d6 for Poison. No use-counter — limited by Sneak Attack damage.",
    ),
    _row(
        "Stroke of Luck",
        _RO,
        20,
        _SHORT,
        UsesFormula.FIXED_1,
        "Turn a failed d20 test into a 20. Once per short or long rest.",
    ),
    _row(
        "Psionic Energy Dice",
        _RO,
        3,
        _SHORT_ONE,
        UsesFormula.PROF_X2,
        "Pool of 2 × proficiency bonus d6s (d8 at L5, d10 at L11, d12 at L17) fueling "
        "Psi-Bolstered Knack and Psychic Whispers. 2024 RAW: regain one die on a short "
        "rest, all on a long rest; also a Bonus Action regains one die, once per "
        "short/long rest.",
        subclass="Soulknife",
    ),
    # ── Sorcerer ─────────────────────────────────────────────────────────
    _row(
        "Innate Sorcery",
        _S,
        1,
        _LONG,
        UsesFormula.FIXED_2,
        "Bonus action: for 1 minute, +1 to your spell save DC and advantage on Sorcerer spell "
        "attacks. Two uses per long rest.",
    ),
    _row(
        "Sorcery Points",
        _S,
        2,
        _LONG,
        UsesFormula.LEVEL,
        "Pool of Sorcery Points equal to Sorcerer level. Spent to fuel Metamagic and to "
        "create or convert spell slots. Refills on long rest.",
    ),
    _row(
        "Font of Magic — Slot Conversion",
        _S,
        2,
        _NONE,
        UsesFormula.NONE,
        "As a bonus action, convert spell slots ↔ sorcery points using the published table. "
        "No separate counter — uses sorcery point + slot pools.",
    ),
    _row(
        "Sorcerous Restoration",
        _S,
        5,
        _LONG,
        UsesFormula.FIXED_1,
        "When you finish a short rest, regain Sorcery Points up to half your Sorcerer level. "
        "Once per long rest.",
    ),
    _row(
        "Dragon Wings",
        _S,
        14,
        _LONG,
        UsesFormula.FIXED_1,
        "Bonus action: sprout wings and gain a 60 ft fly speed for 1 hour. Once per long rest, "
        "or spend 3 Sorcery Points to restore it.",
        subclass="Draconic Sorcery",
    ),
    _row(
        "Dragon Companion",
        _S,
        18,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast Summon Dragon once without a spell slot; regain that on a long rest.",
        subclass="Draconic Sorcery",
    ),
    # ── Warlock ──────────────────────────────────────────────────────────
    # NOTE: pact magic slots themselves recharge on short rest, but they're
    # tracked in spell_slots_used, not as a feature row. rest_service handles
    # that path via spellcasting_service for Warlocks.
    _row(
        "Eldritch Invocations",
        _W,
        1,
        _NONE,
        UsesFormula.NONE,
        "Permanent magical enhancements chosen from a list at L1, L2, L5, L7, L9, L12, L15, "
        "L18. Most are passive — no use-counter.",
    ),
    _row(
        "Magical Cunning",
        _W,
        2,
        _LONG,
        UsesFormula.FIXED_1,
        "A 1-minute rite regains expended Pact Magic slots, up to half your maximum (rounded "
        "up). Once per long rest.",
    ),
    _row(
        "Contact Patron",
        _W,
        9,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast Contact Other Plane without a slot to reach your patron (you succeed on its "
        "save). Once per long rest.",
    ),
    _row(
        "Mystic Arcanum (6th level)",
        _W,
        11,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast your chosen 6th-level Warlock spell once without a slot. Regain on long rest.",
    ),
    _row(
        "Mystic Arcanum (7th level)",
        _W,
        13,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast your chosen 7th-level Warlock spell once without a slot. Regain on long rest.",
    ),
    _row(
        "Mystic Arcanum (8th level)",
        _W,
        15,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast your chosen 8th-level Warlock spell once without a slot. Regain on long rest.",
    ),
    _row(
        "Mystic Arcanum (9th level)",
        _W,
        17,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast your chosen 9th-level Warlock spell once without a slot. Regain on long rest.",
    ),
    _row(
        "Dark One's Own Luck",
        _W,
        6,
        _LONG,
        UsesFormula.CHA_MOD,
        "Add a d10 to an ability check or saving throw. Uses equal to your CHA modifier "
        "(minimum 1) per long rest.",
        subclass="Fiend Patron",
    ),
    _row(
        "Hurl Through Hell",
        _W,
        14,
        _LONG,
        UsesFormula.FIXED_1,
        "When you hit, send the creature through the lower planes (CHA save). Once per long "
        "rest, or expend a Pact Magic slot to restore it.",
        subclass="Fiend Patron",
    ),
    # ── Wizard ───────────────────────────────────────────────────────────
    _row(
        "Arcane Recovery",
        _WZ,
        1,
        _LONG,
        UsesFormula.FIXED_1,
        "Once per long rest, after finishing a short rest, recover spell slots whose levels "
        "sum to half your Wizard level (rounded up). No slot above L5.",
    ),
    _row(
        "Memorize Spell",
        _WZ,
        5,
        _NONE,
        UsesFormula.NONE,
        "During a short rest, you can change one prepared spell. Once per short rest — "
        "tracked by the rest, not a separate counter.",
    ),
    _row(
        "Signature Spells",
        _WZ,
        20,
        _SHORT,
        UsesFormula.FIXED_2,
        "Two chosen level 3 spells are always prepared; cast each once at level 3 without a "
        "slot. Regain on a short or long rest.",
    ),
    _row(
        "Overchannel",
        _WZ,
        14,
        _LONG,
        UsesFormula.FIXED_1,
        "Deal maximum damage with a level 1-5 Wizard spell. The first use each long rest is "
        "free; later uses deal necrotic damage to you.",
        subclass="Evoker",
    ),
]
"""Validated ClassFeatureCreate payloads: every SRD class's limited-use features, levels 1-20."""


# ── Uses that grow with level ────────────────────────────────────────────────

# Counters whose 2024 count steps up at set levels but have no matching UsesFormula:
# (from_level, uses), ascending. Keyed by (class, catalog name).
USES_BY_LEVEL: dict[tuple[CharacterClass, str], tuple[tuple[int, int], ...]] = {
    (_F, "Action Surge"): ((2, 1), (17, 2)),
    (_F, "Indomitable"): ((9, 1), (13, 2), (17, 3)),
    (_P, "Channel Divinity (Paladin)"): ((3, 2), (11, 3)),
    (_D, "Wild Shape"): ((2, 2), (6, 3), (17, 4)),
}

# Pools: max "uses" are points, this many per class level (Lay on Hands: 5 HP per level).
POOL_PER_LEVEL: dict[tuple[CharacterClass, str], int] = {(_P, "Lay on Hands"): 5}


def scaled_uses(character_class: CharacterClass, name: str, level: int) -> Optional[int]:
    """The level-scaled max uses for a catalog feature, or None to use its UsesFormula.

    Args:
        character_class: The feature's class.
        name: The catalog name, exactly as seeded.
        level: The character's level.

    Returns:
        The max uses (or pool size), or None when the feature has no override.
    """
    per = POOL_PER_LEVEL.get((character_class, name))
    if per is not None:
        return per * max(1, level)
    steps = USES_BY_LEVEL.get((character_class, name))
    if steps is None:
        return None
    # A sheet that holds the feature below its usual level (a DM's choice) gets the first count.
    out = steps[0][1]
    for at, uses in steps:
        if level >= at:
            out = uses
    return out


def is_pool(character_class: CharacterClass, name: str) -> bool:
    """Whether this feature's uses are a pool of points spent in any amount (Lay on Hands)."""
    return (character_class, name) in POOL_PER_LEVEL


# ── Subclass names ───────────────────────────────────────────────────────────

# Distinctive words that identify each SRD subclass however a DM typed it
# ("Path of the Berserker", "School of Evocation", "The Fiend", "Draconic Bloodline").
_SUBCLASS_KEYWORDS: dict[str, tuple[tuple[str, str], ...]] = {
    "Barbarian": (("berserker", "Berserker"),),
    "Bard": (("lore", "College of Lore"),),
    "Cleric": (("life", "Life Domain"),),
    "Druid": (("land", "Circle of the Land"),),
    "Fighter": (("champion", "Champion"),),
    "Monk": (("open hand", "Warrior of the Open Hand"),),
    "Paladin": (("devotion", "Oath of Devotion"),),
    "Ranger": (("hunter", "Hunter"),),
    "Rogue": (("thief", "Thief"),),
    "Sorcerer": (("draconic", "Draconic Sorcery"), ("dragon", "Draconic Sorcery")),
    "Warlock": (("fiend", "Fiend Patron"),),
    "Wizard": (("evok", "Evoker"), ("evocation", "Evoker")),
}


def class_name_of(character_class: Any) -> str:
    """'Paladin' from a CharacterClass, an enum name or a lower-case string."""
    raw = str(getattr(character_class, "value", character_class) or "")
    return raw.strip().title()


def canonical_subclass(character_class: Any, subclass: Optional[str]) -> Optional[str]:
    """The SRD subclass key (as in ``levelup_2024.SUBCLASS_LEVEL_FEATURES``) a sheet names.

    Args:
        character_class: The PC's class.
        subclass: The subclass as written on the sheet.

    Returns:
        The SRD key, or None when the subclass is blank or not an SRD one.
    """
    text = (subclass or "").strip().lower()
    if not text:
        return None
    for key in rules.SUBCLASS_LEVEL_FEATURES:
        if key.lower() == text:
            return key
    for word, key in _SUBCLASS_KEYWORDS.get(class_name_of(character_class), ()):
        if word in text:
            return key
    return None


# ── Every feature at a level, with plain-words notes ─────────────────────────

# Notes for the features levelup_2024.FEATURE_NOTES doesn't cover (own words, not book text).
EXTRA_FEATURE_NOTES: dict[str, str] = {
    # Barbarian
    "Feral Instinct": "Advantage on initiative rolls.",
    "Instinctive Pounce": "When you start a rage, you can also move up to half your speed.",
    "Brutal Strike": "Give up advantage on a Reckless Attack to add 1d10 damage and a push "
    "or a slow.",
    "Relentless Rage": "Dropping to 0 hit points while raging, make a Constitution save (DC 10, "
    "rising each time) to stay up with hit points equal to twice your level.",
    "Improved Brutal Strike": "Brutal Strike gains new effects and, later, more damage.",
    "Persistent Rage": "Once per Long Rest, rolling initiative restores all your Rages; your "
    "rage keeps going without you having to extend it.",
    "Indomitable Might": "A Strength check or save that rolls below your Strength score uses "
    "the score instead.",
    "Primal Champion": "Strength and Constitution each rise by 4, up to 25.",
    # Bard
    "Countercharm": "Reaction: when you or an ally nearby fails a save against being charmed "
    "or frightened, reroll it with advantage.",
    "Magical Secrets": "Your Bard spells can also come from the Cleric, Druid and Wizard lists.",
    "Superior Inspiration": "Rolling initiative tops your Bardic Inspiration up to two uses.",
    "Words of Creation": "Power Word Heal and Power Word Kill are always prepared, and each can "
    "target a second creature.",
    # Cleric
    "Blessed Strikes": "Choose Divine Strike (extra damage on a weapon hit) or Potent "
    "Spellcasting (Wisdom added to cantrip damage).",
    "Divine Intervention": "Once per Long Rest, cast any Cleric spell of 5th level or lower "
    "with no slot.",
    "Improved Blessed Strikes": "Your Blessed Strikes choice gets stronger.",
    "Greater Divine Intervention": "Divine Intervention can cast Wish; after that it needs "
    "2d4 Long Rests to come back.",
    # Druid
    "Elemental Fury": "Choose Potent Spellcasting (Wisdom added to cantrip damage) or Primal "
    "Strike (extra elemental damage on a weapon hit).",
    "Improved Elemental Fury": "Your Elemental Fury choice gets stronger.",
    "Beast Spells": "You can cast spells while in Wild Shape.",
    "Archdruid": "Rolling initiative with no Wild Shape uses gives you one back; once per Long "
    "Rest, turn Wild Shape uses into a spell slot.",
    # Fighter
    "Tactical Shift": "When you use Second Wind, move up to half your speed without drawing "
    "opportunity attacks.",
    "Master of Armaments": "When you attack with a weapon whose mastery you use, you can swap "
    "its property for Push, Sap or Slow.",
    "Tactical Master": "When you attack with a weapon whose mastery you use, you can swap its "
    "property for Push, Sap or Slow.",
    "Studied Attacks": "Miss a creature and you have advantage on your next attack against it.",
    # Monk
    "Empowered Strikes": "Your Unarmed Strikes can deal Force damage.",
    "Acrobatic Movement": "With no armor or shield, run along walls and across water on your "
    "turn.",
    "Heightened Focus": "Flurry of Blows, Patient Defense and Step of the Wind get stronger.",
    "Self-Restoration": "End charmed, frightened or poisoned on yourself at the end of your "
    "turn; going without food and water doesn't tire you.",
    "Deflect Energy": "Deflect Attacks works against any damage type.",
    "Disciplined Survivor": "Proficiency in every saving throw; spend 1 Focus to reroll a save "
    "you fail.",
    "Perfect Focus": "Rolling initiative with 3 or fewer Focus Points tops you up to 4.",
    "Superior Defense": "Spend 3 Focus: resistance to every damage type but Force for a " "minute.",
    "Body and Mind": "Dexterity and Wisdom each rise by 4, up to 25.",
    # Paladin
    "Abjure Foes": "Channel Divinity: frighten foes you can see within 60 ft. (Wisdom save).",
    "Aura of Courage": "You and allies in your aura can't be frightened.",
    "Radiant Strikes": "Your melee weapon and Unarmed Strike hits deal an extra 1d8 radiant "
    "damage.",
    "Restoring Touch": "Lay on Hands can also end blinded, charmed, deafened, frightened, "
    "paralyzed or stunned, 5 points each.",
    "Aura Expansion": "Your auras reach 30 ft.",
    # Ranger
    "Roving": "+10 ft. speed out of heavy armor, plus a climb and swim speed.",
    "Tireless": "Magic action: gain 1d8 + Wisdom temporary hit points, as many times as your "
    "Wisdom modifier per Long Rest; a Short Rest also eases exhaustion.",
    "Relentless Hunter": "Taking damage can't break your concentration on Hunter's Mark.",
    "Nature's Veil": "Bonus action: turn invisible until the end of your next turn, as many "
    "times as your Wisdom modifier per Long Rest.",
    "Precise Hunter": "Advantage on attacks against the creature you've marked with Hunter's "
    "Mark.",
    "Feral Senses": "Blindsight 30 ft.",
    "Foe Slayer": "Hunter's Mark's extra damage becomes a d10.",
    # Rogue
    "Improved Cunning Strike": "Use two Cunning Strike effects on one Sneak Attack.",
    "Devious Strikes": "New Cunning Strike effects: Daze, Knock Out and Obscure.",
    "Slippery Mind": "Proficiency in Wisdom and Charisma saving throws.",
    "Elusive": "No attack against you has advantage unless you're Incapacitated.",
    "Stroke of Luck": "Turn a failed d20 test into a 20, once per Short or Long Rest.",
    # Sorcerer
    "Sorcery Incarnate": "With no Innate Sorcery uses left, spend 2 Sorcery Points to start "
    "it; while it's on, use two Metamagic options on one spell.",
    "Arcane Apotheosis": "While Innate Sorcery is on, one Metamagic option each turn costs no "
    "Sorcery Points.",
    # Warlock
    "Contact Patron": "Cast Contact Other Plane to reach your patron once per Long Rest with "
    "no slot; you always pass its save.",
    "Mystic Arcanum (6th level)": "Pick a 6th-level Warlock spell; cast it once per Long Rest "
    "with no slot.",
    "Mystic Arcanum (7th level)": "Pick a 7th-level Warlock spell; cast it once per Long Rest "
    "with no slot.",
    "Mystic Arcanum (8th level)": "Pick an 8th-level Warlock spell; cast it once per Long Rest "
    "with no slot.",
    "Mystic Arcanum (9th level)": "Pick a 9th-level Warlock spell; cast it once per Long Rest "
    "with no slot.",
    "Eldritch Master": "Magical Cunning brings back all your Pact Magic slots.",
    # Wizard
    "Spell Mastery": "Pick a 1st- and a 2nd-level spell from your spellbook; cast them at their "
    "lowest level with no slot.",
    "Signature Spells": "Pick two 3rd-level spells; each can be cast once per Short or Long "
    "Rest with no slot.",
    # Subclasses
    "Mindless Rage": "While raging you can't be charmed or frightened.",
    "Retaliation": "Reaction: when a creature within 5 ft. damages you, attack it.",
    "Intimidating Presence": "Bonus action: frighten creatures of your choice within 30 ft. "
    "(Wisdom save), once per Long Rest unless you spend a Rage.",
    "Magical Discoveries": "Learn two spells from the Cleric, Druid or Wizard list.",
    "Peerless Skill": "Add a Bardic Inspiration die to an ability check you fail; if it still "
    "fails, you keep the die.",
    "Blessed Healer": "Heal someone else with a spell and you heal 2 + the spell's level too.",
    "Supreme Healing": "Your healing spells heal the most their dice could roll.",
    "Natural Recovery": "Once per Long Rest, cast a Circle spell with no slot; and once per Long "
    "Rest, a Short Rest brings back some spell slots.",
    "Nature's Ward": "Immune to poison, and resistance to your land's damage type.",
    "Nature's Sanctuary": "Spend a Wild Shape use to raise spectral trees that shelter you and "
    "your allies.",
    "Additional Fighting Style": "Take another Fighting Style feat.",
    "Heroic Warrior": "At the start of your turn in a fight, gain Heroic Inspiration if you "
    "don't have it.",
    "Superior Critical": "Your weapon and unarmed attacks score a critical hit on 18 to 20.",
    "Survivor": "Advantage on death saves; while bloodied you regain 5 + Constitution "
    "modifier hit points at the start of each turn.",
    "Wholeness of Body": "Bonus action: heal your Martial Arts die + Wisdom modifier, as many "
    "times as your Wisdom modifier per Long Rest.",
    "Fleet Step": "After any bonus action, you can also use Step of the Wind.",
    "Quivering Palm": "Spend 4 Focus on a hit to plant a deadly vibration you can set off "
    "later (Constitution save).",
    "Aura of Devotion": "You and allies in your aura can't be charmed.",
    "Smite of Protection": "When you cast Divine Smite, you and allies in your aura get half "
    "cover until your next turn.",
    "Holy Nimbus": "Bonus action: blaze with holy light for 10 minutes, once per Long Rest "
    "unless you spend a 5th-level slot.",
    "Defensive Tactics": "Choose Escape the Horde or Multiattack Defense to stay alive when "
    "outnumbered.",
    "Superior Hunter's Prey": "Once a turn, Hunter's Mark's extra damage also hits a second "
    "creature near the first.",
    "Superior Hunter's Defense": "Reaction: when you take damage, resist it and anything else "
    "of that type this turn.",
    "Supreme Sneak": "A new Cunning Strike effect, Stealth Attack, keeps you hidden.",
    "Use Magic Device": "Attune to four magic items, use any spell scroll, and sometimes keep "
    "an item's charge.",
    "Thief's Reflexes": "In the first round of a fight, you take two turns.",
    "Elemental Affinity": "Resistance to your dragon's damage type, and Charisma added to your "
    "spells of that type.",
    "Dragon Wings": "Bonus action: sprout wings and fly for an hour, once per Long Rest unless "
    "you spend 3 Sorcery Points.",
    "Dragon Companion": "Summon Dragon is always ready; cast it once per Long Rest with no "
    "slot.",
    "Dark One's Own Luck": "Add a d10 to an ability check or save, as many times as your "
    "Charisma modifier per Long Rest.",
    "Fiendish Resilience": "After each rest, choose a damage type to resist.",
    "Hurl Through Hell": "When you hit, send the creature through the lower planes (Charisma "
    "save), once per Long Rest unless you spend a Pact Magic slot.",
    "Sculpt Spells": "Your Evocation spells can leave chosen allies untouched.",
    "Empowered Evocation": "Add your Intelligence modifier to your Wizard Evocation spells' "
    "damage.",
    "Overchannel": "Deal a 1st- to 5th-level Wizard spell's most damage; the first use each "
    "Long Rest is free, later ones hurt you.",
}

_FALLBACK_NOTE = "See your book for what this does."

# Markers in the class tables that aren't features a character "has".
_SKIP = {"Ability Score Improvement", "Epic Boon"}
_SUB_MARK = "Subclass feature"

# The SRD table's spelling → the spelling the tracked catalog (and the sheet) uses.
_DISPLAY_NAME = {"Lay On Hands": "Lay on Hands"}
# A later feature that replaces an earlier one with the same job.
_REPLACED_BY = {
    "Extra Attack": "Two Extra Attacks",
    "Two Extra Attacks": "Three Extra Attacks",
}
# Table rows that only bump a count the base feature's note already states.
_COUNT_BUMPS = {
    "Action Surge (two uses)",
    "Indomitable (two uses)",
    "Indomitable (three uses)",
}


def _step(level: int, table: tuple[tuple[int, Any], ...]) -> Any:
    """Value from an ascending (from_level, value) table at ``level``."""
    out = table[0][1]
    for at, value in table:
        if level >= at:
            out = value
    return out


def _uses_word(n: int) -> str:
    """'1 use' / '3 uses'."""
    return f"{n} use" if n == 1 else f"{n} uses"


def _mod_text(mods: Optional[dict[str, int]], ability: str) -> str:
    """' (+3)' for the PC's modifier when it's known, else ''."""
    if not mods or ability not in mods:
        return ""
    return f" ({mods[ability]:+d})"


_ONE_BACK = "one comes back on a Short Rest, all on a Long Rest"


def _level_note(  # noqa: C901 — one branch per feature whose numbers grow with level
    class_name: str, name: str, level: int, mods: Optional[dict[str, int]]
) -> Optional[str]:
    """A note with this character's numbers in it, for features whose numbers grow."""
    if name in ("Lay On Hands", "Lay on Hands"):
        return (
            f"A pool of {5 * level} hit points (5 per Paladin level). Bonus action: touch a "
            "creature and restore any number of them, or spend 5 to cure a poison. The pool "
            "refills on a Long Rest."
        )
    if name == "Channel Divinity" and class_name == "Cleric":
        n = _step(level, ((2, 2), (6, 3), (18, 4)))
        return (
            f"{_uses_word(n)} of divine power, such as Divine Spark (heal or harm) and Turn "
            f"Undead; {_ONE_BACK}."
        )
    if name == "Channel Divinity" and class_name == "Paladin":
        n = _step(level, ((3, 2), (11, 3)))
        return (
            f"{_uses_word(n)}: Divine Sense (sense celestials, fiends and undead nearby) or "
            f"your oath's own options; {_ONE_BACK}."
        )
    if name == "Rage":
        n = _step(level, ((1, 2), (3, 3), (6, 4), (12, 5), (17, 6)))
        dmg = _step(level, ((1, 2), (9, 3), (16, 4)))
        return (
            f"Bonus action: rage for up to 10 minutes. +{dmg} damage on Strength attacks, "
            "resistance to bludgeoning, piercing and slashing damage, advantage on Strength "
            f"checks and saves. {_uses_word(n)}; {_ONE_BACK}."
        )
    if name == "Wild Shape":
        n = _step(level, ((2, 2), (6, 3), (17, 4)))
        return f"Bonus action: become a beast form you know. {_uses_word(n)}; {_ONE_BACK}."
    if name == "Second Wind":
        n = _step(level, ((1, 2), (4, 3), (10, 4)))
        return f"Bonus action: regain 1d10 + {level} hit points. {_uses_word(n)}; {_ONE_BACK}."
    if name == "Action Surge":
        n = _step(level, ((2, 1), (17, 2)))
        return f"Take one extra action on your turn. {_uses_word(n)} per Short or Long Rest" + (
            ", only one a turn." if n > 1 else "."
        )
    if name == "Indomitable":
        n = _step(level, ((9, 1), (13, 2), (17, 3)))
        return f"Reroll a saving throw you fail, adding {level}. {_uses_word(n)} per Long Rest."
    if name == "Bardic Inspiration":
        die = _step(level, ((1, "d6"), (5, "d8"), (10, "d10"), (15, "d12")))
        back = "a Short or Long Rest" if level >= 5 else "a Long Rest"
        return (
            f"Bonus action: give an ally a {die} to add to a d20 test they fail. Uses equal "
            f"your Charisma modifier{_mod_text(mods, 'cha')}; they come back on {back}."
        )
    if name == "Sneak Attack":
        return (
            f"Once a turn, add {(level + 1) // 2}d6 to a hit when you have advantage, or an "
            "ally stands next to your target."
        )
    if name == "Martial Arts":
        die = _step(level, ((1, "d6"), (5, "d8"), (11, "d10"), (17, "d12")))
        return (
            f"Use Dexterity for unarmed strikes and Monk weapons, roll a {die} for their "
            "damage, and strike unarmed as a bonus action."
        )
    if name == "Monk's Focus":
        return (
            f"{level} Focus Points fuel Flurry of Blows, Patient Defense and Step of the Wind; "
            "they all come back on a Short or Long Rest."
        )
    if name == "Uncanny Metabolism":
        die = _step(level, ((1, "d6"), (5, "d8"), (11, "d10"), (17, "d12")))
        return (
            "Once per Long Rest, rolling initiative restores all your Focus Points and heals "
            f"you 1{die} + {level}."
        )
    if name == "Font of Magic":
        return (
            f"{level} Sorcery Points: turn them into spell slots, or slots into points. They "
            "come back on a Long Rest."
        )
    if name == "Favored Enemy":
        n = rules.proficiency_bonus(level)
        return (
            "Hunter's Mark is always prepared, and you can cast it "
            f"{n} times per Long Rest with no slot."
        )
    if name == "Arcane Recovery":
        return (
            "Once per Long Rest, after a Short Rest, regain spell slots adding up to "
            f"{math.ceil(level / 2)} levels (none above 5th)."
        )
    if name == "Aura of Protection":
        reach = 30 if level >= 18 else 10
        return (
            f"You and allies within {reach} ft. add your Charisma modifier"
            f"{_mod_text(mods, 'cha')} to saving throws."
        )
    if name == "Paladin's Smite":
        return (
            "Divine Smite is always prepared, free of your prepared count: extra radiant "
            "damage when you hit. Once per Long Rest it costs no slot."
        )
    if name == "Weapon Mastery":
        table = {
            "Barbarian": ((1, 2), (4, 3), (10, 4)),
            "Fighter": ((1, 3), (4, 4), (10, 5), (16, 6)),
        }.get(class_name, ((1, 2),))
        n = _step(level, table)
        return (
            f"Use the mastery property (Cleave, Sap, Topple, Vex...) of {n} kinds of weapons "
            "you choose; swap one after a Long Rest."
        )
    if name == "Innate Sorcery":
        return (
            "Bonus action: for a minute your spell save DC is 1 higher and your Sorcerer spell "
            "attacks have advantage. Twice per Long Rest."
        )
    return None


def feature_note(
    class_name: str, name: str, level: int, mods: Optional[dict[str, int]] = None
) -> str:
    """The plain-words note for one feature at this character's level.

    Args:
        class_name: 'Paladin', 'Wizard'...
        name: The feature name from the class or subclass table.
        level: The character's level (notes quote numbers that grow).
        mods: Optional ability modifiers ({'cha': 3, ...}) to quote where they matter.

    Returns:
        A short sentence; a "see your book" line when nothing better is known.
    """
    return (
        _level_note(class_name, name, level, mods)
        or rules.feature_note(class_name, name)
        or EXTRA_FEATURE_NOTES.get(name)
        or _FALLBACK_NOTE
    )


def _entry(name: str, level: int, source: str, note: str) -> dict[str, Any]:
    """One row of the features list."""
    return {"name": name, "level": level, "source": source, "note": note}


def features_for_level(
    character_class: Any,
    subclass: Optional[str],
    level: int,
    mods: Optional[dict[str, int]] = None,
) -> list[dict[str, Any]]:
    """Every class and subclass feature a character has at ``level``, with notes.

    Args:
        character_class: The PC's class.
        subclass: The subclass as written on the sheet (blank before level 3 is fine).
        level: The character's level, 1-20.
        mods: Optional ability modifiers for notes that quote them.

    Returns:
        ``[{"name", "level", "source": "class"|"subclass", "note"}]`` in level order,
        class features before subclass features within a level.
    """
    class_name = class_name_of(character_class)
    table = rules.CLASS_LEVEL_FEATURES.get(class_name, {})
    level = max(1, min(20, int(level or 1)))
    canon = canonical_subclass(class_name, subclass)
    named_sub = (subclass or "").strip()
    sub_table = rules.SUBCLASS_LEVEL_FEATURES.get(canon, {}) if canon else {}
    have = {n for lvl in range(1, level + 1) for n in table.get(lvl, [])}
    out: list[dict[str, Any]] = []
    for lvl in range(1, level + 1):
        for name in table.get(lvl, []):
            if name in _SKIP or name in _COUNT_BUMPS:
                continue
            if _REPLACED_BY.get(name) in have:
                continue
            is_pick = name.endswith(" Subclass")
            if is_pick or name == _SUB_MARK:
                if canon:
                    continue  # the SRD subclass's own features are listed below
                if named_sub:
                    out.append(
                        _entry(
                            named_sub if is_pick else f"{named_sub} feature",
                            lvl,
                            "subclass",
                            "Your subclass gives you something at this level: read it in "
                            "your book.",
                        )
                    )
                elif is_pick:
                    out.append(
                        _entry(
                            name,
                            lvl,
                            "class",
                            "Choose your subclass (ask your DM which ones your table uses). "
                            "None is on this sheet yet.",
                        )
                    )
                continue
            note = feature_note(class_name, name, level, mods)
            out.append(_entry(_DISPLAY_NAME.get(name, name), lvl, "class", note))
        for name in sub_table.get(lvl, []):
            out.append(_entry(name, lvl, "subclass", feature_note(class_name, name, level, mods)))
    return out
