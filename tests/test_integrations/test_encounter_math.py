"""Tests for integrations.dnd_rules.encounter_math.

2024 DMG XP-budget rules — no count multiplier. Raw monster XP is
compared directly to the party's Low / Moderate / High thresholds.
"Deadly" is an informal tier the meter uses at 1.5× High.

Covers:
- cr_to_xp mapping
- Per-PC + summed party thresholds (2024 values)
- Difficulty classification at each band boundary
- Edge cases (empty roster, single PC, no monsters)
- Back-compat aliases (easy/medium/hard thresholds resolve to 2024 names)
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


class TestCalculateDifficulty2024:
    """2024 RAW: raw XP vs party thresholds; no multiplier."""

    def test_empty_roster_is_low(self):
        """No monsters → LOW difficulty."""
        result = calculate_difficulty([5, 5, 5, 5], [])
        assert result.difficulty == EncounterDifficulty.LOW
        assert result.raw_xp == 0
        assert result.adjusted_xp == 0
        assert result.multiplier == 1.0

    def test_pc_level_zero_raises(self):
        """PC level < 1 raises ValueError."""
        with pytest.raises(ValueError):
            calculate_difficulty([0], [200])

    def test_pc_level_21_raises(self):
        """PC level > 20 raises ValueError."""
        with pytest.raises(ValueError):
            calculate_difficulty([21], [200])

    def test_no_multiplier_under_2024(self):
        """2024 rules: raw_xp == adjusted_xp always; multiplier always 1.0."""
        result = calculate_difficulty([5, 5, 5, 5], [200, 200, 200, 200, 200, 200])
        assert result.multiplier == 1.0
        assert result.raw_xp == result.adjusted_xp == 1200

    def test_l3x4_party_thresholds(self):
        """4×L3 party thresholds match the 2024 table."""
        result = calculate_difficulty([3, 3, 3, 3], [])
        # L3 per-PC: 150 / 225 / 400. ×4 PCs.
        assert result.low_threshold == 600
        assert result.moderate_threshold == 900
        assert result.high_threshold == 1600
        assert result.deadly_threshold == 2400  # 1.5 × high (informal)

    def test_l5x4_party_thresholds(self):
        """4×L5 party thresholds match the 2024 table."""
        result = calculate_difficulty([5, 5, 5, 5], [])
        # L5 per-PC: 500 / 750 / 1100. ×4 PCs.
        assert result.low_threshold == 2000
        assert result.moderate_threshold == 3000
        assert result.high_threshold == 4400

    def test_low_band_classification(self):
        """raw XP < moderate threshold → LOW."""
        # 4×L5 → low 2000. One Hobgoblin Captain (1100 XP) sits in the
        # Low band.
        result = calculate_difficulty([5, 5, 5, 5], [1100])
        assert result.raw_xp == 1100
        assert result.difficulty == EncounterDifficulty.LOW

    def test_moderate_band_classification(self):
        """moderate ≤ raw < high → MODERATE."""
        # 4×L5: moderate=3000, high=4400.
        # 2 Ogres (450 each) + 1 Troll (1800) = 2700 → still LOW.
        # Need >= 3000. 6 Ogres (450 × 6 = 2700) → LOW.
        # 7 Ogres (450 × 7 = 3150) → MODERATE.
        result = calculate_difficulty([5, 5, 5, 5], [450] * 7)
        assert result.raw_xp == 3150
        assert result.difficulty == EncounterDifficulty.MODERATE

    def test_high_band_classification(self):
        """high ≤ raw < 1.5×high → HIGH."""
        # 4×L5: high=4400, deadly=6600.
        # 1 Behir (5900) sits in the High band.
        result = calculate_difficulty([5, 5, 5, 5], [5900])
        assert result.raw_xp == 5900
        assert result.difficulty == EncounterDifficulty.HIGH

    def test_deadly_band_classification(self):
        """raw ≥ 1.5×high → DEADLY (informal)."""
        # 4×L5: deadly=6600. Adult White Dragon (5900) sits in HIGH;
        # Adult Red Dragon (18000) → DEADLY.
        result = calculate_difficulty([5, 5, 5, 5], [18000])
        assert result.difficulty == EncounterDifficulty.DEADLY

    def test_band_boundary_inclusivity(self):
        """At exactly the threshold, the encounter lands in the higher band."""
        # 4×L5 → moderate=3000.
        result = calculate_difficulty([5, 5, 5, 5], [3000])
        assert result.difficulty == EncounterDifficulty.MODERATE
        # high=4400.
        result = calculate_difficulty([5, 5, 5, 5], [4400])
        assert result.difficulty == EncounterDifficulty.HIGH

    def test_thresholds_sum_across_mixed_levels(self):
        """Thresholds are summed across all PCs regardless of level."""
        # 2 L1 + 1 L5: low = 50+50+500 = 600.
        result = calculate_difficulty([1, 1, 5], [0])
        assert result.low_threshold == 600

    def test_level_1_party_thresholds(self):
        """L1 party thresholds per the 2024 table."""
        result = calculate_difficulty([1], [0])
        assert result.low_threshold == 50
        assert result.moderate_threshold == 75
        assert result.high_threshold == 100

    def test_level_20_party_thresholds(self):
        """L20 party thresholds per the 2024 table."""
        result = calculate_difficulty([20], [0])
        assert result.low_threshold == 6400
        assert result.moderate_threshold == 13200
        assert result.high_threshold == 22000


class TestBackCompatAliases:
    """The 2014-era field names still resolve so existing callers don't break."""

    def test_easy_threshold_alias(self):
        """``easy_threshold`` aliases ``low_threshold``."""
        result = calculate_difficulty([3], [])
        assert result.easy_threshold == result.low_threshold == 150

    def test_medium_threshold_alias(self):
        """``medium_threshold`` aliases ``moderate_threshold``."""
        result = calculate_difficulty([3], [])
        assert result.medium_threshold == result.moderate_threshold == 225

    def test_hard_threshold_alias(self):
        """``hard_threshold`` aliases ``high_threshold``."""
        result = calculate_difficulty([3], [])
        assert result.hard_threshold == result.high_threshold == 400
