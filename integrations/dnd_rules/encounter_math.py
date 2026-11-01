"""D&D 5e encounter difficulty calculator: the 2024 rules and the 2014 rules (Plan 131).

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

A campaign on the 2014 rules (Plan 131) uses the 2014 Dungeon Master's Guide
method instead (``calculate_difficulty(..., ruleset="2014")``):

  1. Sum each PC's per-level Easy / Medium / Hard / Deadly thresholds.
  2. Multiply the monsters' raw XP by a multiplier for how many there are
     (x1 for 1, x1.5 for 2, x2 for 3-6, x2.5 for 7-10, x3 for 11-14,
     x4 for 15+), one step up for a party of fewer than 3 characters and one
     step down for 6 or more.
  3. Compare that adjusted XP with the four thresholds.

The 2014 bands are stored in the same four ``EncounterDifficulty`` values
(Easy -> LOW, Medium -> MODERATE, Hard -> HIGH, Deadly -> DEADLY); the UI
names them per ruleset. ``EncounterDifficultyResult.label`` gives the
edition's own word, including "Trivial" for a 2014 fight under Easy.
"""

from dataclasses import dataclass

from domain.enums import EncounterDifficulty
from integrations.dnd_rules import rulesets

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
# Plan 131 — per-PC XP thresholds by level, 2014 DMG:
# (easy, medium, hard, deadly). Index 0 = level 1.
# ---------------------------------------------------------------------------
_PC_THRESHOLDS_2014: list[tuple[int, int, int, int]] = [
    (25, 50, 75, 100),  # 1
    (50, 100, 150, 200),  # 2
    (75, 150, 225, 400),  # 3
    (125, 250, 375, 500),  # 4
    (250, 500, 750, 1100),  # 5
    (300, 600, 900, 1400),  # 6
    (350, 750, 1100, 1700),  # 7
    (450, 900, 1400, 2100),  # 8
    (550, 1100, 1600, 2400),  # 9
    (600, 1200, 1900, 2800),  # 10
    (800, 1600, 2400, 3600),  # 11
    (1000, 2000, 3000, 4500),  # 12
    (1100, 2200, 3400, 5100),  # 13
    (1250, 2500, 3800, 5700),  # 14
    (1400, 2800, 4300, 6400),  # 15
    (1600, 3200, 4800, 7200),  # 16
    (2000, 3900, 5900, 8800),  # 17
    (2100, 4200, 6300, 9500),  # 18
    (2400, 4900, 7300, 10900),  # 19
    (2800, 5700, 8500, 12700),  # 20
]

# The 2014 encounter multipliers in order. The middle six are the table
# (1 monster .. 15+); the ends are the party-size shifts (x0.5 for one monster
# against 6+ PCs, x5 for 15+ monsters against fewer than 3).
_MULTIPLIER_LADDER_2014: tuple[float, ...] = (0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0)

# The 2014 word for each stored band (the 2024 words are the enum values).
_LABELS_2014: dict[EncounterDifficulty, str] = {
    EncounterDifficulty.LOW: "Easy",
    EncounterDifficulty.MODERATE: "Medium",
    EncounterDifficulty.HIGH: "Hard",
    EncounterDifficulty.DEADLY: "Deadly",
}

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
    # Plan 131 — which rules worked this out ("2024" or "2014").
    ruleset: str = rulesets.R2024

    @property
    def label(self) -> str:
        """The band in the edition's own words.

        2024: Low / Moderate / High / Deadly. 2014: Easy / Medium / Hard /
        Deadly, or "Trivial" when the adjusted XP is under the Easy threshold.
        """
        if self.ruleset != rulesets.R2014:
            return self.difficulty.value
        if self.adjusted_xp < self.low_threshold:
            return "Trivial"
        return _LABELS_2014[self.difficulty]

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


def _check_levels(pc_levels: list[int]) -> None:
    """Raise ValueError for any PC level outside 1–20."""
    for lvl in pc_levels:
        if not 1 <= lvl <= 20:
            raise ValueError(f"PC level must be 1–20, got {lvl}")


def encounter_multiplier_2014(monster_count: int, party_size: int) -> float:
    """The 2014 DMG encounter multiplier for a number of monsters (Plan 131).

    x1 for 1 monster, x1.5 for 2, x2 for 3–6, x2.5 for 7–10, x3 for 11–14,
    x4 for 15 or more. A party of fewer than 3 characters uses the next
    multiplier up; a party of 6 or more uses the next one down.

    Args:
        monster_count: How many monsters are in the fight.
        party_size: How many player characters face them.

    Returns:
        The multiplier (1.0 when there are no monsters).
    """
    if monster_count <= 0:
        return 1.0
    if monster_count == 1:
        step = 1
    elif monster_count == 2:
        step = 2
    elif monster_count <= 6:
        step = 3
    elif monster_count <= 10:
        step = 4
    elif monster_count <= 14:
        step = 5
    else:
        step = 6
    if party_size < 3:
        step += 1
    elif party_size >= 6:
        step -= 1
    return _MULTIPLIER_LADDER_2014[step]


def calculate_difficulty_2014(
    pc_levels: list[int],
    monster_xp_values: list[int],
) -> EncounterDifficultyResult:
    """Calculate encounter difficulty the 2014 DMG way (Plan 131).

    Adjusted XP (raw XP x the monster-count multiplier) against the party's
    summed Easy / Medium / Hard / Deadly thresholds. The bands are stored as
    LOW / MODERATE / HIGH / DEADLY; anything under Medium (Easy, or below it)
    is LOW.

    Args:
        pc_levels: List of PC levels (one entry per PC, 1–20).
        monster_xp_values: XP of each individual monster (repeat entries
            for multiple copies of the same monster).

    Returns:
        EncounterDifficultyResult with ``ruleset="2014"``; the low / moderate /
        high / deadly thresholds hold Easy / Medium / Hard / Deadly.

    Raises:
        ValueError: If any PC level is out of range 1–20.
    """
    _check_levels(pc_levels)
    easy_t = sum(_PC_THRESHOLDS_2014[lvl - 1][0] for lvl in pc_levels)
    medium_t = sum(_PC_THRESHOLDS_2014[lvl - 1][1] for lvl in pc_levels)
    hard_t = sum(_PC_THRESHOLDS_2014[lvl - 1][2] for lvl in pc_levels)
    deadly_t = sum(_PC_THRESHOLDS_2014[lvl - 1][3] for lvl in pc_levels)

    raw_xp = sum(monster_xp_values)
    multiplier = encounter_multiplier_2014(len(monster_xp_values), len(pc_levels))
    adjusted_xp = int(raw_xp * multiplier)

    if deadly_t > 0 and adjusted_xp >= deadly_t:
        difficulty = EncounterDifficulty.DEADLY
    elif hard_t > 0 and adjusted_xp >= hard_t:
        difficulty = EncounterDifficulty.HIGH
    elif medium_t > 0 and adjusted_xp >= medium_t:
        difficulty = EncounterDifficulty.MODERATE
    else:
        difficulty = EncounterDifficulty.LOW

    return EncounterDifficultyResult(
        raw_xp=raw_xp,
        adjusted_xp=adjusted_xp,
        multiplier=multiplier,
        low_threshold=easy_t,
        moderate_threshold=medium_t,
        high_threshold=hard_t,
        deadly_threshold=deadly_t,
        difficulty=difficulty,
        ruleset=rulesets.R2014,
    )


def calculate_difficulty(
    pc_levels: list[int],
    monster_xp_values: list[int],
    ruleset: object = None,
) -> EncounterDifficultyResult:
    """Calculate encounter difficulty using the 2024 DMG XP-budget method.

    2024 RAW: no monster-count multiplier. Sum raw monster XP, compare
    to the party's Low / Moderate / High thresholds. A 2014 campaign
    (Plan 131) goes to ``calculate_difficulty_2014`` instead.

    Args:
        pc_levels: List of PC levels (one entry per PC, 1–20).
        monster_xp_values: List of XP values for each individual monster
            (repeat entries for multiple copies of the same monster).
        ruleset: The campaign's ruleset: "2024", "2014", a Ruleset, or None
            (None means 2024).

    Returns:
        EncounterDifficultyResult with full breakdown.

    Raises:
        ValueError: If any PC level is out of range 1–20.
    """
    if rulesets.is_2014(ruleset):
        return calculate_difficulty_2014(pc_levels, monster_xp_values)
    _check_levels(pc_levels)

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
