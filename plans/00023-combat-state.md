# Plan 00023 — Combat State (Death Saves, Inspiration, Concentration, Temp HP, Adv/Dis)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-14
**Last updated:** 2026-05-14
**Implemented by:** Claude (Roll20-killer — table-state polish 7a/8)

---

## Purpose

Game-night-critical PC state the current build silently drops. Each item is
something a DM forgets without a visible tracker.

1. **Temporary HP** — separate pool, depleted before real HP. Doesn't stack.
2. **Heroic Inspiration** (2024 rules) — boolean. Granted by DM; spent for
   advantage on one roll. 2024 grants it on any natural 20.
3. **Concentration** — free-text "Concentrating on: Bless" + a one-click
   "Roll CON save (DC max(10, half-damage))" prompt when the PC takes damage.
4. **Death saves** — 3 successes / 3 failures pips, auto-visible when
   ``hp_current == 0``. Nat 20 on the save brings PC back to 1 HP, nat 1 is
   2 failures.
5. **Advantage / Disadvantage** in the RollHelper — toggle that prompts for
   two d20 inputs and takes higher/lower.

Persistent so refresh / party rest / new session all do the right thing.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-14
- [x] Step 2: Domain: 5 new columns on `PlayerCharacter` + schema updates — 2026-05-14
- [x] Step 3: Migration 0013 + DuckDB patch — 2026-05-14
- [x] Step 4: Backend tests covering damage-with-temp-hp ordering + death-save resolution (18 tests) — 2026-05-14
- [x] Step 5: Frontend — extended character sheet header (Temp HP chip, Inspiration toggle, Concentration line with Drop/Roll-CON buttons + free-text starter) + DeathSaveTracker block that auto-shows at HP=0; HP damage/heal controls applying temp-hp waterfall server-side — 2026-05-14
- [x] Step 6: RollHelper — NORMAL/ADV/DIS toggle with dual-d20 inputs, takes higher/lower — 2026-05-14
- [x] Step 7: HUD party panel — compact 🛡 Temp / ✨ Insp / 🌀 Conc / 💀 Dying badges per PC — 2026-05-14
- [x] Step 8: Quality gate green — pytest 457✓, black/isort/flake8/interrogate clean — 2026-05-14

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-14 | Death save mechanics | (a) Auto-resolve on backend, (b) Manual pip toggles | (b) | DM controls the pace at the table; "auto-roll death saves" feels wrong with real dice. Player rolls a die, DM clicks success or failure. |
| 2026-05-14 | Concentration auto-prompt | (a) Server-side trigger, (b) UI surface only | (b) | Concentration check is a moment the DM calls. The UI shows "Concentrating on X" and offers a "Roll CON save (DC Y)" button. No magic. |
| 2026-05-14 | Temp HP ordering | (a) Service auto-subtracts from temp first, (b) Display only | (a) | Free correctness; players forget. ``apply_damage(pc, amount)`` is the right contract — service handles the temp→real waterfall. |
| 2026-05-14 | Heroic Inspiration scope | (a) Single boolean, (b) Counter (2024 lets you stack one) | (a) | RAW you only HAVE inspiration or not (no stacking). Simpler. |

---

## Context and Orientation

### Files touched

**Backend:**
- `domain/character.py` — add 5 columns + extend PlayerCharacterRead/Update; new `apply_damage` helper
- `services/character_service.py` — `apply_damage` (temp HP waterfall), `resolve_death_save` (success/fail + crit/fumble)
- `alembic/versions/0013_add_combat_state.py`
- `db/base.py` — DuckDB patch
- `api/routers/characters.py` — small endpoints for ergonomic state toggles
- `tests/test_services/test_combat_state.py` (new)

**Frontend:**
- `frontend/src/api/types.ts` — extend `PlayerCharacter` with new fields
- `frontend/src/components/character-sheet/CharacterSheet.tsx` — temp HP chip, inspiration chip, concentration line, conditional DeathSaveTracker
- `frontend/src/components/character-sheet/DeathSaveTracker.tsx` (new)
- `frontend/src/components/character-sheet/RollHelper.tsx` — adv/dis toggle + dual-d20 mode
- `frontend/src/pages/SessionHud.tsx` — small status icons per PC

### Key terms defined
- **Temp HP waterfall:** damage first reduces ``temp_hp`` to 0, then reduces ``hp_current``. Healing only restores ``hp_current``.
- **Dying:** HP = 0 and not stable. Death saves accrue. 3 successes = stable; 3 failures = dead.
- **Stable:** HP = 0 but no longer making death saves. Returns to consciousness after 1d4 hours OR with healing.

---

## Concrete Steps

### Step 2: Domain
```python
class PlayerCharacter(SQLModel, table=True):
    ...
    temp_hp: int = Field(default=0, ge=0)
    heroic_inspiration: bool = Field(default=False)
    # Free-text label of the spell/effect the PC is concentrating on
    # (None when nothing). DM/player flips this manually.
    concentration_on: Optional[str] = Field(default=None, max_length=120)
    # Death save tracker — 0–3 each. Auto-zeroed when hp_current > 0.
    death_save_successes: int = Field(default=0, ge=0, le=3)
    death_save_failures: int = Field(default=0, ge=0, le=3)
```

### Step 4: apply_damage helper

```python
def apply_damage(pc, amount):
    """Damage waterfall: temp HP first, then real HP. Returns new (temp, hp)."""
    if amount <= 0:
        return pc.temp_hp, pc.hp_current
    absorbed = min(pc.temp_hp, amount)
    pc.temp_hp -= absorbed
    remaining = amount - absorbed
    pc.hp_current = max(0, pc.hp_current - remaining)
    # Concentration check + auto-zero death saves when HP > 0 is handled by callers.
    return pc.temp_hp, pc.hp_current
```

### Step 5/6: UI surfaces (sketch)

Character sheet header chip row:
```
[HP 45/45] [TEMP +0] [AC 18] [SPEED 30 ft] [INSP ○] [INIT +0]
```

Concentration line below header when active:
```
🌀 Concentrating on: Bless     [Drop]  [Roll CON save (DC 10)]
```

When HP=0, sheet shows DeathSaveTracker between the header and the body:
```
💀 DYING — Make death saves
SUCCESSES ●●○     FAILURES ●○○
[Roll death save]  [Stable]  [Mark dead]
```

RollHelper adv/dis toggle (no real dice flow):
```
[NORMAL] [ADV] [DIS]
Your real d20 results: [12] [18]     ← two inputs when adv/dis
Total: 18 + 4 = 22      (takes higher on adv)
```

---

## Validation and Acceptance

- [ ] `pytest -q` passes
- [ ] PC at HP=0 → DeathSaveTracker appears
- [ ] Three success clicks → "Stable" auto-applied
- [ ] Three failure clicks → "Dead" overlay
- [ ] Adv toggle in RollHelper → two d20 inputs, total uses higher
- [ ] Concentration line shows when ``concentration_on`` is set
- [ ] Temp HP chip non-zero shows next to HP

---

## Outcomes and Retrospective

**What shipped (2026-05-14):**

Backend
- `PlayerCharacter` gains 5 columns: `temp_hp`, `heroic_inspiration`, `concentration_on`, `death_save_successes`, `death_save_failures`. All non-null with safe defaults.
- Three service helpers: `apply_damage` (temp-hp waterfall), `apply_healing` (clamps to max + clears death saves on revive), `resolve_death_save` (2024 RAW: ≥10 success, <10 failure, nat 1 = 2 failures, nat 20 = HP 1 + clear tracks).
- Three API endpoints: `POST /characters/{id}/damage|heal|death-save`.
- Migration 0013 applied; DuckDB patch idempotent.
- 18 service-layer tests added (`tests/test_services/test_combat_state.py`).

Frontend
- Character sheet header expanded to 6 chips: HP, Temp HP (green when active), AC, Speed, Insp (◯ → ●), Init. Insp chip and HP damage/heal buttons mutate server state.
- Concentration line auto-shows when `concentration_on` is set, with "Drop" and "Roll CON save (DC = max(10, half damage))" buttons. A free-text starter sits in its place when nothing is concentrated on.
- DeathSaveTracker auto-renders when `hp_current == 0`. Three success / three failure pips reflect server state. Player enters real d20, server resolves the save per 2024 RAW. "🎲 Digital" fallback included.
- RollHelper extended with NORMAL / ADV / DIS toggle. Adv/Dis mode shows two d20 inputs side-by-side and the total picks the higher (Adv) or lower (Dis).
- HUD party panel: compact badge row per PC for active states (🛡 Temp HP +N, ✨ Insp, 🌀 Concentrating on X, 💀 N✓/M✗ when dying). Hidden when no state.

**Surprises:** none — the layer architecture made the backend trivially testable, and the React Query invalidation pattern from earlier plans made the sheet/HUD stay in sync automatically.

**Tech debt:** none added. The `PlayerCharacterUpdate.concentration_on` field relies on `model_dump(exclude_unset=True)` semantics to distinguish "unset" from "explicit null"; documented in existing service code.
