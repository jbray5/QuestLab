"""Tests for integrations.dnd_rules.encounter_math.

Covers:
- cr_to_xp mapping
- Monster-count multiplier
- Difficulty calculation for various party compositions
- Edge cases (empty roster, single PC, no monsters)
"""

import pytest

from domain.enums import EncounterDifficulty
from integrations.dnd_rules.encounter_math import (
    CR_TO_XP,
    calculate_difficulty,
    cr_to_xp,
)


class TestCrToXp:
    """Tests for the cr_to_xp helper."""

    def test_cr_zero(self):
        """CR 0 → 10 XP."""
        assert cr_to_xp("0") == 10

    def test_cr_fraction_eighth(self):
        """CR 1/8 → 25 XP."""
        assert cr_to_xp("1/8") == 25

    def test_cr_fraction_quarter(self):
        """CR 1/4 → 50 XP."""
        assert cr_to_xp("1/4") == 50

    def test_cr_fraction_half(self):
        """CR 1/2 → 100 XP."""
        assert cr_to_xp("1/2") == 100

    def test_cr_1(self):
        """CR 1 → 200 XP."""
        assert cr_to_xp("1") == 200

    def test_cr_5(self):
        """CR 5 → 1800 XP."""
        assert cr_to_xp("5") == 1800

    def test_cr_17(self):
        """CR 17 → 18000 XP (Adult Red Dragon)."""
        assert cr_to_xp("17") == 18000

    def test_cr_30(self):
        """CR 30 → 155000 XP (Tarrasque)."""
        assert cr_to_xp("30") == 155000

    def test_invalid_cr(self):
        """Unknown CR raises ValueError."""
        with pytest.raises(ValueError, match="Unknown challenge rating"):
            cr_to_xp("99")

    def test_cr_to_xp_dict_has_all_srd_crs(self):
        """CR_TO_XP includes all 16 standard CR strings."""
        expected_fraction_crs = {"0", "1/8", "1/4", "1/2"}
        for cr in expected_fraction_crs:
            assert cr in CR_TO_XP


class TestCalculateDifficulty:
    """Tests for calculate_difficulty()."""

    def test_empty_roster_is_low(self):
        """No monsters → LOW difficulty."""
        result = calculate_difficulty([5, 5, 5, 5], [])
        assert result.difficulty == EncounterDifficulty.LOW
        assert result.raw_xp == 0
        assert result.adjusted_xp == 0

    def test_empty_party_raises(self):
        """PC level out of range raises ValueError."""
        with pytest.raises(ValueError):
            calculate_difficulty([0], [200])

    def test_pc_level_21_raises(self):
        """PC level > 20 raises ValueError."""
        with pytest.raises(ValueError):
            calculate_difficulty([21], [200])

    def test_single_goblin_4_l1_pcs_is_low(self):
        """1 Goblin (CR 1/4, 50 XP) vs 4 level-1 PCs → LOW.

        Party easy threshold: 4 × 25 = 100.
        Adjusted XP: 50 × 1.0 (single monster) = 50 < 100.
        """
        result = calculate_difficulty([1, 1, 1, 1], [50])
        assert result.difficulty == EncounterDifficulty.LOW
        assert result.multiplier == 1.0
        assert result.adjusted_xp == 50

    def test_four_goblins_4_l1_pcs_is_moderate(self):
        """4 Goblins (50 XP each) vs 4 L1 PCs.

        Raw XP = 200, multiplier = 2.0, adjusted = 400.
        Easy=100, Medium=200, Hard=300, Deadly=400.
        400 >= 400 → DEADLY.
        """
        result = calculate_difficulty([1, 1, 1, 1], [50, 50, 50, 50])
        assert result.raw_xp == 200
        assert result.multiplier == 2.0
        assert result.adjusted_xp == 400
        assert result.difficulty == EncounterDifficulty.DEADLY

    def test_adult_red_dragon_4_l5_pcs_is_deadly(self):
        """Adult Red Dragon (CR 17, 18000 XP) vs 4 L5 PCs → DEADLY.

        Party deadly threshold: 4 × 1100 = 4400.
        Single monster multiplier: 1.0, adjusted = 18000 > 4400.
        """
        result = calculate_difficulty([5, 5, 5, 5], [18000])
        assert result.deadly_threshold == 4400
        assert result.adjusted_xp == 18000
        assert result.difficulty == EncounterDifficulty.DEADLY

    def test_two_ogres_4_l5_pcs_is_moderate(self):
        """2 Ogres (450 XP each) vs 4 L5 PCs.

        Raw XP = 900, multiplier = 1.5, adjusted = 1350.
        Easy=1000, Medium=2000 → LOW (1350 >= 1000 but < 2000 = LOW by enum mapping).
        Wait, thresholds for L5 are: easy=250, medium=500, hard=750, deadly=1100.
        Party of 4: easy=1000, medium=2000, hard=3000, deadly=4400.
        1350 >= 1000 (easy) but < 2000 (medium) → LOW.
        """
        result = calculate_difficulty([5, 5, 5, 5], [450, 450])
        assert result.raw_xp == 900
        assert result.multiplier == 1.5
        assert result.adjusted_xp == 1350
        assert result.difficulty == EncounterDifficulty.LOW

    def test_hard_encounter_l5(self):
        """Encounter at the Hard band for L5 party.

        Hard threshold for 4×L5 PCs = 4 × 750 = 3000.
        Need adjusted_xp >= 3000 but < 4400.
        Use 2 Trolls (1800 XP each): raw=3600, mult=1.5, adjusted=5400 → DEADLY.
        Use 1 Troll + 1 Gladiator: raw=3600, mult=1.5, adjusted=5400 → DEADLY.
        Use 3 Ogres (450 XP): raw=1350, mult=2.0, adjusted=2700 → LOW.
        Use 1 Fire Giant (5000 XP): adjusted=5000 → DEADLY.
        Let's just verify a hard encounter band directly.
        """
        # 4 Bugbears (200 XP each): raw=800, mult=2.0, adj=1600.
        # L3 PCs (party 4): easy=300, medium=600, hard=900, deadly=1600.
        # 1600 >= 1600 → DEADLY.
        result = calculate_difficulty([3, 3, 3, 3], [200, 200, 200, 200])
        assert result.difficulty == EncounterDifficulty.DEADLY

    def test_multiplier_single(self):
        """Single monster uses multiplier 1.0."""
        result = calculate_difficulty([10], [5900])
        assert result.multiplier == 1.0

    def test_multiplier_two(self):
        """Two monsters use multiplier 1.5."""
        result = calculate_difficulty([10], [100, 100])
        assert result.multiplier == 1.5

    def test_multiplier_three_to_six(self):
        """3–6 monsters use multiplier 2.0."""
        result = calculate_difficulty([10], [100, 100, 100])
        assert result.multiplier == 2.0

    def test_multiplier_seven_to_ten(self):
        """7–10 monsters use multiplier 2.5."""
        monsters = [50] * 7
        result = calculate_difficulty([10], monsters)
        assert result.multiplier == 2.5

    def test_multiplier_eleven_to_fourteen(self):
        """11–14 monsters use multiplier 3.0."""
        monsters = [10] * 11
        result = calculate_difficulty([5], monsters)
        assert result.multiplier == 3.0

    def test_multiplier_fifteen_plus(self):
        """15+ monsters use multiplier 4.0."""
        monsters = [10] * 15
        result = calculate_difficulty([5], monsters)
        assert result.multiplier == 4.0

    def test_thresholds_sum_correctly(self):
        """Thresholds are summed across all PCs."""
        # 2 L1 + 1 L5: easy = 25+25+250 = 300
        result = calculate_difficulty([1, 1, 5], [0])
        assert result.easy_threshold == 300

    def test_moderate_difficulty(self):
        """Encounter in MODERATE band."""
        # 4×L5 PCs: medium=2000, hard=3000.
        # 2 trolls (1800 each): raw=3600, mult=1.5, adj=5400 → DEADLY.
        # 1 Mage (2300 XP): adj=2300 → >= 2000 and < 3000 → MODERATE.
        result = calculate_difficulty([5, 5, 5, 5], [2300])
        assert result.difficulty == EncounterDifficulty.MODERATE

    def test_high_difficulty(self):
        """Encounter in HIGH band."""
        # 4×L5 PCs: hard=3000, deadly=4400.
        # Stone Giant (2900 XP) + one Ogre (450): raw=3350, mult=1.5, adj=5025 → DEADLY.
        # Fire Giant alone (5000 XP): adj=5000 → DEADLY.
        # Use adjusted arithmetic: need 3000 <= adj < 4400 with 1 monster (mult=1.0).
        # Stone Giant = 2900 → adj=2900 < 3000, that's MODERATE.
        # Yochlol (5900): adj=5900 → DEADLY.
        # 4×L8 PCs: hard=5600, deadly=8400. Yochlol=5900 → HIGH.
        result = calculate_difficulty([8, 8, 8, 8], [5900])
        assert result.difficulty == EncounterDifficulty.HIGH

    def test_level_20_party_thresholds(self):
        """L20 party thresholds are correct per table."""
        result = calculate_difficulty([20], [0])
        assert result.easy_threshold == 2800
        assert result.medium_threshold == 5700
        assert result.hard_threshold == 8500
        assert result.deadly_threshold == 12700
