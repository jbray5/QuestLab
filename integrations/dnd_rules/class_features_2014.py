"""The 2014 rules' tracked class features: SRD 5.1 counters and pools (Plan 131).

``CLASS_FEATURES_2014`` is the 2014 twin of ``class_features_2024.CLASS_FEATURES_2024``:
the features with limited uses (a counter or a pool the table spends and a rest brings
back), as validated ``ClassFeatureCreate`` rows marked ``ruleset="2014"``. The service
seeds every missing row, matched on name + class + subclass + ruleset, so the 2014 Rage
and the 2024 Rage are separate rows, and a PC is only granted its own edition's rows.

Every row's ``UsesFormula`` says on its own how many uses a PC has, so nothing here is
keyed by name (unlike the 2024 ``USES_BY_LEVEL`` table). In 2014, a short rest brings
back *all* uses of a short-rest feature, so no row uses ``RecoveryType.SHORT_ONE``.

Species features (the Dragonborn's Breath Weapon, the Half-Orc's Relentless Endurance)
are not here: the catalog only tracks class features, in both editions.

Source: D&D 5e SRD 5.1 (Wizards of the Coast, CC-BY-4.0). Descriptions are condensed
into plain words; they are not book text.
"""

from __future__ import annotations

from typing import Optional

from domain.character import ClassFeatureCreate
from domain.enums import CharacterClass, RecoveryType, Ruleset, UsesFormula

SOURCE_2014 = "SRD 5.1 (2014)"

# The 2014 catalog has only SRD subclasses, so nothing is held back from other tables
# (the 2024 module's twin lists the owner's PHB-only subclasses).
NON_SRD_SUBCLASSES: frozenset[str] = frozenset()

_B = CharacterClass.BARBARIAN
_BD = CharacterClass.BARD
_C = CharacterClass.CLERIC
_D = CharacterClass.DRUID
_F = CharacterClass.FIGHTER
_M = CharacterClass.MONK
_P = CharacterClass.PALADIN
_RO = CharacterClass.ROGUE
_S = CharacterClass.SORCERER
_W = CharacterClass.WARLOCK
_WZ = CharacterClass.WIZARD

_LONG = RecoveryType.LONG
_SHORT = RecoveryType.SHORT

# SRD 5.1 subclass names as the book writes them. A PC's subclass matches a row when
# either contains the other, ignoring case, so "Land", "Open Hand" or "Fiend" match too.
LAND = "Circle of the Land"
OPEN_HAND = "Way of the Open Hand"
DEVOTION = "Oath of Devotion"
FIEND = "The Fiend"
EVOCATION = "School of Evocation"


def _row(
    name: str,
    character_class: CharacterClass,
    level: int,
    recovery: RecoveryType,
    uses: UsesFormula,
    description: str,
    subclass: Optional[str] = None,
) -> ClassFeatureCreate:
    """One validated 2014 catalog row (keeps the table below readable)."""
    return ClassFeatureCreate(
        name=name,
        character_class=character_class,
        subclass=subclass,
        level_acquired=level,
        recovery=recovery,
        uses_formula=uses,
        description=description,
        source=SOURCE_2014,
        ruleset=Ruleset.R2014.value,
    )


CLASS_FEATURES_2014: list[ClassFeatureCreate] = [
    # ── Barbarian ────────────────────────────────────────────────────────
    _row(
        "Rage",
        _B,
        1,
        _LONG,
        UsesFormula.RAGE_2014,
        "Bonus action: rage for 1 minute (not in heavy armor). Advantage on Strength checks "
        "and saves, extra damage on Strength melee attacks, and half damage from bludgeoning, "
        "piercing and slashing. 2 rages, 3 at level 3, 4 at 6, 5 at 12, 6 at 17, and no limit "
        "at 20. They come back on a long rest.",
    ),
    # ── Bard ─────────────────────────────────────────────────────────────
    _row(
        "Bardic Inspiration",
        _BD,
        1,
        _LONG,  # Font of Inspiration (L5) adds short-rest recovery; tracked as LONG, as in 2024
        UsesFormula.CHA_MOD,
        "Bonus action: give a creature within 60 ft. that can hear you an inspiration die (d6, "
        "bigger as you level) to add to one ability check, attack roll or save in the next 10 "
        "minutes. Uses equal your Charisma modifier (at least 1). They come back on a long "
        "rest; from level 5 (Font of Inspiration), a short rest brings them back too.",
    ),
    # ── Cleric ───────────────────────────────────────────────────────────
    _row(
        "Channel Divinity",
        _C,
        2,
        _SHORT,
        UsesFormula.CHANNEL_DIV_2014,
        "Action: use Turn Undead or your domain's Channel Divinity option. 1 use, 2 from level "
        "6, 3 from level 18. All uses come back on a short or long rest.",
    ),
    _row(
        "Divine Intervention",
        _C,
        10,
        _LONG,
        UsesFormula.FIXED_1,
        "Action: call on your god and roll percentile dice. Roll your Cleric level or lower and "
        "your god steps in, as the DM decides (from level 20 it always works). If it worked, "
        "you can't try again for 7 days; if not, you can try again after a long rest.",
    ),
    # ── Druid ────────────────────────────────────────────────────────────
    _row(
        "Wild Shape",
        _D,
        2,
        _SHORT,
        UsesFormula.WILD_SHAPE_2014,
        "Action: turn into a beast you have seen (bigger beasts as you level). 2 uses; they "
        "come back on a short or long rest. No limit at level 20 (Archdruid).",
    ),
    _row(
        "Natural Recovery",
        _D,
        2,
        _LONG,
        UsesFormula.FIXED_1,
        "During a short rest, get back spell slots whose levels add up to half your Druid level "
        "(rounded up), none 6th level or higher. Once per long rest.",
        subclass=LAND,
    ),
    # ── Fighter ──────────────────────────────────────────────────────────
    _row(
        "Second Wind",
        _F,
        1,
        _SHORT,
        UsesFormula.FIXED_1,
        "Bonus action: regain 1d10 + your Fighter level hit points. Once per short or long rest.",
    ),
    _row(
        "Action Surge",
        _F,
        2,
        _SHORT,
        UsesFormula.ACTION_SURGE,
        "Take one extra action on your turn. Once per short or long rest; twice from level 17, "
        "but only once a turn.",
    ),
    _row(
        "Indomitable",
        _F,
        9,
        _LONG,
        UsesFormula.INDOMITABLE,
        "Reroll a saving throw you fail; you must use the new roll. Once per long rest, twice "
        "from level 13, three times from level 17.",
    ),
    # ── Monk ─────────────────────────────────────────────────────────────
    _row(
        "Ki",
        _M,
        2,
        _SHORT,
        UsesFormula.LEVEL,
        "Ki points equal to your Monk level fuel Flurry of Blows, Patient Defense, Step of the "
        "Wind and your other ki features. They all come back on a short or long rest.",
    ),
    _row(
        "Wholeness of Body",
        _M,
        6,
        _LONG,
        UsesFormula.FIXED_1,
        "Action: regain hit points equal to three times your Monk level. Once per long rest.",
        subclass=OPEN_HAND,
    ),
    # ── Paladin ──────────────────────────────────────────────────────────
    _row(
        "Divine Sense",
        _P,
        1,
        _LONG,
        UsesFormula.CHA_MOD_PLUS_1,
        "Action: until the end of your next turn, sense every celestial, fiend and undead within "
        "60 ft. that isn't behind total cover. Uses equal 1 + your Charisma modifier; they come "
        "back on a long rest.",
    ),
    _row(
        "Lay on Hands",
        _P,
        1,
        _LONG,
        UsesFormula.LEVEL_X5,
        "A pool of hit points equal to 5 × your Paladin level. Action: touch a creature and "
        "restore any number of them, or spend 5 to cure one disease or poison. The pool refills "
        "on a long rest.",
    ),
    _row(
        "Channel Divinity (Paladin)",
        _P,
        3,
        _SHORT,
        UsesFormula.FIXED_1,
        "Use one of your oath's Channel Divinity options. Once per short or long rest.",
    ),
    _row(
        "Cleansing Touch",
        _P,
        14,
        _LONG,
        UsesFormula.CHA_MOD,
        "Action: end one spell on yourself or on a willing creature you touch. Uses equal your "
        "Charisma modifier (at least 1); they come back on a long rest.",
    ),
    _row(
        "Holy Nimbus",
        _P,
        20,
        _LONG,
        UsesFormula.FIXED_1,
        "Action: shine sunlight 30 ft. around you for 1 minute. Enemies that start their turn "
        "in it take 10 radiant damage, and you have advantage on saves against spells from "
        "fiends and undead. Once per long rest.",
        subclass=DEVOTION,
    ),
    # ── Rogue ────────────────────────────────────────────────────────────
    _row(
        "Stroke of Luck",
        _RO,
        20,
        _SHORT,
        UsesFormula.FIXED_1,
        "Turn a missed attack into a hit, or count a failed ability check's d20 as a 20. Once "
        "per short or long rest.",
    ),
    # ── Sorcerer ─────────────────────────────────────────────────────────
    _row(
        "Sorcery Points",
        _S,
        2,
        _LONG,
        UsesFormula.LEVEL,
        "Sorcery points equal to your Sorcerer level. Spend them on Metamagic, or turn points "
        "into spell slots and slots into points (Font of Magic). They come back on a long rest.",
    ),
    # ── Warlock ──────────────────────────────────────────────────────────
    # Pact Magic slots come back on a short rest too, but they are spell slots, not a
    # feature row: rest_service restores them for Warlocks.
    _row(
        "Mystic Arcanum (6th level)",
        _W,
        11,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast your chosen 6th-level Warlock spell once with no spell slot. It comes back on a "
        "long rest.",
    ),
    _row(
        "Mystic Arcanum (7th level)",
        _W,
        13,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast your chosen 7th-level Warlock spell once with no spell slot. It comes back on a "
        "long rest.",
    ),
    _row(
        "Mystic Arcanum (8th level)",
        _W,
        15,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast your chosen 8th-level Warlock spell once with no spell slot. It comes back on a "
        "long rest.",
    ),
    _row(
        "Mystic Arcanum (9th level)",
        _W,
        17,
        _LONG,
        UsesFormula.FIXED_1,
        "Cast your chosen 9th-level Warlock spell once with no spell slot. It comes back on a "
        "long rest.",
    ),
    _row(
        "Eldritch Master",
        _W,
        20,
        _LONG,
        UsesFormula.FIXED_1,
        "Spend 1 minute asking your patron for help to get back all your Pact Magic spell "
        "slots. Once per long rest.",
    ),
    _row(
        "Dark One's Own Luck",
        _W,
        6,
        _SHORT,
        UsesFormula.FIXED_1,
        "Add a d10 to an ability check or saving throw, after you see the roll but before it "
        "takes effect. Once per short or long rest.",
        subclass=FIEND,
    ),
    _row(
        "Hurl Through Hell",
        _W,
        14,
        _LONG,
        UsesFormula.FIXED_1,
        "When you hit a creature, send it through the lower planes until the end of your next "
        "turn; unless it is a fiend, it takes 10d10 psychic damage. Once per long rest.",
        subclass=FIEND,
    ),
    # ── Wizard ───────────────────────────────────────────────────────────
    _row(
        "Arcane Recovery",
        _WZ,
        1,
        _LONG,
        UsesFormula.FIXED_1,
        "Once a day, when you finish a short rest, get back spell slots whose levels add up to "
        "half your Wizard level (rounded up), none 6th level or higher. Comes back on a long "
        "rest.",
    ),
    _row(
        "Signature Spells",
        _WZ,
        20,
        _SHORT,
        UsesFormula.FIXED_2,
        "Two chosen 3rd-level spells are always prepared; cast each once at 3rd level with no "
        "spell slot. They come back on a short or long rest.",
    ),
    _row(
        "Overchannel",
        _WZ,
        14,
        _LONG,
        UsesFormula.FIXED_1,
        "Deal the most damage a 1st- to 5th-level Wizard spell can roll. The first use after a "
        "long rest is free; each use after that, before a long rest, hurts you with necrotic "
        "damage (2d12 per spell level, more each time).",
        subclass=EVOCATION,
    ),
]
"""Validated ClassFeatureCreate payloads: the SRD 5.1 limited-use class features, levels 1-20."""
