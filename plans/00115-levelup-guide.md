# Plan 00115 — Level-up guide on the player's sheet

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete (awaiting push approval)

**Started:** 2026-10-28
**Last updated:** 2026-10-28
**Implemented by:** Claude Code

---

## Purpose
Builds the parked Plan 67 wizard. Justin: "build a level up guide with choices for each player
into the app." Party hits L4 after Session 9. DM taps **Level up** on a PC → that player's sheet
shows a gold banner → a phone-first guide walks them through *their* choices (HP, subclass,
ASI/feat, new spells, swaps) with plain-words explanations of what the new level brings → one
confirm writes it all to the sheet. Replaces the `window.prompt` level-up on the DM Characters
page and most `scripts/quick_levelup.py` relays.

---

## Progress
- [x] 1 Rules data: `integrations/dnd_rules/levelup_2024.py`
- [x] 2 Domain: `domain/level_up.py`; `pending_level` on `PlayerCharacter` (+Read/Update)
- [x] 3 Migration `alembic/versions/0054_pending_level.py`
- [x] 4 Service `services/levelup_service.py` (grant, revoke, plan_for, apply)
- [x] 5 API: `GET/POST /play/{pc_id}/level-up`; `POST/DELETE /characters/{id}/level-up`
- [x] 6 Tests: `tests/test_services/test_levelup_service.py`, `tests/test_integrations/test_levelup_rules.py`
- [x] 7 Frontend: `LevelUpGuide.tsx` route, sheet banner, DM grant button
- [x] 8 Docs: data dictionary, ARCHITECTURE codemap, Plan 67 superseded, TESTING
- [x] 9 Quality gate green (black/isort/flake8/interrogate 88.1%/pip-audit clean); frontend tsc + build green, changed files lint clean (25 pre-existing eslint errors elsewhere untouched)

---

## Surprises and Discoveries
- 2026-10-28: Level-up tests left `character_spells` rows in the shared test engine, which broke `test_spell_service`'s `delete(Spell)` on the FK (12 errors in the full run). Autouse cleanup fixture added.
- 2026-10-28: A swap list built from every known cantrip offered Willa's Aasimar Light. Swaps now draw only from class-list spells (server and UI).
- 2026-10-28: PCs carry spells from several sources (class, species, feat, subclass) with no
  source column, so "how many may you pick" = table delta (new level cap − old cap), never
  "cap − rows on the sheet". Willa has 4 cantrips but only 2 count as Druid cantrips.
- 2026-10-28: AC is a stored number and inventory armor is unreliable (Thane AC 14, no armor
  equipped in the app). The guide asks the player what armor they wear when DEX (or Monk WIS /
  Barbarian CON) rises and applies only the computed delta.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-28 | Feat policy (Plan 67 Q1) | ASI only / DM-approved feats / any feat you qualify for | Any feat you qualify for | Justin 10/24: "whatever the book says is canon"; 2024 PHB ASI feature = ASI or any feat you qualify for |
| 10-28 | Trigger (Plan 67 Q2) | DM bumps level / DM grants, player's guide bumps | DM grants (`pending_level`), guide bumps | Capability URL must not self-level; one tap for the DM; plan 67 recommendation |
| 10-28 | Feat text | Full PHB text / names + own-words one-liners | Names + one-line paraphrase, "read it in your book" | Same licensing line as Plan 74 origin feats; the book is canon |
| 10-28 | Mechanics applied | Every feat sub-rule / common structured ones | Ability +1/+2, save prof (Resilient), fixed + picked spells (Fey/Shadow Touched, Telepathic), skill + expertise picks, Tough HP, a named sub-choice | Covers every L4 pick this party is likely to make; the rest is recorded by name |
| 10-28 | Spell picks | Must fill every new slot / may leave some | May leave picks open, recorded in notes | Catalog is SRD-heavy; a book spell may be missing, never block the level |
| 10-28 | HP | Average only / roll only / both | Average, "I rolled N" (physical die), or roll on the table (Plan 66 dice) | 2024 rule allows both; in-person table rolls real dice |
| 10-28 | Multi-level grants | One level only / up to `pending_level` | Guide does one level per run, banner stays until `pending_level` reached | Book levels one at a time; each level has its own choices |

---

## Context and Orientation

### Files touched
- `integrations/dnd_rules/levelup_2024.py` (new) — per-class feature names by level, ASI levels,
  feat catalog, scaling notes, swap rules, HP bonuses
- `domain/level_up.py` (new) — `LevelUpPlan`, `LevelUpChoices`, `FeatChoice`, `SpellSwap`, `LevelUpResult`, `LevelUpGrant`
- `domain/character.py` — `pending_level` on `PlayerCharacter`, `PlayerCharacterRead`, `PlayerCharacterUpdate`
- `alembic/versions/0054_pending_level.py` (new)
- `services/levelup_service.py` (new)
- `api/routers/play.py`, `api/routers/characters.py`
- `tests/test_services/test_levelup_service.py` (new), `tests/test_integrations/test_levelup_rules.py` (new)
- `frontend/src/pages/LevelUpGuide.tsx` (new), `frontend/src/App.tsx`, `frontend/src/api/play.ts`,
  `frontend/src/api/characters.ts`, `frontend/src/api/types.ts`, `frontend/src/pages/PlayerView.tsx`,
  `frontend/src/pages/Characters.tsx`
- `docs/data_dictionary.md`, `ARCHITECTURE.md`, `docs/TESTING.md`, `plans/00067-levelup-wizard.md`

### Architecture layers involved
integrations (pure rules data, no I/O) ← services (all validation + authz) ← api (transport).
domain holds request/response models. Player routes have no `CurrentUser`: the PC UUID is the
capability; the service only touches that PC and only when the DM granted a level.

### Key terms defined
- **pending_level** — nullable int on `player_characters`. DM sets it (level+1); the player's
  guide may raise `level` up to it; cleared when reached.
- **ASI level** — level whose class feature is "Ability Score Improvement": 4/8/12/16/19 for all,
  plus Fighter 6/14, Rogue 10. Player takes the ASI feat (+2 one / +1 two, max 20) or any feat
  they qualify for.
- **Half-feat** — a general feat that also gives +1 to one listed ability.
- **Delta pick** — new cantrips/spells allowed = class table at new level − at old level.

---

## Concrete Steps

### Step 1: rules data
**File:** `integrations/dnd_rules/levelup_2024.py` (create)
**Details:** `CLASS_LEVEL_FEATURES[class][level] -> [names]` (SRD 5.2.1 class tables, all 12 classes);
`asi_levels(class)`; `FEATS` list of dicts `{name, category (general|origin|fighting_style),
blurb, prereq {any_ability: {ABIL: 13}, spellcasting, armor, fighting_style}, asi_options
(list | "any" | None), save_prof, fixed_spells, spell_pick {level, schools}, skill_pick {count,
from, upgrade}, expertise_pick, choice {label, options}, hp_per_level, repeatable, good_for
[classes]}`; `feat_qualifies(feat, scores, class, armor_training, has_fighting_style, feats)`;
`scaling_notes(class, old, new) -> [str]` (prof bonus, cantrip tier, Sneak Attack, Rage, Martial
Arts, Focus/Sorcery points, Lay on Hands, Wild Shape CR, Bardic die, Channel Divinity,
invocations, metamagic); `CANTRIP_SWAP_CLASSES`, `SPELL_SWAP_CLASSES`; `HP_PER_LEVEL_SUBCLASS`.
**Verify:** `tests/test_integrations/test_levelup_rules.py`.

### Step 2: domain
**Files:** `domain/level_up.py` (create); `domain/character.py` (add `pending_level: Optional[int]`
`ge=1, le=20` to table, Read, Update).

### Step 3: migration
**File:** `alembic/versions/0054_pending_level.py` — `add_column player_characters.pending_level Integer NULL`.
**Verify:** `alembic upgrade head` on DuckDB test session via tests; prod on deploy.

### Step 4: service
**File:** `services/levelup_service.py`
- `grant(db, pc_id, dm_email, to_level=None)` DM-owner check, `to_level` default level+1, ≤20, > level.
- `revoke(db, pc_id, dm_email)`.
- `plan_for(db, pc_id) -> LevelUpPlan` player scope; ValueError if no grant.
- `apply(db, pc_id, choices) -> LevelUpResult`: validate everything first, then one
  `character_service.update_character` (level, hp, scores, saves, skills, feats, subclass, ac,
  notes, pending_level) → slots recompute + feature sync + pc.updated ride along; then
  learn/forget spells via `spellcasting_service`.
- HP gain = max(1, die part + new CON mod) + (new CON mod − old) × old level + Tough (+2/level,
  retro when taken now) + Dwarf +1 + Draconic Sorcery +1.

### Step 5: API
`api/routers/play.py`: `GET /play/{pc_id}/level-up` (404 no grant), `POST /play/{pc_id}/level-up`
(422 invalid). `api/routers/characters.py`: `POST /characters/{id}/level-up` body
`LevelUpGrant{to_level?}`, `DELETE /characters/{id}/level-up`.

### Step 6: tests (goldens from the live party, L3→4)
Willa d8 avg → 28; Nya d6 + Tough → 34; Creed d10 → 28; Thane d8 → 29. Willa 1 cantrip + 1
spell; Nya 1 + 1 + swaps allowed; Creed 0 + 1; Thane 0 + 0. Feat prereqs (CHA 8 blocks Actor;
Creed sees fighting-style feats; taken non-repeatable feats hidden). ASI cap 20; Resilient adds
save; Tough taken at 4 adds 8; CON +1 to even adds retro HP; no grant → ValueError; over-cap
picks → ValueError; pending_level 5 keeps banner after 3→4.

### Step 7: frontend
`/play/:pcId/level-up` (LevelUpGuide.tsx, Plan 74 creator look): steps What's new → Hit points →
Subclass (if due) → Feat (if ASI level) → Spells (if any picks/swaps) → Review. Banner on
PlayerView when `pending_level > level`. Characters.tsx: "⬆ Level up" grants (party-wide
button too); pending PCs show "Guide ↗" + "Cancel".

### Step 8: docs — data dictionary row, ARCHITECTURE services + pages rows, Plan 67 → superseded.

---

## Validation and Acceptance
- [ ] `pytest -q` passes; `black . && isort . && flake8 && interrogate -c pyproject.toml` clean; `pip-audit` clean
- [ ] `npm run build` + `npm run lint` clean in `frontend/`
- [x] Local: grant Willa → `/play/<id>` shows banner → guide → +2 WIS, Shillelagh, Moonbeam →
      sheet shows L4, HP 28, WIS 18, slots 4/3, banner gone, notes line added
- [ ] Prod (after Justin approves push): same on the real party

---

## Idempotence and Recovery
Rules/service/tests re-runnable. Migration additive (nullable). `apply` validates before writing;
a crash mid-spells leaves level done + some spells → DM fixes via sheet; re-grant not needed.

---

## Interfaces and Dependencies
**Produces:** `pending_level` column; 4 routes above; `levelup_service`; `LevelUpGuide` page.
**Depends on:** `srd_character_options_2024` (class tables), `character_service.update_character`
(slot recompute, feature sync, pc.updated), `spellcasting_service.learn_spell/forget_spell`,
`SpellRepo`, Plan 66 `/play/{pc_id}/roll`.

---

## Outcomes and Retrospective
2026-10-28: built and verified locally (copy of the live party on a scratch DuckDB, headless Chrome at
390 px): Willa 21→28 HP, WIS 18, slots 4/3, Elementalism + Moonbeam learned, banner cleared; Thane
Skulker (DEX 17, no AC question since the modifier holds); Nya's swap lists only Sorcerer spells; DM
page shows "Level 4 guide ↗" + cancel. Fixed during the run: cramped feature rows, an over-long feat
screen (popular first, catalog behind "Browse all"), stale spell DC after a level (invalidate every
query keyed by the PC). Not yet deployed: needs Justin's push approval; migration 0054 runs on deploy.
