# Plan 00022 — Full Character Sheet UI

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-14
**Last updated:** 2026-05-14
**Implemented by:** Claude (Roll20-killer character sheet — capstone 6/8)

---

## Purpose

The capstone plan. Brings everything from Plans 17–21 together into a
single full-screen character sheet that opens from anywhere a PC is
referenced (Characters list, SessionHud party panel).

**Design constraint for future plans:** every component accepts a
``readOnly`` prop. Plan 26 (per-player sheet views) will flip it on
without rewriting components.

When this plan ships:
1. **`CharacterSheet.tsx`** — single full-screen modal/route with five
   header stats, ability + skill + save blocks, attacks, spells,
   inventory, features, notes.
2. **`AbilityBlock`, `SkillsList`, `SavingThrows`, `AttacksList`** — new
   pure-display components, each with explicit modifiers and roll buttons.
3. **Roll preview** — clicking a roll button surfaces a small toast/popup
   with the rolled value + breakdown (e.g. "Athletics check: 1d20 (12) +
   STR (+3) + Prof (+2) = 17"). Actual persistence to a combat log is
   Plan 23.
4. **Click-to-open from existing surfaces**:
   - Characters page: each card gains an "Open Sheet" button.
   - SessionHud party panel: clicking a PC name opens the sheet.
5. **Computed bonuses** — surfaces what's already in
   `character_service.compute_skill_bonuses` and `compute_saving_throws`.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-14
- [ ] Step 2: Backend: expose `compute_saving_throws` + `compute_skill_bonuses` via API endpoints on the character router so the sheet can consume them
- [ ] Step 3: Build display components (AbilityBlock, SkillsList, SavingThrows, AttacksList) — all accept `readOnly`
- [ ] Step 4: `CharacterSheet.tsx` shell — full-screen overlay with sections
- [ ] Step 5: Wire equipped weapons + attack-preview integration (Plan 18) into AttacksList
- [ ] Step 6: Reuse InventoryPanel / SpellPanel / FeaturePanel inside the sheet (set defaultOpen)
- [ ] Step 7: Click-to-open: Characters page button + SessionHud party-panel PC name
- [ ] Step 8: Roll-preview toast (client-side d20+mod for now; Plan 23 wires the real log)
- [ ] Step 9: `/quality-gate` green
- [ ] Step 10: Manual smoke — open the sheet from both surfaces, verify all data displays, roll a skill check

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-14 | Sheet form factor | (a) Full-screen modal, (b) New route, (c) Side drawer | (a) | Modal is closeable without losing the DM's current view. New route would clutter back-button history. Drawer too narrow for a 5e sheet's data density. |
| 2026-05-14 | readOnly prop | yes/no | yes | Plan 26 (per-player views) needs read-only; building it in now is cheaper than retrofitting. |
| 2026-05-14 | Where roll math lives | (a) Server endpoint, (b) Client function | (b) | A d20 roll is trivial; round-tripping to the server adds latency. Plan 23 will move it to the server when we persist to a combat log. |
| 2026-05-14 | Surface saves + skills via API | yes/no | yes | The existing `character_service.compute_*` is server-side. Mirroring the formula on the client is fragile. One round-trip per sheet open is fine. |

---

## Context and Orientation

### Files touched

**Backend:**
- `api/routers/characters.py` — new GET endpoints for `/characters/{id}/skill-bonuses` and `/characters/{id}/saving-throws`
- `tests/test_services/test_character_service.py` (extend if needed)

**Frontend:**
- `frontend/src/api/characters.ts` — `skillBonuses(id)`, `savingThrows(id)`
- `frontend/src/api/types.ts` — `SkillBonusMap`, `SavingThrowMap`
- `frontend/src/components/character-sheet/CharacterSheet.tsx` (new — the shell)
- `frontend/src/components/character-sheet/AbilityBlock.tsx` (new)
- `frontend/src/components/character-sheet/SkillsList.tsx` (new)
- `frontend/src/components/character-sheet/SavingThrows.tsx` (new)
- `frontend/src/components/character-sheet/AttacksList.tsx` (new) — pulls equipped weapons from InventoryPanel data + uses Plan 18's attack-preview
- `frontend/src/components/character-sheet/RollToast.tsx` (new) — tiny popup showing the roll result
- `frontend/src/pages/Characters.tsx` — "Open Sheet" button per PC
- `frontend/src/pages/SessionHud.tsx` — clicking PC name in left panel opens the sheet

### readOnly contract

Every interactive element checks `readOnly`:
- Toggle equipped/attuned/prepared → disabled when readOnly
- Spend slot/feature use → disabled
- Cast / attack buttons → still visible (rolling is fine for players) but the persist-to-server side stays disabled until Plan 23

### Key terms defined
- **Roll preview:** a non-persisted client-side calculation. Plan 23 will save it as a `CombatLogEntry`.
- **Attack chain:** Inventory → equipped weapons → Plan 18 attack-preview endpoint → display in AttacksList.

---

## Concrete Steps

### Step 2: API endpoints
```python
@router.get("/characters/{id}/skill-bonuses", response_model=dict[str, int])
def get_skill_bonuses(...) -> dict[str, int]:
    pc = ...  # fetch + authz
    return character_service.compute_skill_bonuses(pc)

@router.get("/characters/{id}/saving-throws", response_model=dict[str, int])
def get_saving_throws(...) -> dict[str, int]:
    pc = ...
    return character_service.compute_saving_throws(pc)
```

### Step 4: CharacterSheet shell sketch
```
┌─────────────────────────────────────────────┐
│ [Portrait] Aragorn · Lv 5 Ranger · Human  ✕│
│ HP 28/45  AC 16  Speed 30  Init +3          │
├─────────────────────────────────────────────┤
│ ABILITIES                                   │
│ [STR 14 +2] [DEX 16 +3] [CON 14 +2] …       │
│                                             │
│ SAVES        SKILLS                          │
│ STR +2       Acrobatics +5                   │
│ DEX +5*      …                               │
│                                             │
│ ⚔ ATTACKS                                   │
│ Longbow      +5 to hit  1d8+3 piercing      │
│ Shortsword   +5 to hit  1d6+3 piercing      │
│                                             │
│ 📖 SPELLS  (SpellPanel embedded, open)      │
│ ⚡ FEATURES  (FeaturePanel embedded, open)  │
│ 📦 INVENTORY  (InventoryPanel embedded)     │
│                                             │
│ 📝 BACKSTORY · NOTES (editable textarea)    │
└─────────────────────────────────────────────┘
```

---

## Validation and Acceptance

- [ ] `pytest -q` passes (439 prior, possibly +small)
- [ ] Manual: Characters page → click "Open Sheet" → modal opens with all data
- [ ] Manual: SessionHud → click PC name in left party panel → same modal
- [ ] Manual: Click "Roll Athletics" → toast shows "d20 (X) + STR + Prof = Y"
- [ ] Manual: Click "Attack with Longbow" → toast shows attack hit + damage
- [ ] Manual: readOnly mode (toggle for dev) → all buttons disabled but data still displays

---

## Outcomes and Retrospective

**Shipped:**
- Full-screen character sheet that opens from Characters page ("📜 Open Sheet") and from any PC name in SessionHud's left party panel.
- Sticky header with portrait, identity line, and four chip stats (HP / AC / Speed / Initiative — Initiative is clickable to roll).
- Ability scores, saving throws, all 18 skills, attacks (from equipped weapons + server attack-preview), spells (embedded SpellPanel open), features (embedded FeaturePanel open), inventory (embedded InventoryPanel open), backstory + notes — all in one scrollable view.
- Every roll surface uses a shared `RollToast` that auto-dismisses after 4s and color-codes crits (green) and fumbles (red).
- **Reusable for the future player-view (Plan 26):** every panel and display component accepts `readOnly` and `defaultOpen` props. Plan 26 will flip readOnly on without component rewrites.

**Trade-offs:**
- Roll math runs client-side. Plan 23 will move it server-side so rolls persist to a combat log and broadcast to player views.
- Notes/backstory are display-only in this iteration. The existing Characters page Edit form is the way to update them. Plan 22 could grow inline editing later but the data wasn't blocked.
- Skill proficiencies UI is read-only (the dot color / level shows proficient vs expertise from `pc.skill_proficiencies`). Editing proficiencies belongs on the character creation form.

**Component layout:**
- New folder `frontend/src/components/character-sheet/`:
  - `CharacterSheet.tsx` (shell)
  - `AbilityBlock.tsx`, `SkillsList.tsx`, `SavingThrows.tsx`, `AttacksList.tsx` (pure display components)
  - `RollToast.tsx` (shared toast + client d20 roller)

**Backend additions:**
- `services/character_service.compute_saving_throws(pc) → {ability: bonus}` — new helper.
- Two new endpoints: `GET /characters/{id}/skill-bonuses` and `GET /characters/{id}/saving-throws`.

**Deferred:**
- Server-side rolls + combat-log persistence (Plan 23).
- Inline editing of HP/notes/etc. directly from the sheet (vs through panels).
- Print/export view of the sheet.
