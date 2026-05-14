# Plan 00020 — PC Spell Knowledge + Persistent Slot Tracking

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-14
**Last updated:** 2026-05-14
**Implemented by:** Claude (Roll20-killer character sheet — foundation 4/8)

---

## Purpose

Fourth foundation block of the Roll20-killer character sheet. Adds:
1. **`character_spells` junction table** — PC knows N spells from the catalog, each with optional `prepared` flag.
2. **Persistent slot tracking** — new `spell_slots_used` JSON column on `player_characters` records how many slots of each level have been spent. Remaining = `compute_spell_slots(class, level) - used`.
3. **Cast flow** — `expend_slot(level)` decrements available slots; raises `NoSpellSlotError` if none remain.
4. **Rest mechanics** — `long_rest_recover()` zeroes out `spell_slots_used` (full recovery per RAW). Short rest covered in Plan 21 (Warlock pact-magic recovery is a class feature).
5. **Frontend** — `SpellPanel.tsx` component on each PC card showing known/prepared spells, current/max slots per level, cast buttons.

When this plan ships, Plan 22 (the character sheet UI) can render the full spell page with clickable cast buttons; Plan 23 will wire those clicks to a combat-log event.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-14
- [x] Step 2: Domain: `CharacterSpell` + schemas, `spell_slots_used` JSON column, `NoSpellSlotError`, `SpellSlotStateRead` — 2026-05-14
- [x] Step 3: `CharacterSpellRepo` with CRUD + `find_by_pc_and_spell` — 2026-05-14
- [x] Step 4: `spellcasting_service` — list/learn/forget/set_prepared + slot_state/expend/restore/long_rest_recover. Warlock pact magic normalized to per-level shape — 2026-05-14
- [x] Step 5: Migration 0011 applied to Postgres — 2026-05-14
- [x] Step 6: DuckDB patch entry added — 2026-05-14
- [x] Step 7: API: GET/POST/PATCH/DELETE `/characters/{id}/spells/...` + GET/POST `/characters/{id}/spell-slots/...` (expend, restore, long-rest) — 2026-05-14
- [x] Step 8: 18 service tests covering learn idempotency + union, prepared toggle, slot state math (Wizard L5, Fighter, Warlock), expend/over-spend/invalid-level, restore-at-zero no-op, long-rest full recovery, authz — 2026-05-14
- [x] Step 9: Frontend types `CharacterSpell*` + `SpellSlotState*` + `spellcastingApi` client — 2026-05-14
- [x] Step 10: `SpellPanel.tsx` component with clickable slot pips, known-spells-grouped-by-level, prepared toggle, cast button, class-scoped picker, long-rest button. Wired into Characters.tsx — 2026-05-14
- [x] Step 11: `/quality-gate` green — 411 backend tests, 97.6% docstring coverage — 2026-05-14
- [ ] Step 12: Manual smoke test — _user to verify_ slot pip click → spend → drop a level-3 slot on a Wizard PC

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-14 | Slot tracking schema | (a) JSON on player_characters, (b) Separate spell_slots table | (a) | At most 10 entries per PC (cantrip + 1–9). JSON is trivial to read/write; no join cost. Same pattern as `spells_known` (existing JSON column). |
| 2026-05-14 | Prepared-spell capacity check | (a) Service enforces "your INT mod + level" cap, (b) DM enforces at the table | (b) for Plan 20 | The cap formula varies by class (Wizard, Cleric, Druid all differ). Plan 21 (class features) is the right place. For now: any spell can be marked prepared. |
| 2026-05-14 | Learning vs preparing | (a) Two flags, (b) Just prepared (always known) | (a) | Some classes (Cleric, Druid, Wizard) distinguish known from prepared; others (Bard, Sorcerer) don't. Two flags supports both with the same model. |
| 2026-05-14 | Slot consumption semantics | (a) Track used (count up), (b) Track remaining (count down) | (a) | Survives the case where the PC levels up mid-session: max increases, used unchanged, remaining auto-recomputes correctly. (b) would need a reconciliation step on level-up. |

---

## Context and Orientation

### Files touched

**Backend:**
- `domain/character.py` — `CharacterSpell` table + schemas; `NoSpellSlotError`; `spell_slots_used` column on `PlayerCharacter`; `PlayerCharacterRead.spell_slots_used`
- `db/repos/character_spell_repo.py` (new)
- `services/spellcasting_service.py` (new)
- `db/base.py` — DuckDB patch for new column
- `alembic/versions/0011_add_character_spells.py` (new)
- `api/routers/spellcasting.py` (new) — registered in `api/main.py`
- `tests/test_services/test_spellcasting_service.py` (new)

**Frontend:**
- `frontend/src/api/types.ts` — `CharacterSpell`, `SpellSlotState`, `CharacterSpellCreate/Update`
- `frontend/src/api/spellcasting.ts` (new)
- `frontend/src/components/SpellPanel.tsx` (new)
- `frontend/src/pages/Characters.tsx` — render `<SpellPanel>` per PC card

### Architecture layers involved
Full vertical slice. Same one-way flow as Plans 17–19.

### Key terms defined
- **Known spell:** A spell on the PC's "I can cast this" list. Sorcerers, Bards, Rangers, etc. have a fixed known list. Wizards know spells but choose which to prepare daily.
- **Prepared spell:** Subset of known that's "loaded today". Cantrips are always prepared. For classes that don't distinguish (Sorcerer, Warlock), `known == prepared`.
- **Slot:** A unit of magical energy used to cast a leveled spell (cantrips don't use slots). 5e slot tables are in `character_service.compute_spell_slots`.
- **Long rest:** ≥8 hours of rest. Restores all slots. (Short rest restores only Warlock slots + some class features — Plan 21.)

---

## Concrete Steps

### Step 4 detail: slot_state and expend_slot

```python
def slot_state(db, pc_id, dm_email) -> dict[str, dict[str, int]]:
    pc = _assert_pc_owner(db, pc_id, dm_email)
    max_slots = character_service.compute_spell_slots(pc.character_class, pc.level)
    used = pc.spell_slots_used or {}
    state = {}
    for level, max_count in max_slots.items():
        u = int(used.get(str(level), 0))
        state[str(level)] = {
            "max": max_count,
            "used": min(u, max_count),  # clamp in case of level-down
            "remaining": max(0, max_count - u),
        }
    return state


def expend_slot(db, pc_id, level, dm_email) -> dict[str, dict[str, int]]:
    pc = _assert_pc_owner(db, pc_id, dm_email)
    if level < 1 or level > 9:
        raise ValueError("Slot level must be 1..9")
    state = slot_state(db, pc_id, dm_email)
    if state[str(level)]["remaining"] <= 0:
        raise NoSpellSlotError(f"No level {level} slots remaining.")
    used = dict(pc.spell_slots_used or {})
    used[str(level)] = int(used.get(str(level), 0)) + 1
    pc.spell_slots_used = used
    db.add(pc); db.commit(); db.refresh(pc)
    return slot_state(db, pc_id, dm_email)
```

### Step 10 detail: SpellPanel UI
Slot row at top: pips per level (filled = available, empty = used). Click an empty pip to restore one (undo); click "Cast" → opens a small menu listing spell levels with remaining slots, click level → expend + log.

Known spells: list grouped by level. Each row shows name, prepared toggle, "Cast (Lvl N)" button that opens the slot picker.

---

## Validation and Acceptance

- [ ] `pytest -q` passes (393 prior + new tests)
- [ ] Manual: a level-5 Wizard has slots `{1:4, 2:3, 3:2}`. Cast fireball → `{1:4, 2:3, 3:1}`. Long rest → restored.
- [ ] Manual: trying to expend a level-3 slot when remaining=0 returns a 422 with friendly text.
- [ ] `alembic current` shows 0011

---

## Idempotence and Recovery

Migration is additive. `learn_spell` is idempotent on (pc, spell). `expend_slot` is intentionally NOT idempotent — clicking cast twice spends two slots, which is what the DM wants.

---

## Interfaces and Dependencies

**Produces:**
- A real PC spell book + slot tracker. Plan 22 (sheet UI) reads from here. Plan 23 will fire a combat-log event on each cast.

**Depends on:** Plan 17 (spells catalog), existing `character_service.compute_spell_slots`.

---

## Outcomes and Retrospective

**Shipped:**
- PCs now have a structured spellbook + persistent slot tracker. Plan 22 (sheet UI) has clean data to render. Plan 23 will wire the cast buttons to a combat-log event.
- Slot pips are clickable: filled = available (click to spend), hollow = used (click to restore). Long-rest button zeros everything.
- Warlock pact magic is normalized to a single per-level entry — the UI treats Warlocks identically to other casters, while compute_spell_slots's `{"pact": N, "level": L}` shape is hidden in the service.
- learn_spell is idempotent + unions flags: relearning a spell as "prepared" upgrades the existing row rather than failing.

**Trade-offs:**
- No "prepared cap by class" enforcement yet. Plan 21 (class features) is the right place for "Wizard prepares INT+level spells per day." For now any spell can be marked prepared.
- Slot expend/restore is unbounded per click. UI prevents over-spend by only rendering filled pips for remaining slots, but the backend trusts the click. NoSpellSlotError catches the case where the client tries to expend past zero.
- Old `spells_known` and `spell_slots` JSON columns on PlayerCharacter are still there for legacy data; new code reads/writes the structured table + spell_slots_used column.

**Deferred:**
- Short-rest Warlock pact recovery (Plan 21 — needs class-feature framework for rest mechanics).
- Multi-class slot table (combine slots from different caster classes per 5e multiclass rules).
- Spell components inventory check (do you have the diamond worth 300gp for Revivify?).
