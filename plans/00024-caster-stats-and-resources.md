# Plan 00024 — Caster Stats, Hit Dice, Exhaustion, Currency

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-14
**Last updated:** 2026-05-14
**Implemented by:** Claude (Roll20-killer — table-state polish 7b/8)

---

## Purpose

Four more game-night-critical things the previous build silently dropped:

1. **Spell save DC + spell attack bonus** — computed, never stored. The two
   numbers casters quote constantly. `8 + prof + spellcasting_mod` and
   `prof + spellcasting_mod`.
2. **Hit Dice** — short-rest healing currency. Each PC has `level` total HD
   of class-determined size; you spend them during a short rest to roll +
   CON mod for HP. Long rest recovers half (min 1).
3. **Exhaustion (2024)** — 0–6 scale, each level applies a cumulative −2
   penalty to all D20 Tests (attack rolls, ability checks, saves). Level 6
   = dead. Long rest removes 1 level.
4. **Currency** — copper / silver / electrum / gold / platinum. Persistent
   per PC; treasure handouts touch this directly.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-14
- [x] Step 2: Domain — 7 new columns + schema updates — 2026-05-14
- [x] Step 3: Migration 0014 + DuckDB patch — 2026-05-14
- [x] Step 4: Spellcasting stats service + endpoint — 2026-05-14
- [x] Step 5: Hit Dice spend service + long-rest recovery + endpoint — 2026-05-14
- [x] Step 6: Long rest reduces exhaustion by 1 (2024 RAW) — 2026-05-14
- [x] Step 7: Backend tests (23 new tests, full suite 480✓) — 2026-05-14
- [x] Step 8: Frontend — spellcasting line on sheet, HitDiceTracker, ExhaustionTracker, CurrencyBar — 2026-05-14
- [x] Step 9: HUD party panel — exhaustion badge — 2026-05-14
- [x] Step 10: Quality gate green — pytest 480✓, black/isort/flake8/interrogate 96.7% — 2026-05-14

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-14 | Spellcasting stats storage | (a) Compute + cache, (b) Compute on read | (b) | Derived from class + level + ability score, all already on PC. Caching adds invalidation burden for zero perf gain. |
| 2026-05-14 | Hit Dice die-size source | (a) Stored per-PC, (b) Lookup table by class | (b) | Class fully determines HD size in RAW. Multiclassing isn't supported in this build, so a single-class table is exact. |
| 2026-05-14 | HD spend mechanic | (a) Auto-roll + apply healing, (b) "Spent" counter only | (b) | Real-die play — player rolls the HD, tells the DM, DM clicks heal. Match the Plan 23 philosophy. |
| 2026-05-14 | Exhaustion D20 Test modifier | Apply server-side or display only | Display only | Modifier is visible context; players adjust their own rolls in RollHelper. Cleaner than tangling exhaustion into every bonus computation. |
| 2026-05-14 | Currency UI | One row of inputs vs. five separate forms | One compact row | The DM almost always edits one denomination at a time; flat row + per-field +/− is the fastest interaction. |

---

## Context and Orientation

### Files touched

**Backend:**
- `domain/character.py` — 7 new columns: `hit_dice_spent`, `exhaustion`, `cp`, `sp`, `ep`, `gp`, `pp`
- `services/character_service.py` — `hit_die_for(class)`, `spell_save_dc(pc)`, `spell_attack_bonus(pc)`, `spend_hit_dice(pc, n)`
- `services/rest_service.py` — long-rest hook: regain `max(1, level // 2)` HD and reduce exhaustion by 1
- `alembic/versions/0014_caster_stats_and_resources.py`
- `db/base.py` — DuckDB patches
- `api/routers/characters.py` — `GET /characters/{id}/spellcasting-stats`, `POST /characters/{id}/spend-hit-dice`
- `tests/test_services/test_caster_stats.py` (new)

**Frontend:**
- `frontend/src/api/types.ts` — extend PlayerCharacter + new SpellcastingStats type
- `frontend/src/api/characters.ts` — `spellcastingStats`, `spendHitDice` calls
- `frontend/src/components/character-sheet/CharacterSheet.tsx` — add caster line, HitDice panel, Exhaustion panel, Currency panel
- `frontend/src/components/character-sheet/HitDiceTracker.tsx` (new)
- `frontend/src/components/character-sheet/ExhaustionTracker.tsx` (new)
- `frontend/src/components/character-sheet/CurrencyBar.tsx` (new)
- `frontend/src/pages/SessionHud.tsx` — exhaustion badge in party panel

### Key terms defined
- **Spellcasting ability** — INT for Wizard/Artificer; WIS for Cleric/Druid/Ranger; CHA for Bard/Paladin/Sorcerer/Warlock. Non-casters: None.
- **Hit Die size** — d6 (Sorcerer/Wizard), d8 (Artificer/Bard/Cleric/Druid/Monk/Rogue/Warlock), d10 (Fighter/Paladin/Ranger), d12 (Barbarian).
- **D20 Test** — 2024 RAW umbrella term for attack rolls, ability checks, and saving throws. Exhaustion penalty applies to all.

---

## Validation and Acceptance

- [ ] `pytest -q` passes
- [ ] Caster sheet header shows DC and attack bonus
- [ ] Non-caster sheet header omits the line
- [ ] Hit Dice pips clickable to spend
- [ ] Long rest restores `max(1, level // 2)` HD
- [ ] Exhaustion 0..6 dot chain editable
- [ ] Long rest drops exhaustion by 1 (floor 0)
- [ ] Currency edits round-trip
- [ ] HUD exhaustion badge shows when > 0

---

## Outcomes and Retrospective

**What shipped (2026-05-14):**

Backend
- `PlayerCharacter` gains 7 persistent columns: `hit_dice_spent`, `exhaustion`, `cp`, `sp`, `ep`, `gp`, `pp`. Migration 0014 + DuckDB patch.
- `spellcasting_stats(pc)` — derives ability / save DC / attack bonus from class + level + ability score. Returns `{ability: None, ...}` for non-casters.
- `hit_die_for(class)` — d6 / d8 / d10 / d12 lookup.
- `spend_hit_dice(pc, n)` — bumps the spent counter; raises on overflow.
- Long rest now also: regains `max(1, level // 2)` HD and reduces exhaustion by one (2024 RAW).
- Endpoints: `GET /characters/{id}/spellcasting-stats`, `POST /characters/{id}/spend-hit-dice`.
- 23 new tests; full backend suite 480✓.

Frontend
- Caster line on the sheet showing Ability / Save DC / Attack bonus (hidden for non-casters).
- `HitDiceTracker`: pip chain (one per level), click an available pip to spend; instructions reminding the player to roll d{N}+CON and Heal.
- `ExhaustionTracker`: 0–6 dot chain with cumulative −2 penalty label; level 6 = DEAD; click to set.
- `CurrencyBar`: 5-cell row (pp / gp / ep / sp / cp) with inline editing, commit on blur or Enter.
- HUD party panel: 😵 N badge added to the Plan 23 status row when exhaustion > 0.

**Surprises:** none. The architecture from Plan 21 (rest hooks) and Plan 23 (service mutation pattern) made everything land where expected.

**Tech debt:** none added.
