# Plan 00132 — DM homebrew: make your own monsters, magic items, weapons and spells

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-11-01
**Last updated:** 2026-11-01
**Implemented by:** Claude (lead) + subagents

---

## Purpose
Beta DMs want their own monsters, magic items and weapons (and spells). Since SEC-003 the backend has supported DM-owned catalog rows:
- `created_by_email` is stamped on create.
- Lists show the shared catalog plus the caller's own rows (`auth_service.catalog_visible`).
- Only the owner or an admin may change a row (`require_catalog_editor`).

No screen makes them, and monsters and items have no delete route. When this is done, a DM can create, copy-from-SRD, edit and delete their homebrew from the Monsters, Magic Items and Spells pages. It then shows up wherever the catalog is used: encounter builder, loot, shops, inventory and the spell panels. Justin chose DMs only, not players (11/01).

---

## Progress
- [ ] Lead: plan, branch `feat/homebrew`, shared `HomebrewChip`
- [ ] Agent HM: monsters (new, copy SRD, edit, delete; form; delete route)
- [ ] Agent HI: magic items and weapons (new, copy SRD weapon, edit, delete; delete route)
- [ ] Agent HS: spells (new, copy, edit, delete; edition note)
- [ ] Lead: integration (encounter picker, inventory add, shops show homebrew), screenshots, docs, gate, merge

---

## Surprises and Discoveries
- The backend create, update and visibility for all three catalogs already exist (SEC-003). The work is mostly frontend, plus two delete routes.
- Weapons are `items` rows with weapon columns (`weapon_category`, `damage_die`, `damage_type`, `weapon_properties`, `versatile_damage`, `weapon_range`, `mastery`), so one item form covers magic items, magic weapons and mundane homebrew weapons.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 11/01 | Who adds homebrew | DMs / players / players suggest | DMs, in their catalog | Justin |
| 11/01 | Monster form size | full blank form only / copy SRD + edit | both: "New monster" blank, plus "Copy and edit" on any stat block | Most homebrew is a tweak of an SRD creature |
| 11/01 | Deleting homebrew in use | cascade / soft-delete / refuse | refuse with a plain list of where it's used | No silent loss of encounters, inventories or shops |
| 11/01 | Edition | per-ruleset homebrew / both | homebrew is valid in both 2014 and 2024 (spells: `ruleset` NULL) | Plan 131's rule |
| 11/01 | Branch | main / feature branch | `feat/homebrew` | Parallel agents; main stays hot-fixable |

---

## Context and Orientation

### Key terms
- **Homebrew:** a catalog row a DM made (`created_by_email` = their email). Only they (and admins) see and change it.
- **Shared catalog:** the SRD rows (`created_by_email` NULL). Admin-only to change.
- **Copy and edit:** prefill the "new" form from an existing row; saving creates a new homebrew row and never changes the original.

### Files (ownership for parallel agents)
- **Lead:** `frontend/src/components/HomebrewChip.tsx` and `frontend/src/lib/homebrew.ts` (`isMine`, `useMyEmail`, `DICE_RE`), this plan, docs, final integration.
- **HM:**
  - `frontend/src/pages/Monsters.tsx`
  - `frontend/src/components/MonsterStatBlock.tsx`
  - new `frontend/src/components/homebrew/MonsterForm.tsx`
  - `frontend/src/api/monsters.ts`
  - `api/routers/monsters.py`
  - the monster service (find it; likely `services/encounter_service.py` monster functions or a `monster_service.py`), monster repo delete
  - `tests/test_api/test_plan132_monsters.py`
- **HI:**
  - `frontend/src/pages/MagicItems.tsx`
  - new `frontend/src/components/homebrew/ItemForm.tsx`
  - `frontend/src/api/items.ts`
  - `api/routers/items.py`
  - `services/item_service.py`, item repo delete
  - `tests/test_api/test_plan132_items.py`
- **HS:**
  - `frontend/src/pages/Spells.tsx`
  - new `frontend/src/components/homebrew/SpellForm.tsx`
  - `frontend/src/api/spells.ts`
  - `tests/test_api/test_plan132_spells.py`
- **Shared:** `frontend/src/api/types.ts`, additive edits only; re-read before each edit.

### Layers
- **Frontend:** forms and pages.
- **api:** delete routes.
- **services:** delete with ownership, and in-use checks through repos.
- **db/repos:** delete, plus "where used" queries.
- No schema change, so no migration.

---

## Concrete Steps
1. **Lead:** `HomebrewChip` (a small "Yours" pill; Lamplit tokens) and `isMine(row, email)`, using `useAuthStore().dmEmail`.
2. **Each agent,** on its page:
   - A "New …" button opens the form (PhoneSheet on a phone, a card or dialog on desktop; follow the existing page patterns, `useIsCompact(640)`).
   - "Copy and edit" on SRD and homebrew rows.
   - "Edit" and "Delete" on your own rows (with a confirm). Delete is refused with the server's plain message when the row is in use.
   - A "Yours" chip and a "Homebrew only" filter.
   - Validation, mirroring the server's Pydantic:
     - required fields
     - dice like `1d8`, `2d6+3`
     - CR from `VALID_CRS`
     - lengths
   - Plain words throughout (DESIGN.md §0, companion principles).
3. **HM, the monster form** (sections):
   - **Basics:** name, size, type, alignment, CR → XP and proficiency bonus auto-filled from the CR.
   - **Defenses:** AC and notes; HP average and formula (formula like `4d8+4`; average auto-computed but editable); speed (walk, fly, swim, climb, burrow).
   - **Ability scores:** with modifiers shown.
   - **Proficiencies and senses:** saves, skills, damage resistances, immunities and condition immunities, senses, languages.
   - **Abilities:** traits, actions, bonus actions, reactions and legendary actions as repeatable rows. Use the same JSON shape the SRD rows use: read `stat_blocks.py` and `MonsterStatBlock.tsx` to see what the stat block renders (name, desc, attack bonus, damage dice and type...).
   - **Delete route:** `DELETE /api/monsters/{id}`, owner or admin; refuse if any encounter uses the monster.
4. **HI, the item form:**
   - **Basics:** name; type (Weapon, Armor, Wondrous item, Potion, Ring, Rod, Staff, Wand, Scroll, Other); rarity; attunement; value in gp; magic toggle; description.
   - **When Weapon:** "based on" an SRD weapon prefills category, damage die and type, properties, versatile die and range; plus a magic bonus (+1/+2/+3).
     - Check how a magic weapon's bonus is represented and applied today (`attack_service`, `item_service.backfill_weapon_stats`, `properties`). Use that representation, so the attack preview adds the bonus.
     - Mastery: only meaningful in 2024; leave as on the base weapon.
   - **Delete route:** `DELETE /api/items/{id}`, owner or admin; refuse if the item is in a character's inventory, a shop, or a loot table.
5. **HS, the spell form:**
   - All `SpellCreate` fields: name, level, school, casting time, range, components V/S/M plus material text, duration, ritual, concentration, description, higher levels, damage dice and type, save ability, attack type, classes multi-select.
   - Homebrew shows under both editions (the server leaves `ruleset` NULL).
   - The `DELETE` route exists; check its in-use behaviour (character spell rows) and refuse with a plain message if needed.
6. **Lead integration:** confirm homebrew appears in the encounter monster picker, the inventory "add item" search, shops and loot. Phone screenshots of each form. Docs: Guide (#homebrew), data dictionary notes, ARCHITECTURE file index. Full gate, then merge.

---

## Validation and Acceptance
- [ ] `pytest -q`, black, isort, flake8, interrogate, pip-audit, tsc, eslint (changed files) and the vite build all pass.
- [ ] A DM creates a homebrew monster from scratch and by copying "Goblin". Both appear in their Monsters list with "Yours" and in the encounter builder's picker. Another DM sees neither.
- [ ] A DM creates "Moonblade" (a +1 longsword, rare, attunement). It appears in the item catalog, can be added to a PC's inventory, and the attack preview shows the +1.
- [ ] A DM creates a homebrew spell; it shows in both 2014 and 2024 campaigns' spell pickers for the chosen classes.
- [ ] Deleting a homebrew row in use is refused with a plain message; an unused one deletes.
- [ ] Editing an SRD row is impossible for a non-admin (no Edit button; the server returns 403).

---

## Idempotence and Recovery
Branch `feat/homebrew`. No migration. Each step is a UI or route addition, safe to redo.

---

## Interfaces and Dependencies
**Produces:**
- `DELETE /api/monsters/{id}` and `DELETE /api/items/{id}`
- The homebrew forms and `HomebrewChip`

**Depends on:**
- The SEC-003 ownership model
- Plan 131's spell `ruleset` NULL for homebrew

---

## Outcomes and Retrospective
_Fill in after completion._
