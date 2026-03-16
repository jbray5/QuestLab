"""Tests for domain/enums.py — all enum values and types."""

from domain.enums import (
    AbilityScore,
    AdventureTier,
    CharacterClass,
    CreatureSize,
    CreatureType,
    DamageType,
    EncounterDifficulty,
    ItemRarity,
    MapNodeType,
    SessionStatus,
    SpellSchool,
)


class TestCharacterClass:
    """Tests for CharacterClass enum."""

    def test_all_classes_present(self):
        """Ensure all 2024 5e classes are defined."""
        expected = {
            "Barbarian",
            "Bard",
            "Cleric",
            "Druid",
            "Fighter",
            "Monk",
            "Paladin",
            "Ranger",
            "Rogue",
            "Sorcerer",
            "Warlock",
            "Wizard",
            "Artificer",
        }
        assert {c.value for c in CharacterClass} == expected

    def test_is_string_enum(self):
        """CharacterClass inherits from str for JSON serialisation."""
        assert isinstance(CharacterClass.WIZARD, str)
        assert CharacterClass.WIZARD == "Wizard"


class TestAbilityScore:
    """Tests for AbilityScore enum."""

    def test_six_scores(self):
        """There are exactly six ability scores."""
        assert len(AbilityScore) == 6

    def test_values(self):
        """Scores use standard 3-letter abbreviations."""
        assert set(AbilityScore) == {
            AbilityScore.STR,
            AbilityScore.DEX,
            AbilityScore.CON,
            AbilityScore.INT,
            AbilityScore.WIS,
            AbilityScore.CHA,
        }


class TestDamageType:
    """Tests for DamageType enum."""

    def test_thirteen_types(self):
        """There are exactly 13 5e damage types."""
        assert len(DamageType) == 13

    def test_fire_present(self):
        """Fire damage type is defined."""
        assert DamageType.FIRE.value == "Fire"


class TestAdventureTier:
    """Tests for AdventureTier enum."""

    def test_four_tiers(self):
        """There are exactly four play tiers."""
        assert len(AdventureTier) == 4

    def test_tier_values(self):
        """Tier names follow expected pattern."""
        assert AdventureTier.TIER1.value == "Tier1"
        assert AdventureTier.TIER4.value == "Tier4"


class TestSessionStatus:
    """Tests for SessionStatus enum."""

    def test_lifecycle_order(self):
        """All four session lifecycle states are present."""
        assert SessionStatus.DRAFT.value == "Draft"
        assert SessionStatus.READY.value == "Ready"
        assert SessionStatus.IN_PROGRESS.value == "InProgress"
        assert SessionStatus.COMPLETE.value == "Complete"


class TestCreatureSize:
    """Tests for CreatureSize enum."""

    def test_six_sizes(self):
        """Six creature sizes are defined."""
        assert len(CreatureSize) == 6

    def test_gargantuan_present(self):
        """Gargantuan is the largest size."""
        assert CreatureSize.GARGANTUAN.value == "Gargantuan"


class TestCreatureType:
    """Tests for CreatureType enum."""

    def test_fourteen_types(self):
        """Fourteen creature types are defined."""
        assert len(CreatureType) == 14

    def test_dragon_present(self):
        """Dragon type is defined."""
        assert CreatureType.DRAGON.value == "Dragon"


class TestEncounterDifficulty:
    """Tests for EncounterDifficulty enum."""

    def test_four_difficulties(self):
        """Four encounter difficulty bands are defined."""
        assert len(EncounterDifficulty) == 4

    def test_deadly_is_hardest(self):
        """Deadly is the most dangerous band."""
        assert EncounterDifficulty.DEADLY.value == "Deadly"


class TestSpellSchool:
    """Tests for SpellSchool enum."""

    def test_eight_schools(self):
        """Eight schools of magic are defined."""
        assert len(SpellSchool) == 8

    def test_evocation_present(self):
        """Evocation school is defined."""
        assert SpellSchool.EVOCATION.value == "Evocation"


class TestMapNodeType:
    """Tests for MapNodeType enum."""

    def test_node_types_count(self):
        """Thirteen map node types are defined (6 dungeon-scale + 7 world-scale)."""
        assert len(MapNodeType) == 13

    def test_lair_present(self):
        """Lair node type is defined."""
        assert MapNodeType.LAIR.value == "Lair"


class TestItemRarity:
    """Tests for ItemRarity enum."""

    def test_six_rarities(self):
        """Six rarity tiers match 2024 DMG."""
        assert len(ItemRarity) == 6

    def test_artifact_present(self):
        """Artifact rarity is defined."""
        assert ItemRarity.ARTIFACT.value == "Artifact"
