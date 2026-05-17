# Plan 00032 — Pure 2024 Encounter Math

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-17
**Last updated:** 2026-05-17

---

## Purpose

QuestLab was using 2014-style encounter math (per-PC thresholds with an
Easy/Medium/Hard/Deadly column, plus a monster-count multiplier) while
claiming "2024 rules" everywhere. The 2024 DMG actually:

- Uses three tiers: **Low / Moderate / High** (no per-PC Deadly column).
- Has **no count multiplier**. Raw monster XP is compared directly to
  the party's summed threshold.
- Has different per-PC threshold *values* than 2014.

This plan fixes the math, the AI prompt, the safety net, the UI labels,
and the tests to be genuinely 2024.

---

## Progress

- [x] Step 1: Replace `_PC_THRESHOLDS` with verified 2024 values; rename
  keys easy/medium/hard → low/moderate/high — 2026-05-17
- [x] Step 2: Drop `_monster_count_multiplier` from the math; set
  `adjusted_xp = raw_xp` and `multiplier = 1.0` for back-compat — 2026-05-17
- [x] Step 3: Keep `EncounterDifficulty.DEADLY` as an informal label at
  1.5× High — not 2024 RAW but useful as a UI affordance — 2026-05-17
- [x] Step 4: Refactor `_build_ai_budget` + `_trim_overbudget_suggestions`
  to use raw XP directly — 2026-05-17
- [x] Step 5: Simplify the AI prompt — drop multiplier discussion — 2026-05-17
- [x] Step 6: Frontend: rename `easy_threshold` → `low_threshold`,
  drop "(adj.)" label, show raw XP — 2026-05-17
- [x] Step 7: Rewrite `test_encounter_math.py` for 2024; update
  `test_encounter_builder.py` and `test_encounter_service.py` thresholds
  and XP expectations — 2026-05-17
- [x] Step 8: Quality gate — pytest 533✓, frontend prod build clean,
  black/isort/flake8/interrogate 96.4% — 2026-05-17

---

## 2024 DMG XP-Budget table (per PC, by level)

| Lvl | Low | Mod | High |
|---:|---:|---:|---:|
| 1 | 50 | 75 | 100 |
| 2 | 100 | 150 | 200 |
| 3 | 150 | 225 | 400 |
| 4 | 250 | 375 | 500 |
| 5 | 500 | 750 | 1100 |
| 6 | 600 | 1000 | 1400 |
| 7 | 750 | 1300 | 1700 |
| 8 | 1000 | 1700 | 2100 |
| 9 | 1300 | 2000 | 2600 |
| 10 | 1600 | 2300 | 3100 |
| 11 | 1900 | 2900 | 4100 |
| 12 | 2200 | 3700 | 4700 |
| 13 | 2600 | 4200 | 5400 |
| 14 | 2900 | 4900 | 6200 |
| 15 | 3300 | 5400 | 7800 |
| 16 | 3800 | 6100 | 9800 |
| 17 | 4500 | 7200 | 11700 |
| 18 | 5000 | 8700 | 14200 |
| 19 | 5500 | 10700 | 17200 |
| 20 | 6400 | 13200 | 22000 |

Threshold for the party = sum of each PC's threshold for that tier.
Encounter classification: raw monster XP ≥ tier threshold → that tier.
Informal Deadly line = 1.5 × High.

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-17 | Multiplier | Keep 2014-style, drop entirely | Drop | The 2024 DMG explicitly removed it. We were misrepresenting the rules. |
| 2026-05-17 | "Deadly" tier | Drop / keep informal / rename | Keep informal | The 2024 DMG has no Deadly tier, but the meter benefits from showing "this could TPK them" visually. Implemented as 1.5× High and labeled in the result struct as `deadly_threshold` (not RAW). |
| 2026-05-17 | Back-compat | Break / rename fields | Soft-deprecate | `EncounterDifficultyResult.easy_threshold` etc. are now properties that alias the new names. `adjusted_xp` and `multiplier` are kept on the response so old encounter rows don't break. |

---

## Outcomes and Retrospective

**Shipped 2026-05-17:**

Backend
- `integrations/dnd_rules/encounter_math.py` — rewritten to 2024 RAW.
  `_PC_THRESHOLDS` now uses verified 2024 numbers with `low/moderate/
  high` keys. `_monster_count_multiplier` removed.
  `calculate_difficulty` returns `adjusted_xp = raw_xp` and
  `multiplier = 1.0` for back-compat. New `EncounterDifficultyResult`
  fields `low_threshold`, `moderate_threshold`, `high_threshold`;
  properties `easy_threshold` / `medium_threshold` / `hard_threshold`
  alias them for 2014-era callers.
- `services/encounter_service` — `_build_ai_budget` returns the raw-XP
  band directly (no multiplier division). `_trim_overbudget_suggestions`
  compares raw totals to the band's upper bound.
- `services/ai_service.suggest_themed_monsters` — prompt simplified.
  No multiplier table, no "before responding multiply by X" math.
  System message explicitly says "2024 rules have NO encounter multiplier".
- `preview_difficulty` API response renamed `easy_threshold` →
  `low_threshold`. Kept `adjusted_xp` and `multiplier` for back-compat.

Frontend
- `DifficultyPreview` type: `low_threshold` replaces `easy_threshold`.
- `DifficultyMeter` reads `raw_xp` (= adjusted under 2024) and the new
  threshold field; dropped the "(adj.)" suffix that confused the math.

Tests
- `test_encounter_math.py` rewritten end-to-end. New tests cover the
  2024 thresholds at L1/L3/L5/L20, all four band classifications,
  band-boundary inclusivity, mixed-level threshold summing, and the
  back-compat alias properties.
- `test_encounter_builder.py` — updated overshoot test to use 2024
  band boundaries (10 ghouls = 2000 raw → trim to ≤ 8 = 1600 boundary).
- `test_encounter_service.py` — updated one xp_budget assertion (4
  goblins now scores 200 raw, not 400 adjusted).
- Full suite **533 ✓**.

**Surprises:** none. The biggest annoyance was that the 2014 numbers
were extensively assumed in tests; rewriting was straightforward but
touched many assertion expectations.

**Tech debt:** `easy_threshold`, `medium_threshold`, `hard_threshold`,
`adjusted_xp`, `multiplier` are all soft-deprecated aliases now. They
should be removed in a future cleanup once we're certain no caller
depends on them.