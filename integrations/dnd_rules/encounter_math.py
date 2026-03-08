"""2024 D&D 5e encounter difficulty calculator.

Uses the XP budget method from the 2024 Dungeon Master's Guide:
  1. Sum per-PC XP thresholds for chosen difficulty tier.
  2. Total raw XP from all monsters in the roster.
  3. Apply a monster-count multiplier to adjusted XP.
  4. Compare adjusted XP to the summed threshold to determine difficulty.
"""

from dataclasses import dataclass

from domain.enums import EncounterDifficulty

# ---------------------------------------------------------------------------
# Per-PC XP thresholds by level (2024 DMG)
# Index 0 = level 1, index 19 = level 20
# ---------------------------------------------------------------------------
_PC_THRESHOLDS: list[dict[str, int]] = [
    {"easy": 25, "medium": 50, "hard": 75, "deadly": 100},  # 1
    {"easy": 50, "medium": 100, "hard": 150, "deadly": 200},  # 2
    {"easy": 75, "medium": 150, "hard": 225, "deadly": 400},  # 3
    {"easy": 125, "medium": 250, "hard": 375, "deadly": 500},  # 4
    {"easy": 250, "medium": 500, "hard": 750, "deadly": 1100},  # 5
    {"easy": 300, "medium": 600, "hard": 900, "deadly": 1400},  # 6
    {"easy": 350, "medium": 750, "hard": 1100, "deadly": 1700},  # 7
    {"easy": 450, "medium": 900, "hard": 1400, "deadly": 2100},  # 8
    {"easy": 550, "medium": 1100, "hard": 1600, "deadly": 2400},  # 9
    {"easy": 600, "medium": 1200, "hard": 1900, "deadly": 2800},  # 10
    {"easy": 800, "medium": 1600, "hard": 2400, "deadly": 3600},  # 11
    {"easy": 1000, "medium": 2000, "hard": 3000, "deadly": 4500},  # 12
    {"easy": 1100, "medium": 2200, "hard": 3400, "deadly": 5100},  # 13
    {"easy": 1250, "medium": 2500, "hard": 3800, "deadly": 5700},  # 14
    {"easy": 1400, "medium": 2800, "hard": 4300, "deadly": 6400},  # 15
    {"easy": 1600, "medium": 3200, "hard": 4800, "deadly": 7200},  # 16
    {"easy": 2000, "medium": 3900, "hard": 5900, "deadly": 8800},  # 17
    {"easy": 2100, "medium": 4200, "hard": 6300, "deadly": 9500},  # 18
    {"easy": 2400, "medium": 4900, "hard": 7300, "deadly": 10900},  # 19
    {"easy": 2800, "medium": 5700, "hard": 8500, "deadly": 12700},  # 20
]

# ---------------------------------------------------------------------------
# CR → XP table (2024 DMG / SRD 5.1)
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


def _monster_count_multiplier(total_monsters: int) -> float:
    """Return the XP multiplier for the total number of monsters.

    Args:
        total_monsters: Sum of all monster counts in the encounter.

    Returns:
        Multiplier float per the 2024 DMG encounter budget rules.
    """
    if total_monsters <= 0:
        return 1.0
    if total_monsters == 1:
        return 1.0
    if total_monsters == 2:
        return 1.5
    if total_monsters <= 6:
        return 2.0
    if total_monsters <= 10:
        return 2.5
    if total_monsters <= 14:
        return 3.0
    return 4.0


@dataclass
class EncounterDifficultyResult:
    """Result of an encounter difficulty calculation.

    Attributes:
        raw_xp: Sum of base XP values for all monsters (before multiplier).
        adjusted_xp: raw_xp × monster-count multiplier.
        multiplier: The multiplier that was applied.
        easy_threshold: Summed easy XP threshold for the party.
        medium_threshold: Summed medium XP threshold for the party.
        hard_threshold: Summed hard XP threshold for the party.
        deadly_threshold: Summed deadly XP threshold for the party.
        difficulty: Computed EncounterDifficulty enum value.
    """

    raw_xp: int
    adjusted_xp: int
    multiplier: float
    easy_threshold: int
    medium_threshold: int
    hard_threshold: int
    deadly_threshold: int
    difficulty: EncounterDifficulty


def calculate_difficulty(
    pc_levels: list[int],
    monster_xp_values: list[int],
) -> EncounterDifficultyResult:
    """Calculate encounter difficulty using the 2024 DMG XP budget method.

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

    # Summed party thresholds
    easy_t = sum(_PC_THRESHOLDS[lvl - 1]["easy"] for lvl in pc_levels)
    medium_t = sum(_PC_THRESHOLDS[lvl - 1]["medium"] for lvl in pc_levels)
    hard_t = sum(_PC_THRESHOLDS[lvl - 1]["hard"] for lvl in pc_levels)
    deadly_t = sum(_PC_THRESHOLDS[lvl - 1]["deadly"] for lvl in pc_levels)

    raw_xp = sum(monster_xp_values)
    multiplier = _monster_count_multiplier(len(monster_xp_values))
    adjusted_xp = int(raw_xp * multiplier)

    if adjusted_xp >= deadly_t:
        difficulty = EncounterDifficulty.DEADLY
    elif adjusted_xp >= hard_t:
        difficulty = EncounterDifficulty.HIGH
    elif adjusted_xp >= medium_t:
        difficulty = EncounterDifficulty.MODERATE
    else:
        # Includes trivial (below easy threshold) — map to LOW
        difficulty = EncounterDifficulty.LOW

    return EncounterDifficultyResult(
        raw_xp=raw_xp,
        adjusted_xp=adjusted_xp,
        multiplier=multiplier,
        easy_threshold=easy_t,
        medium_threshold=medium_t,
        hard_threshold=hard_t,
        deadly_threshold=deadly_t,
        difficulty=difficulty,
    )
