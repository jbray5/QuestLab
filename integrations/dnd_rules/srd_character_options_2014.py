"""SRD 5.1 character-creation options (Plan 131): races, subraces, the Acolyte, class tables.

The 2014 twin of ``srd_character_options_2024``: the same public names and shapes, so the
builder reads whichever module ``rulesets.options(campaign.ruleset)`` hands it. The content
is the 2014 System Reference Document (SRD 5.1) under CC-BY 4.0, condensed into our words.
Anything outside it (other races, backgrounds, subclasses) is entered as "from my book".

What 2014 adds on top of the 2024 shapes:

- ``SPECIES[i]``: ``ability_bonuses``, ``ability_choice`` (the Half-Elf's two +1s),
  ``skills`` (fixed skills), ``skill_choice`` (skills of your choice), ``subraces`` and
  ``choices`` (a species choice keyed into ``SPECIES_CHOICE_KINDS``: Dragonborn ancestry).
- ``BACKGROUNDS[i]``: ``abilities: []`` and ``feat: None`` (2014 backgrounds give neither),
  ``languages`` and ``feature``.
- ``CLASSES[c]["spellcasting"]``: ``kind`` ("known" or "prepared"), ``known`` (a 20-level
  table, known casters), ``prepared_formula`` ("level" or "half_level", prepared casters),
  ``first_level`` and ``spellbook``. There is no 20-level ``prepared`` list: a 2014 prepared
  caster's count depends on its ability modifier, so ask ``spells_prepared(cls, level, mod)``.
- Helpers ``spells_known`` and ``spellbook_size``.

Everything here is data. The builder service turns choices into a PC.
"""

from typing import Any

# Edition-neutral tables: the same in SRD 5.1 and SRD 5.2.1, so they come from one place.
from integrations.dnd_rules.srd_character_options_2024 import (
    ABILITIES,
    ARMOR,
    POINT_BUY_BUDGET,
    POINT_BUY_COST,
    SHIELD_BONUS,
    SKILLS,
    STANDARD_ARRAY,
    ability_mod,
    proficiency_bonus,
)

__all__ = [
    "ABILITIES",
    "ARMOR",
    "BACKGROUNDS",
    "CLASSES",
    "DRACONIC_ANCESTRY",
    "ORIGIN_FEATS",
    "POINT_BUY_BUDGET",
    "POINT_BUY_COST",
    "SHIELD_BONUS",
    "SKILLS",
    "SPECIES",
    "SPECIES_CHOICE_KINDS",
    "STANDARD_ARRAY",
    "ability_mod",
    "cantrips_known",
    "max_spell_level",
    "proficiency_bonus",
    "spellbook_size",
    "spells_known",
    "spells_prepared",
]

# ── Races ────────────────────────────────────────────────────────────────────

# The Dragonborn's Draconic Ancestry table: dragon → damage type, breath shape and save.
# Each row is a class-choice option (``name``, ``blurb``, effects), the same shape as
# ``levelup_2024.CHOICE_KINDS[...]["options"]``, so the builder and wizard can show it with
# the class-choice machinery. The pick is recorded as "Draconic Ancestry: Red" in ``feats``.
_LINE = "5 by 30 ft. line"
_CONE = "15 ft. cone"
DRACONIC_ANCESTRY: list[dict[str, Any]] = [
    {
        "name": dragon,
        "blurb": f"{dtype.title()} damage. Breath: a {area}, {save} save.",
        "damage_type": dtype,
        "area": area,
        "save": save[:3].upper(),
    }
    for dragon, dtype, area, save in (
        ("Black", "acid", _LINE, "Dexterity"),
        ("Blue", "lightning", _LINE, "Dexterity"),
        ("Brass", "fire", _LINE, "Dexterity"),
        ("Bronze", "lightning", _LINE, "Dexterity"),
        ("Copper", "acid", _LINE, "Dexterity"),
        ("Gold", "fire", _CONE, "Dexterity"),
        ("Green", "poison", _CONE, "Constitution"),
        ("Red", "fire", _CONE, "Dexterity"),
        ("Silver", "cold", _CONE, "Constitution"),
        ("White", "cold", _CONE, "Constitution"),
    )
]

# Species choices, in the ``levelup_2024.CHOICE_KINDS`` spec shape. A species row's
# ``choices`` maps a key here to how many picks it gets.
SPECIES_CHOICE_KINDS: dict[str, dict[str, Any]] = {
    "dragonborn_ancestry": {
        "label": "Draconic Ancestry",
        "kind": "option",
        "note": "The kind of dragon in your family line. It sets your breath weapon's damage, "
        "shape and save, and the damage you resist.",
        "record": "Draconic Ancestry",
        "options": DRACONIC_ANCESTRY,
    },
}


def _race(
    name: str,
    size: str,
    speed: int,
    bonuses: dict[str, int],
    traits: list[str],
    *,
    skills: list[str] | None = None,
    skill_choice: int = 0,
    ability_choice: dict[str, Any] | None = None,
    subraces: list[dict[str, Any]] | None = None,
    choices: dict[str, int] | None = None,
) -> dict[str, Any]:
    """One race row: the 2024 species keys plus the 2014 ones, every key always present."""
    row: dict[str, Any] = {
        "name": name,
        "size": size,
        "speed": speed,
        "traits": traits,
        "ability_bonuses": bonuses,
        "ability_choice": ability_choice,
        "skills": skills or [],
        "skill_choice": skill_choice,
        "subraces": subraces or [],
        "choices": choices or {},
    }
    if skill_choice:
        # The 2024 key the builder and wizard already honour: extra skills, any list.
        row["bonus_skill_choices"] = skill_choice
    return row


_DARKVISION = "Darkvision 60 ft."
_FEY_ANCESTRY = (
    "Fey Ancestry — advantage on saves against being charmed, and magic can't put you to sleep."
)

SPECIES: list[dict[str, Any]] = [
    _race(
        "Dragonborn",
        "Medium",
        30,
        {"STR": 2, "CHA": 1},
        [
            "Draconic Ancestry — choose a kind of dragon; it sets your breath weapon and the "
            "damage you resist.",
            "Breath Weapon — use your action to breathe a 15-ft. cone or a 5-by-30-ft. line; "
            "a save (DC 8 + Constitution modifier + proficiency bonus) halves the 2d6 damage "
            "(3d6 at 6th level, 4d6 at 11th, 5d6 at 16th). Once per short or long rest.",
            "Damage Resistance to your ancestry's damage type.",
            "Languages — Common and Draconic.",
        ],
        choices={"dragonborn_ancestry": 1},
    ),
    _race(
        "Dwarf",
        "Medium",
        25,
        {"CON": 2},
        [
            "Speed 25 ft., and heavy armor doesn't slow you down.",
            _DARKVISION,
            "Dwarven Resilience — advantage on saves against poison, and resistance to poison "
            "damage.",
            "Dwarven Combat Training — trained with the battleaxe, handaxe, light hammer and "
            "warhammer.",
            "Tool Proficiency — smith's tools, brewer's supplies or mason's tools (your pick).",
            "Stonecunning — double your proficiency bonus on History checks about stonework.",
            "Languages — Common and Dwarvish.",
        ],
        subraces=[
            {
                "name": "Hill Dwarf",
                "ability_bonuses": {"WIS": 1},
                "traits": ["Dwarven Toughness — +1 hit point, and +1 more every level."],
                "hp_per_level": 1,
            }
        ],
    ),
    _race(
        "Elf",
        "Medium",
        30,
        {"DEX": 2},
        [
            _DARKVISION,
            "Keen Senses — trained in Perception.",
            _FEY_ANCESTRY,
            "Trance — you don't sleep: 4 hours of meditation does what 8 hours of sleep does.",
            "Languages — Common and Elvish.",
        ],
        skills=["Perception"],
        subraces=[
            {
                "name": "High Elf",
                "ability_bonuses": {"INT": 1},
                "traits": [
                    "Elf Weapon Training — trained with the longsword, shortsword, shortbow and "
                    "longbow.",
                    "Cantrip — one Wizard cantrip of your choice; you cast it with Intelligence.",
                    "Extra Language — one more language of your choice.",
                ],
                "cantrip_choice": {"count": 1, "list": "Wizard", "ability": "INT"},
            }
        ],
    ),
    _race(
        "Gnome",
        "Small",
        25,
        {"INT": 2},
        [
            _DARKVISION,
            "Gnome Cunning — advantage on Intelligence, Wisdom and Charisma saves against "
            "magic.",
            "Languages — Common and Gnomish.",
        ],
        subraces=[
            {
                "name": "Rock Gnome",
                "ability_bonuses": {"CON": 1},
                "traits": [
                    "Artificer's Lore — double your proficiency bonus on History checks about "
                    "magic items and gadgets.",
                    "Tinker — trained with tinker's tools; with an hour and 10 gp of parts, build "
                    "a tiny clockwork toy, fire starter or music box that runs for 24 hours.",
                ],
            }
        ],
    ),
    _race(
        "Half-Elf",
        "Medium",
        30,
        {"CHA": 2},
        [
            "Two more ability scores of your choice (not Charisma) go up by 1.",
            _DARKVISION,
            _FEY_ANCESTRY,
            "Skill Versatility — trained in two skills of your choice.",
            "Languages — Common, Elvish and one more of your choice.",
        ],
        ability_choice={"choose": 2, "amount": 1, "exclude": ["CHA"]},
        skill_choice=2,
    ),
    _race(
        "Half-Orc",
        "Medium",
        30,
        {"STR": 2, "CON": 1},
        [
            _DARKVISION,
            "Menacing — trained in Intimidation.",
            "Relentless Endurance — when you drop to 0 hit points but aren't killed outright, "
            "drop to 1 instead. Once per long rest.",
            "Savage Attacks — on a melee weapon critical hit, roll one of the weapon's damage "
            "dice once more and add it.",
            "Languages — Common and Orc.",
        ],
        skills=["Intimidation"],
    ),
    _race(
        "Halfling",
        "Small",
        25,
        {"DEX": 2},
        [
            "Lucky — roll a 1 on an attack roll, ability check or save? Reroll it and use the "
            "new roll.",
            "Brave — advantage on saves against being frightened.",
            "Halfling Nimbleness — move through the space of any creature bigger than you.",
            "Languages — Common and Halfling.",
        ],
        subraces=[
            {
                "name": "Lightfoot Halfling",
                "ability_bonuses": {"CHA": 1},
                "traits": [
                    "Naturally Stealthy — you can try to hide behind a creature at least one "
                    "size bigger than you."
                ],
            }
        ],
    ),
    _race(
        "Human",
        "Medium",
        30,
        {a: 1 for a in ABILITIES},
        [
            "Every ability score goes up by 1.",
            "Languages — Common and one more of your choice.",
        ],
    ),
    _race(
        "Tiefling",
        "Medium",
        30,
        {"INT": 1, "CHA": 2},
        [
            _DARKVISION,
            "Hellish Resistance — resistance to fire damage.",
            "Infernal Legacy — you know Thaumaturgy. At 3rd level cast Hellish Rebuke (as a "
            "2nd-level spell) and at 5th level Darkness, each once per long rest, with "
            "Charisma.",
            "Languages — Common and Infernal.",
        ],
    ),
]

# ── Backgrounds and feats ────────────────────────────────────────────────────

# SRD 5.1 has one background. In 2014 a background gives skills, languages and a feature;
# ability bonuses come from your race, and there are no Origin feats.
BACKGROUNDS: list[dict[str, Any]] = [
    {
        "name": "Acolyte",
        "abilities": [],
        "feat": None,
        "skills": ["Insight", "Religion"],
        "tool": None,
        "languages": 2,
        "feature": "Shelter of the Faithful — temples of your faith heal and look after you "
        "and your friends for free, and fellow believers will put you (just you) up "
        "modestly.",
        "blurb": "You served in a temple. Prayer, ritual, and the smell of incense are home.",
    },
]

ORIGIN_FEATS: list[dict[str, str]] = []

# ── Classes ──────────────────────────────────────────────────────────────────

# Spells known, levels 1–20 (SRD 5.1 class tables).
_BARD_KNOWN = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22]
_RANGER_KNOWN = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11]
_SORC_KNOWN = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15]
_WARLOCK_KNOWN = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]

# The Wizard's spellbook: 6 level 1 spells to start, 2 more every level.
_SPELLBOOK_START = 6
_SPELLBOOK_PER_LEVEL = 2


def _known(ability: str, cantrips: int, known: list[int], first_level: int = 1) -> dict[str, Any]:
    """A known caster's block: it learns a fixed number of spells from its table."""
    return {
        "ability": ability,
        "cantrips_base": cantrips,
        "kind": "known",
        "known": known,
        "prepared_formula": None,
        "first_level": first_level,
        "spellbook": False,
    }


def _prepared(
    ability: str,
    cantrips: int,
    formula: str = "level",
    first_level: int = 1,
    spellbook: bool = False,
) -> dict[str, Any]:
    """A prepared caster's block: ability modifier + level (or half level) each day."""
    return {
        "ability": ability,
        "cantrips_base": cantrips,
        "kind": "prepared",
        "known": None,
        "prepared_formula": formula,
        "first_level": first_level,
        "spellbook": spellbook,
    }


def _kit(name: str, items: list[str], armor: str | None = None, shield: bool = False) -> dict:
    """A starting kit: catalog weapons by name, an ``ARMOR`` key, and whether it has a shield."""
    return {"name": name, "items": items, "armor": armor, "shield": shield}


# Kits come from each class's SRD 5.1 starting equipment and its (a)/(b) options. Weapon names
# match the item catalog (``srd_weapons_2024``); packs, ammunition, foci and tools are left off.
CLASSES: dict[str, dict[str, Any]] = {
    "Barbarian": {
        "hit_die": 12,
        "primary": ["STR"],
        "saves": ["STR", "CON"],
        "skills": {
            "choose": 2,
            "from": [
                "Animal Handling",
                "Athletics",
                "Intimidation",
                "Nature",
                "Perception",
                "Survival",
            ],
        },
        "armor": ["light", "medium", "shields"],
        "subclass_level": 3,
        "srd_subclasses": ["Path of the Berserker"],
        "spellcasting": None,
        "kits": [
            _kit("Greataxe, two handaxes, javelins", ["Greataxe", "Handaxe", "Handaxe", "Javelin"]),
            _kit("Greatsword, spear, javelins", ["Greatsword", "Spear", "Javelin"]),
        ],
    },
    "Bard": {
        "hit_die": 8,
        "primary": ["CHA"],
        "saves": ["DEX", "CHA"],
        "skills": {"choose": 3, "from": list(SKILLS)},
        "armor": ["light"],
        "subclass_level": 3,
        "srd_subclasses": ["College of Lore"],
        "spellcasting": _known("CHA", 2, _BARD_KNOWN),
        "kits": [
            _kit("Leather, rapier, dagger, lute", ["Rapier", "Dagger"], "Leather Armor"),
            _kit("Leather, longsword, dagger, lute", ["Longsword", "Dagger"], "Leather Armor"),
            _kit("Leather, light crossbow, dagger", ["Light Crossbow", "Dagger"], "Leather Armor"),
        ],
    },
    "Cleric": {
        "hit_die": 8,
        "primary": ["WIS"],
        "saves": ["WIS", "CHA"],
        "skills": {
            "choose": 2,
            "from": ["History", "Insight", "Medicine", "Persuasion", "Religion"],
        },
        "armor": ["light", "medium", "shields"],
        "subclass_level": 1,
        "srd_subclasses": ["Life Domain"],
        "spellcasting": _prepared("WIS", 3),
        "kits": [
            _kit(
                "Scale mail, shield, mace, light crossbow",
                ["Mace", "Light Crossbow"],
                "Scale Mail",
                True,
            ),
            _kit(
                "Leather, shield, mace, light crossbow (lighter)",
                ["Mace", "Light Crossbow"],
                "Leather Armor",
                True,
            ),
            _kit(
                "Chain mail, shield, mace (Life Domain: heavy armor)",
                ["Mace", "Light Crossbow"],
                "Chain Mail",
                True,
            ),
        ],
    },
    "Druid": {
        "hit_die": 8,
        "primary": ["WIS"],
        "saves": ["INT", "WIS"],
        "skills": {
            "choose": 2,
            "from": [
                "Arcana",
                "Animal Handling",
                "Insight",
                "Medicine",
                "Nature",
                "Perception",
                "Religion",
                "Survival",
            ],
        },
        # 2014 druids wear medium armor too (never metal).
        "armor": ["light", "medium", "shields"],
        "subclass_level": 2,
        "srd_subclasses": ["Circle of the Land"],
        "spellcasting": _prepared("WIS", 2),
        "kits": [
            _kit("Leather, wooden shield, scimitar", ["Scimitar"], "Leather Armor", True),
            _kit("Leather, quarterstaff, sling", ["Quarterstaff", "Sling"], "Leather Armor"),
        ],
    },
    "Fighter": {
        "hit_die": 10,
        "primary": ["STR", "DEX"],
        "saves": ["STR", "CON"],
        "skills": {
            "choose": 2,
            "from": [
                "Acrobatics",
                "Animal Handling",
                "Athletics",
                "History",
                "Insight",
                "Intimidation",
                "Perception",
                "Survival",
            ],
        },
        "armor": ["light", "medium", "heavy", "shields"],
        "subclass_level": 3,
        "srd_subclasses": ["Champion"],
        "spellcasting": None,
        "kits": [
            _kit(
                "Chain mail, longsword & shield, light crossbow",
                ["Longsword", "Light Crossbow"],
                "Chain Mail",
                True,
            ),
            _kit(
                "Chain mail, greatsword & flail, two handaxes",
                ["Greatsword", "Flail", "Handaxe", "Handaxe"],
                "Chain Mail",
            ),
            _kit(
                "Leather, longbow, rapier & shortsword, two handaxes",
                ["Longbow", "Rapier", "Shortsword", "Handaxe", "Handaxe"],
                "Leather Armor",
            ),
        ],
    },
    "Monk": {
        "hit_die": 8,
        "primary": ["DEX", "WIS"],
        "saves": ["STR", "DEX"],
        "skills": {
            "choose": 2,
            "from": ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"],
        },
        "armor": [],
        "subclass_level": 3,
        "srd_subclasses": ["Way of the Open Hand"],
        "spellcasting": None,
        "kits": [
            _kit("Shortsword & darts", ["Shortsword", "Dart"]),
            _kit("Spear & darts", ["Spear", "Dart"]),
        ],
    },
    "Paladin": {
        "hit_die": 10,
        "primary": ["STR", "CHA"],
        "saves": ["WIS", "CHA"],
        "skills": {
            "choose": 2,
            "from": ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"],
        },
        "armor": ["light", "medium", "heavy", "shields"],
        "subclass_level": 3,
        "srd_subclasses": ["Oath of Devotion"],
        "spellcasting": _prepared("CHA", 0, "half_level", first_level=2),
        "kits": [
            _kit(
                "Chain mail, longsword & shield, javelins",
                ["Longsword", "Javelin"],
                "Chain Mail",
                True,
            ),
            _kit(
                "Chain mail, greatsword & warhammer, javelins",
                ["Greatsword", "Warhammer", "Javelin"],
                "Chain Mail",
            ),
        ],
    },
    "Ranger": {
        "hit_die": 10,
        "primary": ["DEX", "WIS"],
        "saves": ["STR", "DEX"],
        "skills": {
            "choose": 3,
            "from": [
                "Animal Handling",
                "Athletics",
                "Insight",
                "Investigation",
                "Nature",
                "Perception",
                "Stealth",
                "Survival",
            ],
        },
        "armor": ["light", "medium", "shields"],
        "subclass_level": 3,
        "srd_subclasses": ["Hunter"],
        "spellcasting": _known("WIS", 0, _RANGER_KNOWN, first_level=2),
        "kits": [
            _kit(
                "Scale mail, two shortswords, longbow",
                ["Shortsword", "Shortsword", "Longbow"],
                "Scale Mail",
            ),
            _kit(
                "Leather, two shortswords, longbow (quieter)",
                ["Shortsword", "Shortsword", "Longbow"],
                "Leather Armor",
            ),
        ],
    },
    "Rogue": {
        "hit_die": 8,
        "primary": ["DEX"],
        "saves": ["DEX", "INT"],
        "skills": {
            "choose": 4,
            "from": [
                "Acrobatics",
                "Athletics",
                "Deception",
                "Insight",
                "Intimidation",
                "Investigation",
                "Perception",
                "Performance",
                "Persuasion",
                "Sleight of Hand",
                "Stealth",
            ],
        },
        "armor": ["light"],
        "subclass_level": 3,
        "srd_subclasses": ["Thief"],
        "spellcasting": None,
        "kits": [
            _kit(
                "Leather, rapier, shortbow, daggers",
                ["Rapier", "Shortbow", "Dagger", "Dagger"],
                "Leather Armor",
            ),
            _kit(
                "Leather, two shortswords, daggers",
                ["Shortsword", "Shortsword", "Dagger", "Dagger"],
                "Leather Armor",
            ),
        ],
    },
    "Sorcerer": {
        "hit_die": 6,
        "primary": ["CHA"],
        "saves": ["CON", "CHA"],
        "skills": {
            "choose": 2,
            "from": ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"],
        },
        "armor": [],
        "subclass_level": 1,
        "srd_subclasses": ["Draconic Bloodline"],
        "spellcasting": _known("CHA", 4, _SORC_KNOWN),
        "kits": [
            _kit("Light crossbow & daggers", ["Light Crossbow", "Dagger", "Dagger"]),
            _kit("Quarterstaff & daggers", ["Quarterstaff", "Dagger", "Dagger"]),
        ],
    },
    "Warlock": {
        "hit_die": 8,
        "primary": ["CHA"],
        "saves": ["WIS", "CHA"],
        "skills": {
            "choose": 2,
            "from": [
                "Arcana",
                "Deception",
                "History",
                "Intimidation",
                "Investigation",
                "Nature",
                "Religion",
            ],
        },
        "armor": ["light"],
        "subclass_level": 1,
        "srd_subclasses": ["The Fiend"],
        "spellcasting": _known("CHA", 2, _WARLOCK_KNOWN),
        "kits": [
            _kit(
                "Leather, light crossbow, quarterstaff, daggers",
                ["Light Crossbow", "Quarterstaff", "Dagger", "Dagger"],
                "Leather Armor",
            ),
            _kit(
                "Leather, sickle & spear, daggers",
                ["Sickle", "Spear", "Dagger", "Dagger"],
                "Leather Armor",
            ),
        ],
    },
    "Wizard": {
        "hit_die": 6,
        "primary": ["INT"],
        "saves": ["INT", "WIS"],
        "skills": {
            "choose": 2,
            "from": ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"],
        },
        "armor": [],
        "subclass_level": 2,
        "srd_subclasses": ["School of Evocation"],
        "spellcasting": _prepared("INT", 3, spellbook=True),
        "kits": [
            _kit("Quarterstaff & spellbook", ["Quarterstaff"]),
            _kit("Dagger & spellbook", ["Dagger"]),
        ],
    },
}

# ── Helpers ──────────────────────────────────────────────────────────────────


def _lvl(level: int) -> int:
    """A level clamped to 1–20."""
    return max(1, min(20, level))


def cantrips_known(class_name: str, level: int) -> int:
    """Cantrips a class knows at ``level`` (0 for non-casters and half-casters).

    SRD 5.1 follows the same pattern as 2024: the base at 1, +1 at 4 and +1 at 10.
    """
    sc = CLASSES[class_name]["spellcasting"]
    if not sc or not sc.get("cantrips_base"):
        return 0
    return sc["cantrips_base"] + (1 if level >= 4 else 0) + (1 if level >= 10 else 0)


def spells_known(class_name: str, level: int) -> int:
    """Leveled spells a known caster knows at ``level`` (0 for prepared casters and non-casters).

    Args:
        class_name: The class.
        level: The class level.

    Returns:
        The number from the class's Spells Known table.
    """
    sc = CLASSES[class_name]["spellcasting"]
    if not sc or sc["kind"] != "known":
        return 0
    return sc["known"][_lvl(level) - 1]


def spells_prepared(class_name: str, level: int, mod: int = 0) -> int:
    """Leveled spells a class has ready at ``level``: prepared (2014 formula) or known.

    Called like the 2024 helper with two arguments; pass ``mod`` (the spellcasting ability
    modifier) to get a prepared caster's real count.

    Args:
        class_name: The class.
        level: The class level.
        mod: The spellcasting ability modifier (prepared casters only).

    Returns:
        Cleric, Druid, Wizard: ``max(1, mod + level)``. Paladin: ``max(1, mod + level // 2)``
        from level 2, 0 at level 1. Known casters: their Spells Known. Non-casters: 0.
    """
    sc = CLASSES[class_name]["spellcasting"]
    if not sc:
        return 0
    if sc["kind"] == "known":
        return spells_known(class_name, level)
    lvl = _lvl(level)
    if lvl < sc["first_level"]:
        return 0
    base = lvl // 2 if sc["prepared_formula"] == "half_level" else lvl
    return max(1, mod + base)


def spellbook_size(class_name: str, level: int) -> int:
    """Spells in a Wizard's spellbook at ``level`` from leveling alone (0 for other classes).

    Args:
        class_name: The class.
        level: The class level.

    Returns:
        6 at level 1, plus 2 for every level after.
    """
    sc = CLASSES[class_name]["spellcasting"]
    if not sc or not sc.get("spellbook"):
        return 0
    return _SPELLBOOK_START + _SPELLBOOK_PER_LEVEL * (_lvl(level) - 1)


def max_spell_level(class_name: str, level: int) -> int:
    """Highest spell level available at ``level`` (full vs half casters; Warlock pact).

    2014 half casters (Paladin, Ranger) have no spells at level 1; from level 2 they follow
    the same table as 2024. Full casters and the Warlock match 2024 throughout.
    """
    sc = CLASSES[class_name]["spellcasting"]
    if not sc or level < sc["first_level"]:
        return 0
    if class_name in ("Paladin", "Ranger"):
        return min(5, (max(1, level) + 3) // 4)
    if class_name == "Warlock":
        return min(5, (level + 1) // 2)
    return min(9, (level + 1) // 2)
