# Plan 00019 — PC Inventory + Equipment

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-14
**Last updated:** 2026-05-14
**Implemented by:** Claude (Roll20-killer character sheet — foundation 3/8)

---

## Purpose

Third foundation block of the Roll20-killer character sheet. Adds:
1. **`character_items` junction table** — PC owns N items from the compendium, with quantity, equipped flag, attuned flag, optional notes, and acquisition timestamp.
2. **Service-layer rules** — attunement cap of 3 items per PC (soft-enforced at the service layer with `AttunementLimitError`); equipping is unbounded by RAW (DM can curb at the table).
3. **Loot-handout integration** — Plan 16's `record_item_handout` now also creates a `character_items` row (or increments quantity on an existing one). Notes still get the timestamped audit line.
4. **API** — full CRUD for inventory items per character.
5. **Frontend** — inventory section on the Characters page, expandable per PC. Quantity inputs, equip / attune toggles, remove button. Mastery + attack-preview integration for weapons (links to Plan 18's `attack-preview`).

When this plan ships, Plan 22 (the character sheet UI) has a real inventory + equipment list to render, and the loot-handout flow finally produces structured data instead of just notes text.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-14
- [x] Step 2: Domain: `CharacterItem` SQLModel + Pydantic Create/Read/Update; `AttunementLimitError` exception — 2026-05-14
- [x] Step 3: `CharacterItemRepo` with CRUD + `find_by_pc_and_item` + `count_attuned_for_pc` — 2026-05-14
- [x] Step 4: `inventory_service` with `list_for_character`, `add_item` (idempotent qty bump), `add_handout`, `set_quantity` (0=delete), `set_equipped`, `set_attuned` (cap enforced), `remove` — 2026-05-14
- [x] Step 5: `session_service.record_item_handout` now also calls `inventory_service.add_handout` — 2026-05-14
- [x] Step 6: Migration 0010 applied to Postgres — 2026-05-14
- [x] Step 7: New `api/routers/inventory.py` with GET/POST `/characters/{id}/inventory` + PATCH/DELETE `/characters/{id}/inventory/{character_item_id}` — 2026-05-14
- [x] Step 8: 17 new tests in `test_inventory_service.py` covering all paths + edge cases (qty bump, attune cap, unattune frees slot, qty 0 deletes, non-owner denied) — 2026-05-14
- [x] Step 9: Frontend types `CharacterItem*`, `inventoryApi` client — 2026-05-14
- [x] Step 10: `InventoryPanel.tsx` component with qty stepper, equip/attune toggles, remove button, and a compendium search-and-add bar. Wired into `Characters.tsx` per PC card. — 2026-05-14
- [x] Step 11: `/quality-gate` green — 393 backend tests, all linters, 97.9% docstring coverage — 2026-05-14
- [ ] Step 12: Manual smoke test — _user to verify_ Plan 16 loot handout now also creates an inventory row

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-14 | Inventory schema | (a) JSON column on PlayerCharacter, (b) New junction table | (b) | Items have meaningful per-instance state (quantity, equipped, attuned, acquired_at). Queryable rows beat JSON for "which PCs have a Longsword?" and "how many items is this PC attuned to?". |
| 2026-05-14 | Attunement cap | (a) Hard block at 3, (b) Soft warn, (c) Ignore | (a) | RAW 5e cap is 3. DM can lift by toggling via DB if needed. Wrong defaults at game night are worse than strict ones. |
| 2026-05-14 | Loot handout merge behavior | (a) Always create new row, (b) Increment qty on existing same-item row | (b) | Consumables (Potion of Healing × 3) shouldn't spam the inventory list. Equipment that's stack-meaningless still goes to qty 1. |
| 2026-05-14 | Where inventory UI lives | (a) Characters page section, (b) New PC detail page, (c) Inside Session HUD | (a) | Plan 22 will build the full sheet in the HUD. For Plan 19, expandable section on Characters page is the cheapest functional surface. |

---

## Context and Orientation

### Files touched

**Backend:**
- `domain/character.py` — add `CharacterItem` table + schemas; new `AttunementLimitError`
- `db/repos/character_item_repo.py` (new)
- `services/inventory_service.py` (new)
- `services/session_service.py` — extend `record_item_handout` to also add to inventory
- `alembic/versions/0010_add_character_items.py` (new)
- `api/routers/inventory.py` (new) — registered in `api/main.py`
- `tests/test_domain/test_character_item.py` (new)
- `tests/test_repos/test_character_item_repo.py` (new)
- `tests/test_services/test_inventory_service.py` (new)
- `tests/test_services/test_session_service.py` (extend) — handout creates inventory row

**Frontend:**
- `frontend/src/api/types.ts` — `CharacterItem`, `CharacterItemCreate`, `CharacterItemUpdate`
- `frontend/src/api/inventory.ts` (new)
- `frontend/src/pages/Characters.tsx` — expandable inventory section per PC card

### Architecture layers involved
Full vertical slice. Same one-way flow as Plans 17 and 18.

### Key terms defined
- **Equipped:** Worn or wielded. Affects derived stats (AC from armor, attack rolls from weapons). 5e doesn't cap equipped count by RAW, but conventions: 1 set of armor, 1 shield, 1–2 weapons (TWF).
- **Attuned:** Bond between PC and magic item that requires attunement. Max 3 per PC (RAW). Requires a short rest.
- **Junction-vs-instance:** A "character_item" row IS an instance. Two Longswords = two rows (so each can be enchanted differently when Plan 24 lands), OR one row with qty=2 (cheaper). We use qty for stackables. For uniquely magical items, the DM creates separate item rows in the compendium.

---

## Concrete Steps

(Follow the patterns established in Plans 17 and 18.)

### Step 4 detail: inventory_service

```python
class AttunementLimitError(ValueError):
    """Raised when a PC tries to attune to a 4th item."""

def set_attuned(db, character_item_id, attuned: bool, dm_email: str) -> CharacterItem:
    ci = ...  # fetch + authz
    if attuned and not ci.attuned:
        current = CharacterItemRepo.count_attuned_for_pc(db, ci.character_id)
        if current >= 3:
            raise AttunementLimitError(
                f"{pc.character_name} is already attuned to 3 items (RAW cap)."
            )
    ci.attuned = attuned
    ci.attuned_at = datetime.now(UTC) if attuned else None
    return CharacterItemRepo.update(db, ci, ...)
```

### Step 5 detail: handout integration

```python
def record_item_handout(db, session_id, pc_id, item_id, dm_email) -> GameSession:
    # ... existing notes append ...
    # NEW:
    inventory_service.add_handout(db, character_id=pc_id, item_id=item_id, dm_email=dm_email)
    return updated_session
```

### Step 10 detail: Characters.tsx inventory panel
Each PC card grows a collapsed "📦 Inventory (N items)" header. Click → expand → table of items with cols: name, qty, equipped toggle, attuned toggle, remove. Plus a search-and-add row at the bottom (search compendium, click to add qty 1).

---

## Validation and Acceptance

- [ ] `pytest -q` passes (376 prior + new inventory tests)
- [ ] Manual: open SessionHud → 💰 Loot → give a Potion of Healing to a PC twice → Characters page shows qty 2
- [ ] Manual: attune to 3 items, try to attune to a 4th → friendly error message
- [ ] Manual: equip/un-equip a weapon → toggle persists across refresh
- [ ] `alembic current` shows 0010

---

## Idempotence and Recovery

Migration is forward-only additive. `add_handout` is idempotent in that repeated calls increment qty instead of erroring.

---

## Interfaces and Dependencies

**Produces:**
- Structured inventory data for Plan 22 (character sheet UI) to render
- Equipped-weapon list that Plan 22 can feed into the attack-preview endpoint
- Inventory log that Plan 23 can correlate with combat-log events

**Depends on:** Plan 17 (no — that was spells, unrelated). Plan 18 (no — that was weapons, but inventory doesn't need attack math). Existing Item + PlayerCharacter tables. Plan 16's loot handout for the integration point.

---

## Outcomes and Retrospective

**Shipped:**
- PCs now own structured inventory rows instead of just text notes. Plan 22 (character sheet UI) has a real data model to render.
- Loot handouts from Plan 16 automatically create or increment inventory rows. Notes audit log preserved.
- Attunement cap is hard-enforced server-side. 4th-attune attempts surface to the UI as a friendly error string.
- Repeat handouts merge instead of creating duplicate rows — DM can hand out potions five times and the inventory shows `Potion of Healing ×5`, not five rows.

**Trade-offs:**
- Inventory rows merge on (character_id, item_id) — so two instances of an item that should be tracked separately (e.g. one cursed, one not) would need two distinct compendium items. Plan 22 may revisit if it becomes a UX issue.
- The UI lives on the Characters page rather than the HUD. Plan 22 will fold it into the character sheet there.
- The PATCH endpoint applies fields sequentially. If `quantity=5, attuned=true` are both supplied and attune would exceed the cap, the quantity update lands first and the attune raises 422 — partial success. Acceptable for game-night use; clean cleanup later.

**Deferred:**
- Encumbrance / weight tracking — Plan 24 polish.
- Multi-instance separate-row mode (cursed sword #1 vs cursed sword #2) — only matters when individual items have per-instance state.
