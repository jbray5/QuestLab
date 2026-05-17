"""2024 D&D 5e encounter difficulty calculator.

Uses the simplified XP budget method from the 2024 Dungeon Master's Guide:

  1. Sum each PC's per-level XP threshold for the three difficulty tiers.
  2. Sum the raw XP of every monster in the roster.
  3. Compare raw monster XP directly to the party threshold — no count
     multiplier. The 2024 DMG deliberately removed the 2014 multiplier
     table; encounters are measured in raw XP only.

"Deadly" is no longer an official 2024 tier — but we expose a soft
threshold at 1.5× High so the UI can flag encounters that may TPK the
party. ``EncounterDifficulty.DEADLY`` is retained as an informal label
for that case to avoid breaking existing DB rows.

The ``EncounterDifficultyResult`` keeps a ``multiplier`` field (=1.0
in 2024) and an ``adjusted_xp`` field (=raw_xp in 2024) for backward
compatibility with stored encounter rows.
"""

from dataclasses import dataclass

from domain.enums import EncounterDifficulty

# ---------------------------------------------------------------------------
# Per-PC XP thresholds by level — 2024 DMG XP-Budget table.
# Index 0 = level 1, index 19 = level 20.
# 2024 uses three tiers: Low / Moderate / High (no per-PC Deadly column).
# Values verified against the published 2024 DMG.
# ---------------------------------------------------------------------------
_PC_THRESHOLDS: list[dict[str, int]] = [
    {"low": 50, "moderate": 75, "high": 100},  # 1
    {"low": 100, "moderate": 150, "high": 200},  # 2
    {"low": 150, "moderate": 225, "high": 400},  # 3
    {"low": 250, "moderate": 375, "high": 500},  # 4
    {"low": 500, "moderate": 750, "high": 1100},  # 5
    {"low": 600, "moderate": 1000, "high": 1400},  # 6
    {"low": 750, "moderate": 1300, "high": 1700},  # 7
    {"low": 1000, "moderate": 1700, "high": 2100},  # 8
    {"low": 1300, "moderate": 2000, "high": 2600},  # 9
    {"low": 1600, "moderate": 2300, "high": 3100},  # 10
    {"low": 1900, "moderate": 2900, "high": 4100},  # 11
    {"low": 2200, "moderate": 3700, "high": 4700},  # 12
    {"low": 2600, "moderate": 4200, "high": 5400},  # 13
    {"low": 2900, "moderate": 4900, "high": 6200},  # 14
    {"low": 3300, "moderate": 5400, "high": 7800},  # 15
    {"low": 3800, "moderate": 6100, "high": 9800},  # 16
    {"low": 4500, "moderate": 7200, "high": 11700},  # 17
    {"low": 5000, "moderate": 8700, "high": 14200},  # 18
    {"low": 5500, "moderate": 10700, "high": 17200},  # 19
    {"low": 6400, "moderate": 13200, "high": 22000},  # 20
]

# Soft "Deadly" multiplier — applied to the High threshold to surface
# encounters that meaningfully exceed the High budget. Not a 2024 RAW
# concept; this is purely a UI affordance.
_DEADLY_OVERRUN_RATIO = 1.5

# ---------------------------------------------------------------------------
# CR → XP table (2024 DMG / SRD 5.1) — unchanged from 2014.
# ---------------------------------------------------------------------------
CR_TO_XP: dict[str, int] = {
    "0": 10,
    "1/8": 25,
    "1/4": 50,
    "1/2": 100,
    "1": 200,
    "2": 450,
    "3": 700,
    "4": 1100,
    "5": 1800,
    "6": 2300,
    "7": 2900,
    "8": 3900,
    "9": 5000,
    "10": 5900,
    "11": 7200,
    "12": 8400,
    "13": 10000,
    "14": 11500,
    "15": 13000,
    "16": 15000,
    "17": 18000,
    "18": 20000,
    "19": 22000,
    "20": 25000,
    "21": 33000,
    "22": 41000,
    "23": 50000,
    "24": 62000,
    "25": 75000,
    "26": 90000,
    "27": 105000,
    "28": 120000,
    "29": 135000,
    "30": 155000,
}


def cr_to_xp(challenge_rating: str) -> int:
    """Return the XP value for a given challenge rating string.

    Args:
        challenge_rating: CR string such as '1/4', '5', or '17'.

    Returns:
        XP value for that CR.

    Raises:
        ValueError: If the CR string is not recognised.
    """
    if challenge_rating not in CR_TO_XP:
        raise ValueError(f"Unknown challenge rating: {challenge_rating!r}")
    return CR_TO_XP[challenge_rating]


@dataclass
class EncounterDifficultyResult:
    """Result of an encounter difficulty calculation.

    Attributes:
        raw_xp: Sum of base XP values for all monsters.
        adjusted_xp: 2014-compat alias of ``raw_xp`` (2024 has no multiplier).
        multiplier: Always ``1.0`` under 2024 rules; kept for back-compat.
        low_threshold: Summed Low XP threshold for the party.
        moderate_threshold: Summed Moderate XP threshold for the party.
        high_threshold: Summed High XP threshold for the party.
        deadly_threshold: Informal "way above budget" line at
            ``high_threshold * 1.5`` — for UI use only, not RAW.
        difficulty: Computed EncounterDifficulty enum value.
    """

    raw_xp: int
    adjusted_xp: int
    multiplier: float
    low_threshold: int
    moderate_threshold: int
    high_threshold: int
    deadly_threshold: int
    difficulty: EncounterDifficulty

    # ── Back-compat aliases (2014 naming) ──────────────────────────────
    @property
    def easy_threshold(self) -> int:
        """2014-era alias for ``low_threshold`` (renamed in 2024 DMG)."""
        return self.low_threshold

    @property
    def medium_threshold(self) -> int:
        """2014-era alias for ``moderate_threshold``."""
        return self.moderate_threshold

    @property
    def hard_threshold(self) -> int:
        """2014-era alias for ``high_threshold``."""
        return self.high_threshold


def calculate_difficulty(
    pc_levels: list[int],
    monster_xp_values: list[int],
) -> EncounterDifficultyResult:
    """Calculate encounter difficulty using the 2024 DMG XP-budget method.

    2024 RAW: no monster-count multiplier. Sum raw monster XP, compare
    to the party's Low / Moderate / High thresholds.

    Args:
        pc_levels: List of PC levels (one entry per PC, 1–20).
        monster_xp_values: List of XP values for each individual monster
            (repeat entries for multiple copies of the same monster).

    Returns:
        EncounterDifficultyResult with full breakdown.

    Raises:
        ValueError: If any PC level is out of range 1–20.
    """
    for lvl in pc_levels:
        if not 1 <= lvl <= 20:
            raise ValueError(f"PC level must be 1–20, got {lvl}")

    low_t = sum(_PC_THRESHOLDS[lvl - 1]["low"] for lvl in pc_levels)
    moderate_t = sum(_PC_THRESHOLDS[lvl - 1]["moderate"] for lvl in pc_levels)
    high_t = sum(_PC_THRESHOLDS[lvl - 1]["high"] for lvl in pc_levels)
    deadly_t = int(high_t * _DEADLY_OVERRUN_RATIO)

    raw_xp = sum(monster_xp_values)

    if high_t > 0 and raw_xp >= deadly_t:
        difficulty = EncounterDifficulty.DEADLY
    elif raw_xp >= high_t:
        difficulty = EncounterDifficulty.HIGH
    elif raw_xp >= moderate_t:
        difficulty = EncounterDifficulty.MODERATE
    else:
        # Below Moderate, including below Low and zero-monster encounters.
        difficulty = EncounterDifficulty.LOW

    return EncounterDifficultyResult(
        raw_xp=raw_xp,
        adjusted_xp=raw_xp,  # 2024: no multiplier
        multiplier=1.0,
        low_threshold=low_t,
        moderate_threshold=moderate_t,
        high_threshold=high_t,
        deadly_threshold=deadly_t,
        difficulty=difficulty,
    )
