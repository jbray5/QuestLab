"""SRD 5.2.1 character-creation options (Plan 74) — species, backgrounds,
origin feats, class tables, armor. This is the shippable compendium: the
2024 System Reference Document under CC-BY 4.0. Anything outside it (the
other subclasses, other species) is entered by the player as "from my
book" — a name only, with the DM's blessing.

Everything here is data. The builder service turns choices into a PC.
"""

from typing import Any

ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]

SKILLS: dict[str, str] = {
    "Acrobatics": "DEX",
    "Animal Handling": "WIS",
    "Arcana": "INT",
    "Athletics": "STR",
    "Deception": "CHA",
    "History": "INT",
    "Insight": "WIS",
    "Intimidation": "CHA",
    "Investigation": "INT",
    "Medicine": "WIS",
    "Nature": "INT",
    "Perception": "WIS",
    "Performance": "CHA",
    "Persuasion": "CHA",
    "Religion": "INT",
    "Sleight of Hand": "DEX",
    "Stealth": "DEX",
    "Survival": "WIS",
}

STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
# Point buy: 27 points, scores 8–15 before background bonuses.
POINT_BUY_COST = {8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9}
POINT_BUY_BUDGET = 27

SPECIES: list[dict[str, Any]] = [
    {
        "name": "Dragonborn",
        "size": "Medium",
        "speed": 30,
        "traits": [
            "Draconic Ancestry — choose a dragon type; it sets your breath weapon's damage and your resistance.",  # noqa: E501
            "Breath Weapon — replace one attack with a 15-ft cone or 30-ft line (Dex save), 1d10 rising with level; uses = proficiency bonus per long rest.",  # noqa: E501
            "Damage Resistance to your ancestry's damage type.",
            "Darkvision 60 ft.",
            "Draconic Flight (level 5) — spectral wings for 10 minutes, once per long rest.",
        ],
    },
    {
        "name": "Dwarf",
        "size": "Medium",
        "speed": 30,
        "traits": [
            "Darkvision 120 ft.",
            "Dwarven Resilience — resistance to poison damage; advantage on saves against the Poisoned condition.",  # noqa: E501
            "Dwarven Toughness — +1 hit point per level.",
            "Stonecunning — tremorsense 60 ft. on stone, proficiency-bonus uses per long rest.",
        ],
        "hp_per_level_bonus": 1,
    },
    {
        "name": "Elf",
        "size": "Medium",
        "speed": 30,
        "traits": [
            "Darkvision 60 ft.",
            "Elven Lineage — Drow, High Elf, or Wood Elf: a cantrip and lineage spells as you level.",  # noqa: E501
            "Fey Ancestry — advantage on saves against the Charmed condition.",
            "Keen Senses — proficiency in Insight, Perception, or Survival.",
            "Trance — a 4-hour trance counts as a long rest.",
        ],
    },
    {
        "name": "Gnome",
        "size": "Small",
        "speed": 30,
        "traits": [
            "Darkvision 60 ft.",
            "Gnomish Cunning — advantage on Int, Wis, and Cha saves.",
            "Gnomish Lineage — Forest Gnome (Minor Illusion, Speak with Animals) or Rock Gnome (Mending, Prestidigitation, tiny clockwork devices).",  # noqa: E501
        ],
    },
    {
        "name": "Goliath",
        "size": "Medium",
        "speed": 35,
        "traits": [
            "Giant Ancestry — choose one supernatural boon (Cloud's Jaunt, Fire's Burn, Frost's Chill, Hill's Tumble, Stone's Endurance, Storm's Thunder); proficiency-bonus uses per long rest.",  # noqa: E501
            "Large Form (level 5) — become Large for 10 minutes, once per long rest.",
            "Powerful Build — advantage against Grappled; count as one size larger for carrying.",
        ],
    },
    {
        "name": "Halfling",
        "size": "Small",
        "speed": 30,
        "traits": [
            "Brave — advantage on saves against the Frightened condition.",
            "Halfling Nimbleness — move through the space of any larger creature.",
            "Luck — reroll a natural 1 on a d20 Test.",
            "Naturally Stealthy — Hide even when obscured only by a larger creature.",
        ],
    },
    {
        "name": "Human",
        "size": "Medium or Small",
        "speed": 30,
        "traits": [
            "Resourceful — Heroic Inspiration after every long rest.",
            "Skillful — proficiency in one skill of your choice.",
            "Versatile — one Origin feat of your choice.",
        ],
        "bonus_skill_choices": 1,
        "bonus_origin_feat": True,
    },
    {
        "name": "Orc",
        "size": "Medium",
        "speed": 30,
        "traits": [
            "Adrenaline Rush — Dash as a bonus action and gain temp HP equal to your proficiency bonus; proficiency-bonus uses per short or long rest.",  # noqa: E501
            "Darkvision 120 ft.",
            "Relentless Endurance — drop to 1 HP instead of 0, once per long rest.",
        ],
    },
    {
        "name": "Tiefling",
        "size": "Medium or Small",
        "speed": 30,
        "traits": [
            "Darkvision 60 ft.",
            "Fiendish Legacy — Abyssal, Chthonic, or Infernal: a resistance, a cantrip, and legacy spells as you level.",  # noqa: E501
            "Otherworldly Presence — you know the Thaumaturgy cantrip.",
        ],
    },
]

BACKGROUNDS: list[dict[str, Any]] = [
    {
        "name": "Acolyte",
        "abilities": ["INT", "WIS", "CHA"],
        "feat": "Magic Initiate (Cleric)",
        "skills": ["Insight", "Religion"],
        "tool": "Calligrapher's Supplies",
        "blurb": "You served in a temple. Prayer, ritual, and the smell of incense are home.",
    },
    {
        "name": "Criminal",
        "abilities": ["DEX", "CON", "INT"],
        "feat": "Alert",
        "skills": ["Sleight of Hand", "Stealth"],
        "tool": "Thieves' Tools",
        "blurb": "You made a living breaking rules — and learned how to read a room from the shadows.",  # noqa: E501
    },
    {
        "name": "Sage",
        "abilities": ["CON", "INT", "WIS"],
        "feat": "Magic Initiate (Wizard)",
        "skills": ["Arcana", "History"],
        "tool": "Calligrapher's Supplies",
        "blurb": "Libraries, letters, and long nights over a lamp. You know where the answers are kept.",  # noqa: E501
    },
    {
        "name": "Soldier",
        "abilities": ["STR", "DEX", "CON"],
        "feat": "Savage Attacker",
        "skills": ["Athletics", "Intimidation"],
        "tool": "Gaming Set",
        "blurb": "You trained, marched, and fought under a banner. Orders make sense to you.",
    },
]

ORIGIN_FEATS: list[dict[str, str]] = [
    {
        "name": "Alert",
        "blurb": "Add your proficiency bonus to initiative; swap initiative with a willing ally.",
    },
    {
        "name": "Crafter",
        "blurb": "Proficiency with three artisan's tools, a discount at shops, and fast crafting.",
    },
    {"name": "Healer", "blurb": "Use a Healer's Kit to heal, and reroll 1s on healing dice."},
    {
        "name": "Lucky",
        "blurb": "Luck Points equal to your proficiency bonus: advantage on a d20 Test, or impose disadvantage on an attack against you.",  # noqa: E501
    },
    {
        "name": "Magic Initiate",
        "blurb": "Two cantrips and one 1st-level spell from the Cleric, Druid, or Wizard list.",
    },
    {
        "name": "Musician",
        "blurb": "Proficiency with three instruments; inspire allies after a rest.",
    },
    {
        "name": "Savage Attacker",
        "blurb": "Once per turn, roll weapon damage twice and take the higher.",
    },
    {"name": "Skilled", "blurb": "Proficiency in any three skills or tools."},
    {
        "name": "Tavern Brawler",
        "blurb": "Better unarmed strikes, reroll 1s on their damage, push with a punch, improvised weapons are yours.",  # noqa: E501
    },
    {"name": "Tough", "blurb": "+2 hit points per level."},
]

_CASTER_FULL_PREPARED = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]
_HALF_PREPARED = [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15]
_WARLOCK_PREPARED = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]
_SORC_PREPARED = [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]


def _cantrips(base: int, level: int) -> int:
    """Cantrips known: base at 1, +1 at 4 and +1 at 10 (the SRD pattern)."""
    return base + (1 if level >= 4 else 0) + (1 if level >= 10 else 0)


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
        "srd_subclasses": ["Berserker"],
        "spellcasting": None,
        "kits": [
            {
                "name": "Greataxe & handaxes",
                "items": ["Greataxe", "Handaxe", "Handaxe"],
                "armor": None,
                "shield": False,
            },
            {
                "name": "Two handaxes, light and quick",
                "items": ["Handaxe", "Handaxe", "Javelin"],
                "armor": None,
                "shield": False,
            },
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
        "spellcasting": {"ability": "CHA", "cantrips_base": 2, "prepared": _CASTER_FULL_PREPARED},
        "kits": [
            {
                "name": "Leather, dagger, instrument",
                "items": ["Dagger"],
                "armor": "Leather Armor",
                "shield": False,
            },
            {
                "name": "Leather & rapier",
                "items": ["Rapier", "Dagger"],
                "armor": "Leather Armor",
                "shield": False,
            },
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
        "subclass_level": 3,
        "srd_subclasses": ["Life Domain"],
        "spellcasting": {"ability": "WIS", "cantrips_base": 3, "prepared": _CASTER_FULL_PREPARED},
        "kits": [
            {
                "name": "Chain shirt, shield, mace",
                "items": ["Mace"],
                "armor": "Chain Shirt",
                "shield": True,
            },
            {
                "name": "Leather, shield, mace (lighter)",
                "items": ["Mace"],
                "armor": "Leather Armor",
                "shield": True,
            },
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
        "armor": ["light", "shields"],
        "subclass_level": 3,
        "srd_subclasses": ["Circle of the Land"],
        "spellcasting": {"ability": "WIS", "cantrips_base": 2, "prepared": _CASTER_FULL_PREPARED},
        "kits": [
            {
                "name": "Leather, shield, sickle",
                "items": ["Sickle", "Quarterstaff"],
                "armor": "Leather Armor",
                "shield": True,
            }
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
                "Persuasion",
                "Perception",
                "Survival",
            ],
        },
        "armor": ["light", "medium", "heavy", "shields"],
        "subclass_level": 3,
        "srd_subclasses": ["Champion"],
        "spellcasting": None,
        "kits": [
            {
                "name": "Chain mail, greatsword",
                "items": ["Greatsword", "Flail"],
                "armor": "Chain Mail",
                "shield": False,
            },
            {
                "name": "Chain mail, longsword & shield",
                "items": ["Longsword"],
                "armor": "Chain Mail",
                "shield": True,
            },
            {
                "name": "Studded leather, scimitar & shortsword, longbow",
                "items": ["Scimitar", "Shortsword", "Longbow"],
                "armor": "Studded Leather Armor",
                "shield": False,
            },
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
        "srd_subclasses": ["Warrior of the Open Hand"],
        "spellcasting": None,
        "kits": [
            {
                "name": "Spear & daggers",
                "items": ["Spear", "Dagger", "Dagger"],
                "armor": None,
                "shield": False,
            }
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
        "spellcasting": {
            "ability": "CHA",
            "cantrips_base": 0,
            "prepared": _HALF_PREPARED,
            "starts_at": 1,
        },
        "kits": [
            {
                "name": "Chain mail, longsword & shield",
                "items": ["Longsword", "Javelin"],
                "armor": "Chain Mail",
                "shield": True,
            },
            {
                "name": "Chain mail, greatsword",
                "items": ["Greatsword", "Javelin"],
                "armor": "Chain Mail",
                "shield": False,
            },
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
        "spellcasting": {
            "ability": "WIS",
            "cantrips_base": 0,
            "prepared": _HALF_PREPARED,
            "starts_at": 1,
        },
        "kits": [
            {
                "name": "Studded leather, scimitar & shortsword, longbow",
                "items": ["Scimitar", "Shortsword", "Longbow"],
                "armor": "Studded Leather Armor",
                "shield": False,
            }
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
            {
                "name": "Leather, shortsword, shortbow, daggers",
                "items": ["Shortsword", "Shortbow", "Dagger", "Dagger"],
                "armor": "Leather Armor",
                "shield": False,
            }
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
        "subclass_level": 3,
        "srd_subclasses": ["Draconic Sorcery"],
        "spellcasting": {"ability": "CHA", "cantrips_base": 4, "prepared": _SORC_PREPARED},
        "kits": [
            {
                "name": "Spear & daggers",
                "items": ["Spear", "Dagger", "Dagger"],
                "armor": None,
                "shield": False,
            }
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
        "subclass_level": 3,
        "srd_subclasses": ["Fiend Patron"],
        "spellcasting": {"ability": "CHA", "cantrips_base": 2, "prepared": _WARLOCK_PREPARED},
        "kits": [
            {
                "name": "Leather, sickle, daggers",
                "items": ["Sickle", "Dagger", "Dagger"],
                "armor": "Leather Armor",
                "shield": False,
            }
        ],
    },
    "Wizard": {
        "hit_die": 6,
        "primary": ["INT"],
        "saves": ["INT", "WIS"],
        "skills": {
            "choose": 2,
            "from": [
                "Arcana",
                "History",
                "Insight",
                "Investigation",
                "Medicine",
                "Nature",
                "Religion",
            ],
        },
        "armor": [],
        "subclass_level": 3,
        "srd_subclasses": ["Evoker"],
        "spellcasting": {"ability": "INT", "cantrips_base": 3, "prepared": _CASTER_FULL_PREPARED},
        "kits": [
            {
                "name": "Quarterstaff & dagger",
                "items": ["Quarterstaff", "Dagger"],
                "armor": None,
                "shield": False,
            }
        ],
    },
}

# SRD armor: base AC, dex cap (None = full), category, strength requirement.
ARMOR: dict[str, dict[str, Any]] = {
    "Padded Armor": {"base": 11, "dex_cap": None, "category": "light"},
    "Leather Armor": {"base": 11, "dex_cap": None, "category": "light"},
    "Studded Leather Armor": {"base": 12, "dex_cap": None, "category": "light"},
    "Hide Armor": {"base": 12, "dex_cap": 2, "category": "medium"},
    "Chain Shirt": {"base": 13, "dex_cap": 2, "category": "medium"},
    "Scale Mail": {"base": 14, "dex_cap": 2, "category": "medium"},
    "Breastplate": {"base": 14, "dex_cap": 2, "category": "medium"},
    "Half Plate Armor": {"base": 15, "dex_cap": 2, "category": "medium"},
    "Ring Mail": {"base": 14, "dex_cap": 0, "category": "heavy"},
    "Chain Mail": {"base": 16, "dex_cap": 0, "category": "heavy", "str_min": 13},
    "Splint Armor": {"base": 17, "dex_cap": 0, "category": "heavy", "str_min": 15},
    "Plate Armor": {"base": 18, "dex_cap": 0, "category": "heavy", "str_min": 15},
}
SHIELD_BONUS = 2


def proficiency_bonus(level: int) -> int:
    """2024 proficiency bonus by level."""
    return 2 + (max(1, min(20, level)) - 1) // 4


def ability_mod(score: int) -> int:
    """Ability modifier from a score."""
    return (score - 10) // 2


def cantrips_known(class_name: str, level: int) -> int:
    """Cantrips a class knows at ``level`` (0 for non-casters and half-casters)."""
    sc = CLASSES[class_name]["spellcasting"]
    if not sc or not sc.get("cantrips_base"):
        return 0
    return _cantrips(sc["cantrips_base"], level)


def spells_prepared(class_name: str, level: int) -> int:
    """Leveled spells a class prepares/knows at ``level`` (0 for non-casters)."""
    sc = CLASSES[class_name]["spellcasting"]
    if not sc:
        return 0
    return sc["prepared"][max(1, min(20, level)) - 1]


def max_spell_level(class_name: str, level: int) -> int:
    """Highest spell level available at ``level`` (full vs half casters; Warlock pact)."""
    sc = CLASSES[class_name]["spellcasting"]
    if not sc:
        return 0
    if class_name in ("Paladin", "Ranger"):
        return min(5, (level + 1) // 4) if level >= 2 else 1 if level == 1 else 0
    if class_name == "Warlock":
        return min(5, (level + 1) // 2)
    return min(9, (level + 1) // 2)
