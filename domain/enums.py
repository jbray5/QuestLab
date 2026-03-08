"""Enums for QuestLab domain — D&D 5e 2024 rules."""

from enum import Enum


class CharacterClass(str, Enum):
    """D&D 5e 2024 character classes."""

    BARBARIAN = "Barbarian"
    BARD = "Bard"
    CLERIC = "Cleric"
    DRUID = "Druid"
    FIGHTER = "Fighter"
    MONK = "Monk"
    PALADIN = "Paladin"
    RANGER = "Ranger"
    ROGUE = "Rogue"
    SORCERER = "Sorcerer"
    WARLOCK = "Warlock"
    WIZARD = "Wizard"
    ARTIFICER = "Artificer"


class AbilityScore(str, Enum):
    """The six core ability scores."""

    STR = "STR"
    DEX = "DEX"
    CON = "CON"
    INT = "INT"
    WIS = "WIS"
    CHA = "CHA"


class DamageType(str, Enum):
    """D&D 5e 2024 damage types."""

    ACID = "Acid"
    BLUDGEONING = "Bludgeoning"
    COLD = "Cold"
    FIRE = "Fire"
    FORCE = "Force"
    LIGHTNING = "Lightning"
    NECROTIC = "Necrotic"
    PIERCING = "Piercing"
    POISON = "Poison"
    PSYCHIC = "Psychic"
    RADIANT = "Radiant"
    SLASHING = "Slashing"
    THUNDER = "Thunder"


class CreatureSize(str, Enum):
    """D&D 5e creature sizes."""

    TINY = "Tiny"
    SMALL = "Small"
    MEDIUM = "Medium"
    LARGE = "Large"
    HUGE = "Huge"
    GARGANTUAN = "Gargantuan"


class CreatureType(str, Enum):
    """D&D 5e creature types."""

    ABERRATION = "Aberration"
    BEAST = "Beast"
    CELESTIAL = "Celestial"
    CONSTRUCT = "Construct"
    DRAGON = "Dragon"
    ELEMENTAL = "Elemental"
    FEY = "Fey"
    FIEND = "Fiend"
    GIANT = "Giant"
    HUMANOID = "Humanoid"
    MONSTROSITY = "Monstrosity"
    OOZE = "Ooze"
    PLANT = "Plant"
    UNDEAD = "Undead"


class EncounterDifficulty(str, Enum):
    """2024 DMG encounter difficulty bands."""

    LOW = "Low"
    MODERATE = "Moderate"
    HIGH = "High"
    DEADLY = "Deadly"


class AdventureTier(str, Enum):
    """D&D 5e 2024 play tiers by level range."""

    TIER1 = "Tier1"  # Levels 1-4
    TIER2 = "Tier2"  # Levels 5-10
    TIER3 = "Tier3"  # Levels 11-16
    TIER4 = "Tier4"  # Levels 17-20


class SpellSchool(str, Enum):
    """D&D 5e schools of magic."""

    ABJURATION = "Abjuration"
    CONJURATION = "Conjuration"
    DIVINATION = "Divination"
    ENCHANTMENT = "Enchantment"
    EVOCATION = "Evocation"
    ILLUSION = "Illusion"
    NECROMANCY = "Necromancy"
    TRANSMUTATION = "Transmutation"


class ItemRarity(str, Enum):
    """Magic item rarity tiers."""

    COMMON = "Common"
    UNCOMMON = "Uncommon"
    RARE = "Rare"
    VERY_RARE = "VeryRare"
    LEGENDARY = "Legendary"
    ARTIFACT = "Artifact"


class MapNodeType(str, Enum):
    """Types of nodes on a QuestLab map."""

    ROOM = "Room"
    CORRIDOR = "Corridor"
    OUTDOOR = "Outdoor"
    SETTLEMENT = "Settlement"
    DUNGEON = "Dungeon"
    LAIR = "Lair"


class SessionStatus(str, Enum):
    """Lifecycle states for a game session."""

    DRAFT = "Draft"
    READY = "Ready"
    IN_PROGRESS = "InProgress"
    COMPLETE = "Complete"
