# Plan 00131 — 2014 rules option (per campaign)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-11-01
**Last updated:** 2026-11-01 (M2 and M3 done; merge pending)
**Implemented by:** Claude (lead) + subagents (milestones M1, M2)

---

## Purpose
A beta DM wants to run their table on the 2014 rules. Today every rules surface is fixed to 2024 (SRD 5.2.1), except the monster catalog, which is already 2014 (SRD 5.1). The surfaces are: the builder, spells, level-up, class trackers, conditions, the DM screen, weapon mastery and encounter math.

When this is done, a DM picks **Rules: 2024 or 2014** when making a campaign. Every character in it is then built, levelled, tracked and ruled on with that edition, using the free SRD 5.1 content (CC-BY-4.0). Book content comes in through the existing "From my book…" free-text entries.

Justin chose "all of it before shipping", so the work lives on branch `feat/2014-rules` and merges to main only when complete.

---

## Progress
- [x] M0 foundation (lead), 11/01, commit 24be631
- [x] M1-D1 data: `srd_character_options_2014.py` (50 tests)
- [x] M1-D2 data: `levelup_2014.py` (27 tests)
- [x] M1-S spells: generator, `srd_spells_2014.py` (319), seed both editions, `?ruleset=` (21 tests)
- [x] M1-F features: `class_features_2014.py` (28 rows), catalog keyed by edition, rest (85 tests)
- [x] M1-T table rules: conditions, exhaustion, DM screen, mastery, encounter math, Spells page (33 tests)
- [x] M1.5 (lead): `feat_rules` takes `ruleset` (SUBCLASS_ARMOR, Pact Boon and named-cantrip prerequisites); DB-level `server_default` on the ruleset columns (a fresh DuckDB crashed without it). Full suite: 1430 passed.
- [x] M2-B builder: 2014 races, subraces, Half-Elf picks, Acolyte and book backgrounds, known/prepared casting, Wizard spellbook, choices, kits (29 tests)
- [x] M2-L level-up: plan and apply, guide, class choices, 2014 feature listing, daily preparers, ruleset-aware spell and feature panels (32 tests)
- [x] M2-A turn kit (added): the phone's Now tab for 2014 PCs (actions, Lay on Hands as an action, Divine Smite on hit, ki costs, 2014 breath weapon); 2024 kits snapshot-identical (28 tests)
- [x] M3 (lead): `feat_rules` helpers made public; the panels pass the PC's ruleset; Mystic Arcanum recorded, not learned (builder and level-up agree); MapBuilder labels; Terms (SRD 5.1 attribution plus a 5e-database credit), Guide, landing line, data dictionary, ARCHITECTURE invariant 9, TD-131a–m; phone screenshots at 390 px (race, scores, spells, level-up guide, Rules card). Full suite: 1519 passed; tsc, eslint (branch files) and the build are clean.
- [ ] Merge to main and push (waiting on Justin)

---

## Surprises and Discoveries
- 2014 leftovers already exist:
  - Monsters are SRD 5.1 (`integrations/dnd_rules/stat_blocks.py`).
  - `_SUBCLASS_KEYWORDS` maps 2014 subclass names onto 2024 keys (`class_features_2024.py:590`).
  - The SessionHud "Exhausted" tooltip uses 2014 text (`frontend/src/pages/SessionHud.tsx:160`).
  - `encounter_math.py` keeps 2014 alias properties.
- `_DAILY_PREPARERS` (`services/player_service.py:1325`) and `_PREPARED_CASTERS` (`services/levelup_service.py:43`) disagree on Ranger. Pre-existing, 2024 only.
- `uses_formula` and `recovery` are `String(20)` columns, so new UsesFormula values must be ≤20 chars. No DB enum type.
- **Dataset errors**, where the SRD 5.1 text wins:
  - Warlock invocations known (2/3/4 at 2/5/7)
  - Metamagic at 17
  - Wild Shape CR 1 at 8
  - Guardian of Faith missing from the Life Domain spells
  - the Rogue's ASI rows out of order
  - the Dragonborn line is 5×30 ft
  - reaction triggers stripped from casting times
- **Pre-existing 2024 bugs found (TDs, not fixed here):**
  - The long rest gives back half the Hit Dice for every PC; 2024 RAW is all.
  - The "2024" DM screen content is partly 2014 (its action list, long rest, contested grapple, Absorb Elements).
  - Bardic Inspiration never refills on a short rest from level 5, in either edition.
- 2024 never applied an exhaustion penalty automatically (it's shown as text only). 2014 starts the phone roll sheet at disadvantage, and the player can change it.
- The 2014 encounter thresholds and multipliers come from the 2014 DMG (game numbers); SRD 5.1 has no encounter-building section.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 11/01 | Scope | players' side first / all / rules-off | all, ship together | Justin |
| 11/01 | Where ruleset lives | per campaign / per character / both | campaign field + copy stamped on PC | One choice per table; PC copy avoids a campaign load in every service |
| 11/01 | Changing ruleset | free / locked once PCs exist | locked once campaign has ≥1 PC (ValueError, 422) | No conversion logic; no mixed tables |
| 11/01 | 2014 data source | hand-type / 5e-bits/5e-database JSON (MIT; content SRD 5.1, CC-BY-4.0) | dataset, read from a local path by scripts | Complete (319 spells, 12 classes, level tables, 407 features); dataset not committed |
| 11/01 | Code shape | if/else everywhere / same-interface data modules + dispatch | `integrations/dnd_rules/rulesets.py` returns the 2014 or 2024 module | Builder/level-up already data-driven via BuilderOptions |
| 11/01 | Spell catalog | separate table / `ruleset` column | `spells.ruleset` (NULL = homebrew, valid in both) | PC spell links keep working by id |
| 11/01 | Feature catalog | shared / `ruleset` column | `class_features.ruleset` NOT NULL | Same names (Rage) with different uses |
| 11/01 | Monsters, magic items | split / shared | shared | Monsters already 5.1; items edition-neutral enough |
| 11/01 | 2014 feats | none / Grappler + book names | Grappler (only SRD 5.1 feat) + "From my book" names | SRD limit; same pattern as book subclasses |
| 11/01 | Immersive 3D arena | port / leave 2024 | leave 2024 (TD) | Private, admin-only, never marketed |
| 11/01 | Branching | main / feature branch | `feat/2014-rules`, merge at M3 | Ship together; main stays hot-fixable |
| 11/01 | 2014 spellcasting key | reuse `prepared` / new keys | `kind`, `known`, `prepared_formula`, `first_level`, `spellbook` (no `prepared`) | The frontend reads `prepared` as `number[]`; a missed branch fails loudly |
| 11/01 | Subclass strings | dataset short names / SRD headings | SRD headings ("Life Domain", "The Fiend") | Match the book players hold |
| 11/01 | Dragonborn ancestry | trait text / structured choice | `SPECIES_CHOICE_KINDS` in the class-choice shape | 2024 has no structured species choice; the builder reuses choice validation |
| 11/01 | Unlimited uses (Rage, Wild Shape at 20) | sentinel / 0 | max_uses 0 (no counter) | Existing "passive" display |
| 11/01 | 2014 encounter bands | new enum / reuse | Easy=LOW, Medium=MODERATE, Hard=HIGH, Deadly=DEADLY; labelled per ruleset | No DB change |
| 11/01 | Species trackers (Breath Weapon) | add / skip | skip | The catalog is class-only (`character_class` required) |

---

## Context and Orientation

### Key terms defined
- **Ruleset**: `"2024"` (SRD 5.2.1, current default) or `"2014"` (SRD 5.1).
- **SRD**: System Reference Document, the free subset of D&D rules. 5.1 = 2014, 5.2.1 = 2024. Both are CC-BY-4.0, so attribution is required (Terms page).
- **Known caster (2014)**: Bard, Ranger, Sorcerer and Warlock learn a fixed number of spells from a table. They can swap 1 on level-up.
- **Prepared caster (2014)**: Cleric, Druid and Wizard prepare ability mod + level each day; Paladin prepares mod + half its level. The Wizard prepares from a spellbook (6 spells at level 1, +2 per level).
- **2014 vs 2024 builder differences**:
  - Ability bonuses come from race (Half-Elf +2 CHA plus two +1s of choice; Human +1 to all), not from background.
  - There are no origin feats.
  - Subraces exist: Hill Dwarf, High Elf, Lightfoot Halfling, Rock Gnome.
  - Subclass level: Cleric, Sorcerer and Warlock at 1; Druid and Wizard at 2; the rest at 3.
  - Half casters (Paladin, Ranger) have no spells or slots at level 1. From level 2 their slot table matches 2024.
  - There is no weapon mastery.
  - Level 19 is an ASI, not an Epic Boon.
- **2014 exhaustion**: 6 levels with cumulative effects, and no d20 penalty:
  1. Disadvantage on ability checks.
  2. Speed halved.
  3. Disadvantage on attacks and saves.
  4. HP max halved.
  5. Speed 0.
  6. Death.

  (2024: −2 per level to d20 tests and −5 ft speed per level.)
- **2014 long rest**: regain half your total Hit Dice (minimum 1). (2024: all.)
- **2014 encounter math**: per-character XP thresholds (easy/medium/hard/deadly) × a monster-count multiplier. (2024: a budget with no multiplier.)
- **Dataset**: `F:\Temp\claude\srd51\5e-database-main\src\2014\en\5e-SRD-*.json`. Read-only input, never committed. Scripts take it as a path argument; run Python on it with `-I`.

### Architecture layers involved
domain (enums, columns), db/repos (SpellRepo filter), services (builder, levelup, feature, rest, player, campaign, spell, character), integrations/dnd_rules (data plus dispatch), api (schemas pass through), frontend.

Layer rules: integrations imports only domain/stdlib; services import integrations via `rulesets.py`; repos stay logic-free.

### Contracts (M0 delivers; every later step relies on them)
1. `domain/enums.py`: `class Ruleset(str, Enum): R2024 = "2024"; R2014 = "2014"`.
2. Columns, all `VARCHAR(4)`, in migration `alembic/versions/0061_rulesets.py`:
   - `campaigns.ruleset`: NOT NULL, default `'2024'`.
   - `player_characters.ruleset`: NOT NULL, default `'2024'`.
   - `class_features.ruleset`: NOT NULL, default `'2024'`.
   - `spells.ruleset`: NULL allowed. Backfill `'2024'` where `created_by_email IS NULL`. Homebrew rows stay NULL, meaning valid in both rulesets.
3. Invariant: `pc.ruleset == campaign.ruleset`.
   - `character_service.create_character` stamps it from the campaign.
   - `campaign_service.update_campaign` raises ValueError when changing ruleset on a campaign with PCs.
4. `integrations/dnd_rules/rulesets.py`:
   - `options(r)` returns `srd_character_options_2014|2024`.
   - `levelup(r)` returns `levelup_2014|2024`.
   - `class_features(r)` returns `CLASS_FEATURES_2014|2024`.
   - `spell_seed(r)` returns the spell seed list.
   - Imports are lazy and `r` accepts a str or a Ruleset.
5. `SpellRepo.list_all(..., ruleset=None)` and `get_by_name(..., ruleset=None)`: when `ruleset` is given, filter `ruleset == r OR ruleset IS NULL`.
6. `character_service.compute_spell_slots(cls, level, ruleset="2024")`: for 2014, Paladin and Ranger at level 1 get `{}`.
7. Read models gain `ruleset`:
   - `CampaignRead`/`CampaignCreate`/`CampaignUpdate`
   - `PlayerCharacterRead` (the phone and DM sheets get it free)
   - `BuilderOptions.ruleset`, set in M2-B
   - the level-up plan's `ruleset`, set in M2-L

   Frontend: `frontend/src/lib/ruleset.ts` exports `type Ruleset = "2024" | "2014"` and `rulesetLabel()`. The `Campaign` TS type gains `ruleset`. The new-campaign form and campaign settings get a Rules picker, disabled with a reason once PCs exist.

### 2014 data module interface (M1-D1/D2)
2014 modules export **every public name the 2024 module exports that services or BuilderOptions read**, with the same shapes. Find them with `grep -rn "srd\.\|rules\." services/ api/` and the `_options` body in `services/character_builder_service.py:122`.

A name with no 2014 meaning gets an empty value (`ORIGIN_FEATS = []`, `WEAPON_MASTERY_FILTER = {}`, `CASTER_SUBCLASSES = set()`).

Names only 2014 has:
- `SPECIES[i]`: `ability_bonuses: dict[str,int]`, `ability_choice: {"choose","amount","exclude"} | None`, `skills: list[str]`, `skill_choice: int`, `subraces: [{name, ability_bonuses, traits, hp_per_level?, cantrip_choice?}]`.
- `BACKGROUNDS[i]`: `abilities: []`, `feat: None`.
- `CLASSES[c]["spellcasting"]`: `kind: "known"|"prepared"`, `known: list[int]` (20 levels; known casters), `prepared: "level"|"half_level"` (prepared casters), `first_level: 1|2`, `spellbook: bool`.
- Helpers: `spells_known(cls, level)`, `spells_prepared(cls, level, mod)`.

Plain-language style matches the 2024 modules (Plan 128). SRD 5.1 wording may be condensed.

### Ownership (agents edit only their files; no agent commits; lead commits per milestone)
- **D1**: `integrations/dnd_rules/srd_character_options_2014.py`, `tests/test_services/test_plan131_data_options.py`
- **D2**: `integrations/dnd_rules/levelup_2014.py`, `tests/test_services/test_plan131_data_levelup.py`
- **S**: `scripts/build_srd51_spells.py`, `integrations/dnd_rules/srd_spells_2014.py`, `services/spell_service.py`, `api/routers/spells.py`, spell seeding in `api/main.py`, `tests/test_services/test_plan131_spells.py`
- **F**: `integrations/dnd_rules/class_features_2014.py`, UsesFormula additions in `domain/enums.py`, `services/feature_service.py`, `services/rest_service.py`, feature seeding in `api/main.py`, `tests/test_services/test_plan131_features.py`
- **T**:
  - `frontend/src/lib/conditions.ts`
  - `frontend/src/pages/SessionHud.tsx` (conditions only)
  - `frontend/src/components/dm-screen/*`
  - `ExhaustionTracker.tsx`
  - `frontend/src/pages/player/Conditions.tsx`
  - `frontend/src/pages/player/rules.ts` (conditions/exhaustion only)
  - weapon-mastery display and `services/attack_service.py`
  - the exhaustion penalty in `services/player_service.py`
  - `integrations/dnd_rules/encounter_math.py` + encounter UI
  - DM Spells page filter
  - `tests/test_services/test_plan131_table.py`
- **B** (after D1, D2): `services/character_builder_service.py`, `domain/character_builder.py`, `frontend/src/components/character-wizard/*`, `tests/test_services/test_plan131_builder.py`
- **L** (after D1, D2): `services/levelup_service.py`, `domain/level_up.py`, `frontend/src/components/**/LevelUpGuide*`, `_DAILY_PREPARERS` in `services/player_service.py`, `frontend/src/pages/player/rules.ts` (preparers only), `tests/test_services/test_plan131_levelup.py`

Every 2024 test must still pass unchanged. A 2024 campaign must behave exactly as before.

---

## Concrete Steps

### M0 — foundation (lead)
1. `domain/enums.py`: add `Ruleset`.
2. `domain/campaign.py`:
   - `ruleset: str = "2024"` on `Campaign`, `CampaignCreate` and `CampaignRead`.
   - `CampaignUpdate.ruleset: Optional[Ruleset]`.
   - Validate with Pydantic against Ruleset.
3. `domain/character.py`: `ruleset` on `PlayerCharacter`, `PlayerCharacterCreate` and `PlayerCharacterRead`. `ClassFeature.ruleset`, `ClassFeatureCreate.ruleset` and `ClassFeatureRead.ruleset` (default `"2024"`).
4. `domain/spell.py`: `Spell.ruleset: Optional[str]`, plus `SpellCreate`/`SpellRead` (default None on create; seeds set it).
5. `alembic/versions/0061_rulesets.py`: four columns and the backfill. `db/base.py`: add the columns to the DuckDB patch list if that file patches columns.
6. `services/campaign_service.py`: accept ruleset on create; refuse a change when PCs exist.
7. `services/character_service.py`: stamp `ruleset` in `create_character`; add the `compute_spell_slots` ruleset param and pass `campaign.ruleset`.
8. `db/repos/spell_repo.py`: ruleset filter (Contract 5).
9. `integrations/dnd_rules/rulesets.py`: dispatch (Contract 4). Imports are lazy, so the missing 2014 modules don't break import.
10. Frontend:
    - `frontend/src/lib/ruleset.ts`
    - the Campaign type
    - `frontend/src/pages/Campaigns.tsx` new-campaign form: Rules select with a one-line explainer
    - campaign settings: the same picker, disabled with "Locked: this campaign already has characters."
    - a small "2014 rules" chip on campaign cards
11. `tests/test_services/test_plan131_foundation.py`:
    - default 2024
    - create a 2014 campaign
    - PC stamped
    - change refused with PCs, allowed without
    - SpellRepo filter
    - 2014 half-caster slots

**Verify:** `pytest -q`, `alembic upgrade head` on DuckDB tests, tsc and eslint all pass.

### M1 (parallel: D1, D2, S, F, T). Briefs restate the relevant sections above.
- **D1:**
  - Races and subraces from `5e-SRD-Races.json`, `5e-SRD-Subraces.json` and `5e-SRD-Traits.json`.
  - Acolyte from `5e-SRD-Backgrounds.json`.
  - Classes from `5e-SRD-Classes.json` and `5e-SRD-Levels.json`: hit die, saves, skills, armor, `subclass_level`, `srd_subclasses` (2014 names), the spellcasting block, and kits from starting equipment plus its options.
  - Verify: data-integrity tests (12 classes; 20-entry tables; subclass levels 1/2/3 as listed; Half-Elf choice).
- **D2:**
  - Per-level class and subclass features from Levels.json and Features.json.
  - FEATURE_NOTES (plain words).
  - ASI levels (Fighter 6 and 14; Rogue 10; 19 is an ASI).
  - `FEATS=[Grappler]`.
  - Choice kinds:
    - Fighting Style (Fighter 1, Paladin 2, Ranger 2; Champion 10)
    - Expertise (Rogue 1 and 6; Bard 3 and 10)
    - Favored Enemy (1/6/14) and Natural Explorer (1/6/10)
    - Draconic Ancestry (Sorcerer 1)
    - Land circle (Druid 2)
    - Hunter's Prey/Defensive Tactics/Multiattack/Superior Hunter's Defense (3/7/11/15)
    - Pact Boon (3)
    - Invocations (2,3,4,5,6,7,8 known at 2,5,7,9,12,15,18; SRD 5.1 list with prerequisites)
    - Metamagic (2 at 3, +1 at 10 and 17)
    - Mystic Arcanum (11/13/15/17)
    - Magical Secrets (Bard 10/14/18; Lore 6)
  - Always-prepared tables: Life Domain, Devotion, Land circle spells.
  - EXTRA_SPELL_LISTS: Fiend expanded list.
  - SPELL_SWAP for known casters.
  - Verify: integrity tests plus a comparison against Levels.json counts.
- **S:**
  - Generator: `python -I scripts/build_srd51_spells.py <dataset dir>` writes `srd_spells_2014.py`. It maps fields like `scripts/parse_srd_spells.py`, with `source="SRD 5.1 (2014)"` and `ruleset="2014"`.
  - Startup seed adds 2014 rows when none exist (prod already has 2024 rows).
  - The DM catalog list API takes `?ruleset=`.
  - Verify: 319 rows; Fireball exists in both rulesets; filter tests.
- **F:**
  - 2014 trackers:
    - Rage 2/3/4/5/6 at 1/3/6/12/17, long rest
    - Bardic Inspiration CHA mod, long rest (short from 5)
    - Channel Divinity 1/2/3 at 2/6/18, short rest
    - Wild Shape 2, short rest
    - Second Wind 1, short rest
    - Action Surge 1 (2 at 17), short rest
    - Indomitable 1/2/3 at 9/13/17, long rest
    - Ki = level, short rest
    - Divine Sense 1+CHA, long rest
    - Lay on Hands 5×level
    - Sorcery Points = level from 2
    - Arcane Recovery 1
    - Natural Recovery (Land) 1
    - Cleansing Touch CHA
    - Dragonborn Breath Weapon 1, short rest; Half-Orc Relentless Endurance 1, long rest (if the 2024 catalog tracks species features)
  - Catalog key includes ruleset; `_qualifies` matches `pc.ruleset`.
  - rest_service: 2014 long rest restores half the Hit Dice (minimum 1).
  - Verify: tests per tracker and rest.
- **T:**
  - 2014 condition text from `5e-SRD-Conditions.json` (plain style).
  - 2014 exhaustion table, with no d20 penalty in 2014.
  - A 2014 DM screen variant: no Study/Influence/Utilize actions; Use an Object instead.
  - Mastery hidden in 2014.
  - 2014 encounter thresholds and multiplier.
  - Spells page ruleset filter, defaulting to the active campaign.
  - Verify: tests and tsc.

### M2 (parallel: B, L)
- **B:** the builder honors `rulesets.options(c.ruleset)` and `rulesets.levelup(c.ruleset)`.
  - CharacterBuild gains `subrace` and `ability_choice`.
  - 2014 validation: racial bonuses, Half-Elf choice and skills, no origin feat, subclass at `subclass_level`, known/prepared counts, spellbook, half casters get no spells at level 1, kits.
  - The wizard branches on `options.ruleset`: race and subrace step; no background bonus; no origin feat; 2014 spell step counts.
  - `_catalog` passes the ruleset.
  - Verify: build Cleric 1 (Life), Wizard 3 (Evocation), Paladin 2, Half-Elf Bard 1, Hill Dwarf Fighter 4 with ASI.
- **L:** `_build_plan` is ruleset-aware: 2014 features, subclass level, known-caster learn/swap, prepared counts, Wizard +2, cantrips, ASI-or-feat, choice kinds.
  - Daily preparers for 2014: Cleric, Druid, Paladin, Wizard.
  - LevelUpGuide branches on `plan.ruleset`.
  - Catalog lookups pass the ruleset.
  - Verify: level-ups 1→2 Paladin, 2→3 Warlock (pact boon), 4 ASI or Grappler, Sorcerer 3 metamagic.

### M3 (lead)
- End-to-end API test in a 2014 campaign: build, level up, trackers, rest.
- Phone-width screenshots of the 2014 wizard and level-up (WebKit at `F:\ms-playwright`).
- Docs:
  - `docs/data_dictionary.md` (4 columns)
  - `ARCHITECTURE.md` (rulesets dispatch)
  - `frontend/src/pages/TermsPage.tsx` SRD 5.1 attribution
  - `frontend/src/pages/GuidePage.tsx` (#rules; replace the "2014 still work" line)
  - `docs/QUALITY.md` (TDs)
- Full gate, merge to main, push after telling Justin.

---

## Validation and Acceptance
- [ ] `pytest -q` passes. The 2024 tests are unchanged.
- [ ] black, isort, flake8 and interrogate are clean; pip-audit passes; tsc, eslint and the vite build pass.
- [ ] A new campaign with Rules = 2014, built on a phone through the join link, produces:
  - a Half-Elf Bard with +2 CHA and two chosen +1s;
  - no origin feat step;
  - 4 known spells and 2 cantrips;
  - the Bardic Inspiration tracker.
- [ ] A 2014 Cleric picks Life Domain at level 1, and its domain spells are always prepared.
- [ ] A 2014 Paladin at level 1 has no spell step and no slots; at level 2, the level-up guide adds 2 slots and a prepared count of CHA + 1.
- [ ] A 2014 Warlock's level-up to 3 offers a Pact Boon, and to 2 offers 2 invocations.
- [ ] In a 2014 campaign:
  - Exhaustion 1 shows "disadvantage on ability checks", with no −2 on rolls.
  - The DM screen shows 2014 actions.
  - Weapon mastery is hidden.
  - Encounter difficulty uses the 2014 thresholds.
- [ ] Changing a campaign's rules after a PC exists is refused with a plain message.
- [ ] Existing campaigns read as 2024 and behave as before.

---

## Idempotence and Recovery
- The branch `feat/2014-rules` holds all the work, with one lead commit per milestone.
- Restart from the Progress checkboxes.
- Migration 0061 is additive and safe to re-run on a fresh DB; never downgrade.
- The generator script is deterministic and can be re-run.
- The startup seeds are insert-if-missing.

---

## Interfaces and Dependencies
**Produces:**
- `Ruleset`
- `rulesets.py` dispatch
- the 2014 data modules
- `ruleset` on campaign, PC, spell and class feature
- ruleset-aware builder, level-up, trackers, rest, conditions, DM screen and encounter math

**Depends on:**
- the 2024 modules (unchanged)
- the 5e-database SRD 5.1 JSON, local only (MIT; content CC-BY-4.0)

---

## Outcomes and Retrospective
_Fill in after completion._
