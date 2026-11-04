# Plan 00133 — Beta feedback round 1 (James): maps, homebrew races and subclasses, custom origin

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-11-03
**Last updated:** 2026-11-03
**Implemented by:** Claude (lead) + subagents

---

## Purpose
James, a beta DM running a 2014 Zelda campaign, sent six notes on 11/3 and 11/4.
- **Loved:** copy-and-edit spells with the automatic homebrew tag, and full sheets for NPCs.
- **Broke:**
  - An imported 25×50-square chase map came out smaller.
  - The map editor has no way to hide things or set a scale.
- **Missing:**
  - A custom race only takes ability bonuses: no traits, skills, speed or languages.
  - A custom subclass is only a name, with no features.
  - Tasha's custom origin: moving racial bonuses anywhere.
- **Nice to have:** importing magic items. On hold; Justin is asking James where they'd come from.

When this is done:
- The battle-map grid is set in squares, with a scale.
- Fog can hide as well as reveal.
- A DM can make homebrew races and subclasses that every character in their campaigns can pick, and the subclass features show in the level-up guide and on the sheet.
- A 2014 campaign can turn on custom origin.

---

## Progress
- [ ] W1-BM battle maps: grid in squares, scale, smarter guess, hide/cover
- [ ] W1-HR homebrew races and subclasses: model, migration 0062 (also `campaigns.custom_origin`), repo, service, API, catalog page
- [ ] W2-HB builder: homebrew races and subclasses in the options; custom origin
- [ ] W2-HL level-up guide and feature listing: homebrew subclass features
- [ ] Lead: integration, screenshots, docs, gate, merge

---

## Surprises and Discoveries
- `BattleMaps.tsx guessGrid` takes the first candidate pixel size (70, 100, 96, …) that divides both image sides. A map drawn at another size gets a wrong, smaller grid: 1400×2800 at 56 px reads as 20×40, not 25×50. The only fix today is a "pixels per square" box.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 11/03 | Custom races and subclasses | per character in the builder / DM homebrew catalog | DM catalog, with a "make one now" link from the builder | Justin; players pick the DM's race on their phones |
| 11/03 | Custom origin | player's choice / DM switch per campaign | DM switch per campaign (`campaigns.custom_origin`, 2014 only) | Justin; the DM decides the table's rules |
| 11/03 | Bulk item import | build now / ask first / skip | Ask James what he'd import from | Justin |
| 11/03 | Branch | main / feature | `feat/feedback-james` | Parallel agents |

---

## Context and Orientation

### Key terms
- **Homebrew race (species):** a DM-made race. It has:
  - name, size, speed;
  - ability bonuses (2014) or none (a 2024 species' bonuses come from the background);
  - an optional "choose N +1s";
  - fixed skills, plus a skill choice count;
  - traits (name and text), languages, and HP per level.
  - It applies to 2014, 2024 or both.
- **Homebrew subclass:** a DM-made subclass for one class. It has features by level (level, name, text) and optional always-prepared spells by level.
- **Custom origin (Tasha's rule, named plainly in the UI):** in a 2014 campaign with the switch on, a race's ability bonuses can go on any abilities: the +2 and the +1 on different abilities, each +1 of a +1/+1 split on a different ability.
- **Ownership:** SEC-003. A row is the DM's own (`created_by_email`); only they see and change it. The builder shows the campaign DM's homebrew to everyone building in that campaign, including players on the join link.

### Files and ownership
- **Lead:** this plan, docs, integration, final gate.
- **BM:**
  - `frontend/src/pages/BattleMaps.tsx`
  - the table map components that show or toggle fog (`frontend/src/components/table/MapCanvas.tsx`, `LiveBoardPane.tsx`, `TableConsole.tsx`, as needed)
  - `domain/battle_map.py`, `services/*battle_map*`, `api/routers/battle_maps.py`, as needed
  - `tests/test_api/test_plan133_maps.py`
  - **No migration.** If a column is truly needed, report it to the lead first.
- **HR:**
  - new `domain/homebrew.py`, `db/repos/homebrew_repo.py`, `services/homebrew_service.py`, `api/routers/homebrew.py` (registered in `api/main.py`)
  - `alembic/versions/0062_homebrew_races_subclasses.py`
  - `db/base.py` (DuckDB patch for `campaigns.custom_origin`)
  - `domain/__init__.py` (register the tables)
  - `domain/campaign.py` and `services/campaign_service.py`: `custom_origin`, 2014 only
  - the Rules card switch (`frontend/src/components/RulesPicker.tsx` or the Characters page Rules card)
  - new catalog page `frontend/src/pages/HomebrewOptions.tsx` (route plus nav link "Races & subclasses" next to Spells), new forms in `frontend/src/components/homebrew/`, `frontend/src/api/homebrew.ts`
  - `tests/test_api/test_plan133_homebrew.py`
- **HB (wave 2):** `services/character_builder_service.py`, `domain/character_builder.py`, `frontend/src/components/character-wizard/**`, `frontend/src/api/characterBuilder.ts`, builder tests.
- **HL (wave 2):** `services/levelup_service.py`, `feature_service.class_features_of` / listing, `frontend/src/pages/LevelUpGuide.tsx`, level-up tests.

---

## Concrete Steps
1. **BM, the grid:**
   - The editor shows and edits the grid as "N squares across × M down", plus "1 square = X ft" (default 5). Store pixels per square as today (`grid_size` = width ÷ squares across), so nothing downstream changes.
   - The import guess prefers a size whose square count looks like a battle map. When unsure, it asks: "How many squares across is this map?" It never silently picks a wrong size.
   - Where the square count shows (library cards, the table), it reads "25 × 50 squares".
2. **BM, fog:** find out how fog works today (regions drawn at prep, revealed one at a time at the table). Make hiding possible and obvious:
   - re-cover a revealed region at the table;
   - draw "hidden areas" on an otherwise visible map, if the model allows it without a migration;
   - plain words in the editor on how fog works.
   - Phone (411 px) usability matters: James was on a phone.
3. **HR:**
   - Model, migration and API: `/api/homebrew/races` and `/api/homebrew/subclasses`, with CRUD, ownership, name unique per owner, and delete refused while a PC in the owner's campaigns uses it. Plus `campaigns.custom_origin` (default false; rejected or ignored on 2024 campaigns).
   - Catalog page in the Plan 132 style: New, Copy and edit, Edit, Delete, a Yours chip.
4. **HB:**
   - The builder options include the campaign DM's homebrew races and subclasses for the campaign's ruleset, in the 2024 and 2014 `SPECIES` and `srd_subclasses` shapes.
   - Validation applies their bonuses, skills, traits and HP per level.
   - Custom origin lets 2014 racial bonuses move.
   - The wizard gets "Make a custom race / subclass" links for the DM, and the existing "From my book" path stays.
5. **HL:** a homebrew subclass's features at each level show in the level-up guide's "What's new", in the sheet's feature listing, and in the builder's subclass explainer (HB). Its always-prepared spells are applied.
6. **Lead:** integration, phone screenshots, docs (Guide #homebrew, data dictionary, ARCHITECTURE), gate, merge after Justin.

---

## Validation and Acceptance
- [ ] Gate: pytest, black, isort, flake8, interrogate, pip-audit, tsc, eslint (changed files) and the vite build all pass.
- [ ] A 25×50-square map imports as 25×50, or asks; the editor shows squares and the scale.
- [ ] The DM can hide a region again at the table, and the editor explains fog in one line.
- [ ] A DM makes "Hylian" (2014, +2 DEX +1 WIS, Perception, two traits). A player picks it from the join link on a phone, and the sheet carries the traits and the bonuses.
- [ ] A DM makes "Oath of the Triforce" (Paladin) with features at 3 and 7. A Paladin picks it at 3 in the builder, and levelling to 7 shows the new feature in the guide.
- [ ] With custom origin on, a 2014 Hill Dwarf can put +2 on DEX and +1 on WIS; with it off, that's refused.
- [ ] Another DM sees none of this homebrew.

---

## Idempotence and Recovery
Branch `feat/feedback-james`. Migration 0062 is additive.

---

## Interfaces and Dependencies
**Produces:** `HomebrewRace`, `HomebrewSubclass`, `/api/homebrew/*`, `campaigns.custom_origin`.
**Depends on:** Plans 131 (rulesets) and 132 (homebrew patterns: `catalog_visible`, `MineChip`, `lib/homebrew.ts`, `api.delete({quiet})`).

---

## Outcomes and Retrospective
_Fill in after completion._
