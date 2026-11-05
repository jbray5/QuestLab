# Plan 00135 — Beta feedback round 2 (James): race speeds and natural weapons, subclass counters, homebrew feats, weapons by edition

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-11-04
**Last updated:** 2026-11-04
**Implemented by:** Claude (lead: foundation, merge) + four subagents (RA, RS, FT, WP)

---

## Purpose
James (a beta DM running a 2014 Zelda campaign) sent nine more notes on 11/04. Justin asked for the ones that make sense, as founder calls.

**Triage**

| # | Note | Call |
|---|---|---|
| 1 | Races with fly, swim or climb speeds | **Build** (RA) |
| 2 | Natural weapons on custom races | **Build** (RA) |
| 3 | Edit an NPC cleric's class features; custom classes (Artificer, third-party) | **Not now.** A class system is large and niche. Forgetting a feature on the sheet already works, and RS's hand-made counters cover the rest. Logged as TD-135a. |
| 4 | Weapons page only has the 2024 list; 2014 magic weapons are missing | **Build** (WP) |
| 5 | Weapon mastery (Sap, Topple) shows; a toggle would do | **Build** (WP): the page gets a 2014/2024 switch |
| 6 | Subclass resource counters (Superiority Dice) with a die that grows | **Build** (RS) |
| 7 | Custom feats; bake in Sharpshooter's −5/+10 | **Build** (FT; the −5/+10 trade is RA's, on attacks) |
| 8, 9 | Custom subclass is name only; custom race is bonuses only | **Done in Plan 133.** These are the oldest notes in the list, filed from the builder before it went live. |

When this is done:
- A DM's homebrew race can have fly, swim, climb and burrow speeds, which land on the sheet.
- A homebrew race can have natural weapons, which show as attacks on the sheet and phone.
- A homebrew subclass can have counters whose uses and die grow with level. Any character can get a hand-made counter (for a book subclass like Battle Master). Both refill on rests.
- A DM can make homebrew feats, which the builder and level-up offer. A feat can carry a "−5 to hit / +10 damage" trade that attacks offer as a toggle.
- The Weapons page has a 2014/2024 switch (2014 hides mastery and the 2024-only firearms) and lists magic weapons.

---

## Progress
- [x] Foundation (lead, b5cf0e8): models, migration 0063, feat repo + service + routes, race speeds copied to the PC, frontend types; 32 service + 4 API tests
- [x] RA: race speeds and natural weapons (form, sheet, phone attacks) and the power-attack toggle (29 tests)
- [x] RS: counters (migration 0064, service, routes, rests, sheet + phone, subclass form) (33 tests)
- [x] FT: homebrew feats (catalog tab + form; builder + level-up + fighting-style choices; 2014 feat-text check) (23 tests)
- [x] WP: Weapons page edition switch, magic weapons listed, 14 missing SRD 5.1 magic weapons synced at startup (27 tests)
- [x] Lead merge fixes: attack preview made DM-only (was any signed-in user; also took a repo import out of the router), nav label, Guide paragraph, docs
- [x] Gate, commit (551003b); push approved by Justin 11/04

---

## Surprises and Discoveries
- **C: ran out of space mid-wave.** It was at 22 MB free, and one test failed with ENOSPC. 1.7 GB of Visual Studio installer temp and WSL crash dumps were moved to `F:\Temp\c-temp-moved-2026-11-04` (robocopy /MOVE; nothing deleted). This session's own transcript is about 1.4 GB of `.claude`.
- **Pre-existing hole:** `POST /items/{id}/attack-preview` let any signed-in user preview any PC by id. It now uses `attack_service.attack_preview_for_dm` (403 for others).
- **"Pulling 2024 feat information":** FT probed every 2014 path and found no 2024 feat reaching a 2014 PC (pinned by 3 tests). The one call missing `ruleset=` was on a 2024-only path. James's campaign may be set to 2024, or predate Plan 131; check on prod.
- **SRD 5.1 weapon stats differ from 2024** only for Lance, Trident and War Pick; the Weapons page's 2014 view shows the 5.1 values. The sheet doesn't yet (TD-135b).
- **Non-SRD seed items:** five seeded magic items aren't in SRD 5.1 (TD-135c).
- **Where the cleanup runs:** character deletes clean up child tables in `CharacterRepo.delete`, not `character_service`, so the counters were added there.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 11/04 | Custom classes | build / defer | defer (TD-135a) | A full class system (hit dice, slots, a feature table, level-up) for one niche ask |
| 11/04 | Natural weapons | homebrew items made behind the scenes / attacks computed from the race | computed from the race | James: "so you don't have to create a homebrew weapon"; editing the race updates every PC |
| 11/04 | Sharpshooter −5/+10 | name-match book feats / a DM-set trade on homebrew feats | DM-set trade (`power_attack`) | No book text shipped; covers GWM and table variants too |
| 11/04 | Subclass counters | stored max per PC / computed from level tables | computed from the subclass's level tables; only `uses_spent` is stored | Level-ups and edits to the subclass need no sync |
| 11/04 | Weapon mastery for 2014 tables | a per-campaign house rule / a page switch | page switch only | James: "a toggle for these would be all that's needed" |
| 11/04 | Missing magic weapons on existing DBs | data migration / startup sync | startup sync by name, only the new list | `seed_magic_items` only fills an empty table; syncing only the new list means an item an admin deleted never comes back |
| 11/04 | Power-attack offer on the sheet preview | anyone / the campaign DM | the campaign DM | A homebrew feat is the DM's; the preview route was open to any signed-in user |
| 11/04 | Players and counters | full edit / spend and restore | spend and restore | Matches the player feature routes |
| 11/04 | Epic boon homebrew feats | 19+ in 2024 only / 19+ in both | 19+ in both | 2014 has no level-19 boon; it stops an early pick |

---

## Context and Orientation
- **Homebrew (Plan 133):**
  - `domain/homebrew.py`, `db/repos/homebrew_repo.py`, `services/homebrew_service.py` (`for_campaign`, `race_for`, `subclass_for`), `api/routers/homebrew.py`.
  - UI: `frontend/src/pages/HomebrewOptions.tsx` and `frontend/src/components/homebrew/{RaceForm,SubclassForm,FormFrame}.tsx`.
- **Feats:**
  - The rules tables are `rulesets.levelup(r).FEATS` / `FEATS_BY_NAME`; a PC stores feat names in `pc.feats` (a JSON list).
  - The builder validates through `services/feat_rules.py` and `services/character_builder_service.py`; the level-up through `services/levelup_service.py`.
  - UI: `components/character-wizard/AsiStep.tsx` and `pages/LevelUpGuide.tsx`.
- **Attacks:** `services/attack_service.compute_attack` and `frontend/src/components/character-sheet/AttacksList.tsx`, plus the phone's attack view (`pages/player/`).
- **Trackers:**
  - Data: `class_features` (catalog) + `character_features` (per PC, `uses_spent`).
  - Code: `services/feature_service.py`, `api/routers/features.py`, `frontend/src/components/FeaturePanel.tsx`.
  - Rests: `services/rest_service.py`.
- **Weapons:** `services/item_service.list_weapons` keeps items with `weapon_category` and `damage_die`, so the seeded magic weapons ("Weapon (any sword)", no die) never show. The data is in `integrations/dnd_rules/srd_weapons_2024.py` and `integrations/dnd_rules/magic_items.py`.

---

## Shapes (foundation, 0063)
- **`homebrew_races.speeds`** (JSON, nullable): `{"fly": 30, "swim": 30, "climb": 30, "burrow": 10}`. Keys from `SPEED_KINDS`; 5–120 ft in steps of 5.
- **`homebrew_races.natural_weapons`** (JSON, NOT NULL, `[]`), at most 4: `[{"name": "Claws", "damage": "1d6", "damage_type": "slashing", "ability": "STR" | "DEX" | "best", "note": ""}]`.
- **`homebrew_subclasses.resources`** (JSON, NOT NULL, `[]`), at most 4:
  - Shape: `[{"name": "Superiority Dice", "level": 3, "recovery": "short" | "long", "uses": {"3": 4, "7": 5, "15": 6} | null, "uses_formula": null | "prof_bonus" | "prof_x2" | "level" | "half_level" | "STR".."CHA", "die": {"3": "d8", "10": "d10", "18": "d12"} | null, "text": ""}]`.
  - Exactly one of `uses` and `uses_formula` is set. A `uses` table needs an entry at `level`.
  - Use `SubclassResource.state_at(pc_level, scores, prof)` → `(max_uses, die)`, or None before `level`.
- **`player_characters.speeds`** (JSON, nullable): the same dict. The builder copies it from a homebrew race; the sheet's edit form changes it.
- **`homebrew_feats`** (new table):
  - Columns: `id`, `created_by_email`, `name`, `ruleset`, `category` ("general" | "origin" | "fighting_style" | "epic_boon"), `blurb` (≤ 300), `description` (≤ 3000), `prerequisite` (free text ≤ 200, shown, not enforced), `asi_options` (JSON: null | "any" | ["STR", …]), `repeatable`, `power_attack` (JSON: null | `{"to_hit": -5, "damage": 10, "weapons": "ranged" | "heavy" | "melee" | "any"}`), and timestamps.
  - Service: `homebrew_service.{list,create,update,delete}_feat`, `feats_for_campaign(db, campaign)`, `feat_for(db, campaign, name)`.
  - Routes: `/homebrew/feats` CRUD.
  - Names are unique per DM and may not be an SRD feat of either edition. A feat can't be deleted or renamed while a character in the author's campaigns has it.
- **`character_resources`** (RS, 0064): per-PC counters, `source` "custom" | "subclass".

---

## Files and ownership (wave 2)
- **RA:**
  - Owns: `components/homebrew/RaceForm.tsx`, `services/attack_service.py`, `components/character-sheet/AttacksList.tsx` and `CharacterSheet.tsx` (speeds chip).
  - Owns the speed fields in `pages/Characters.tsx` and the phone's attack and speed display (`pages/player/*`, except files RS names).
  - Owns the attack routes in `api/routers/items.py` and new tests.
- **RS:**
  - Owns: `domain/character.py` (append-only), `alembic/versions/0064_*`, `db/repos/resource_repo.py`, `services/resource_service.py`, `api/routers/resources.py` (+ `api/main.py` include).
  - Owns: `services/rest_service.py`, `components/FeaturePanel.tsx` (or a new `ResourcePanel.tsx`), `components/homebrew/SubclassForm.tsx`, the phone's tracker view and `db/base.py` (0064 lines), plus new tests.
- **FT:**
  - Owns: `pages/HomebrewOptions.tsx` (Feats tab), the new `components/homebrew/FeatForm.tsx`, and `services/feat_rules.py`.
  - Owns: `services/character_builder_service.py`, `services/levelup_service.py`, `domain/level_up.py`, `components/character-wizard/AsiStep.tsx`, `pages/LevelUpGuide.tsx` and new tests.
- **WP:**
  - Owns: `services/item_service.py` (`list_weapons`), the weapons route in `api/routers/items.py`, `pages/Weapons.tsx`, `integrations/dnd_rules/magic_items.py` (additions) and new tests.
- **Shared, additive only (re-read before each edit):** `frontend/src/api/types.ts`, `frontend/src/api/homebrew.ts`, `docs/QUALITY.md` (report rows instead).

---

## Validation and Acceptance
- [x] The gate passes: pytest, black, isort, flake8, interrogate, pip-audit, tsc, eslint on changed files, vite build.
- [x] A homebrew race with fly 30 builds a PC whose sheet reads "Speed 30 ft · fly 30 ft".
- [x] A homebrew race with Claws 1d6 slashing (STR) gives a STR 16, level 1 PC an attack of +5 to hit, 1d6+3 slashing, on the sheet and the phone.
- [x] A homebrew Battle Master-style subclass (dice 4/5/6 at 3/7/15, d8/d10/d12 at 3/10/18): a level 10 PC shows 5 × d10. Spending one leaves 4. A short rest refills it.
- [x] A hand-made counter on any PC (name, max, die, recovery) works the same way.
- [x] A homebrew feat "Deadeye" (+1 DEX, −5/+10 ranged) is offered at a 2014 PC's level 4 ASI and on level-up. Taking it raises DEX. The sheet's longbow attack offers the −5/+10 toggle, and melee attacks don't.
- [x] A 2014 PC never shows 2024 feat text for a feat taken by name from the book.
- [x] The Weapons page on 2014: no mastery column or filter, no Musket or Pistol. Magic weapons (Flame Tongue, Vorpal Sword…) are listed in both editions.
- [x] Everything in 2024 and 2014 that existed before is unchanged.

---

## Idempotence and Recovery
- Branch `feat/feedback-james-2`.
- 0063 and 0064 are additive (new nullable or defaulted columns, new tables). Downgrade drops them, losing the new homebrew data only.

---

## Interfaces and Dependencies
- **Produces:**
  - The shapes above.
  - `homebrew_service.feats_for_campaign`, `feat_for`, and `SubclassResource.state_at`.
  - `GET/POST/PATCH/DELETE /homebrew/feats`.
  - RS's counter routes; WP's `?ruleset=` on `GET /weapons`.
- **Depends on:** Plan 131 (rulesets) and Plan 133 (homebrew races and subclasses).

---

## Outcomes and Retrospective
Shipped as 551003b on the b5cf0e8 foundation: 1819 tests pass, plus tsc, eslint, the vite build and the pre-commit hooks. Nothing was checked against a live Postgres. The 0063 and 0064 DDL was rendered offline with `alembic upgrade 0062:head --sql`, and the new magic weapons were checked against the Item column limits, because DuckDB ignores VARCHAR lengths.

Not built: custom classes (TD-135a). Open follow-ups: TD-135b to j.

Lessons:
- Have the lead freeze the shared shapes and migration first, then give agents strict file ownership. Four agents shared one checkout here without a conflict.
- Parallel agents write a lot of log data. Claude Code's own folder was on C: and filled it mid-wave, failing a test; `~/.claude` is now a junction to F:.
