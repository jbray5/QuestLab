# Plan 00128 — Persona run 3 fix wave

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-31
**Last updated:** 2026-10-31
**Implemented by:** Claude Code (six parallel groups with separate file ownership)

---

## Purpose
Six persona testers drove the friends-beta build
([synthesis](../docs/research/persona-field-test-2026-10-run3.md)). Two regressions were fixed the
same day in `5a9f352`:
- the phone didn't follow the turn;
- the HUD's Table roll returned a 500.

This plan fixes the rest before Justin sends the beta invites. Two requirements drive it:
- Justin's own: "creating a character … specific to all rules as you make choices".
- Marco's ONE thing: a builder character comes out complete for its level.

---

## Progress
- [x] A, shared accessibility:
  - dialog and sheet focus in and out;
  - inert closed drawer and Escape;
  - skip link;
  - text-field focus ring;
  - tour ✕ name;
  - keyboard-aware PhoneSheet;
  - invite greeting at the top.
- [x] B, the phone, links and Terms:
  - conditions up top;
  - full names;
  - ask the player's name (`player_name` patchable);
  - player feedback route;
  - honest notes wording;
  - link-reset recovery;
  - join `?code=` prefill;
  - turn live region and headings;
  - healing labels and heal roll;
  - Terms player data, retention and under-16s;
  - class features on the Character tab.
- [x] C1, wizard rules:
  - subclass at its level;
  - cantrip and spell counts;
  - always-prepared spells;
  - Magic Initiate;
  - Fighting Style, Weapon Mastery, Expertise and Orders;
  - spell descriptions;
  - Spells-step flash;
  - Human skills layout.
- [x] C2, features:
  - idempotent catalog seeding and full limited-use coverage;
  - `GET /api/play/{key}/class-features` and `GET /api/characters/{id}/class-features`;
  - the sheet's features panel;
  - turn kit fixes (Smite gating, Lay on Hands, healing labels);
  - `cast_spell` heal dice.
- [x] D1, prep, the HUD and sharing:
  - runbook editor on prep;
  - shortcuts ignore typing;
  - every campaign PC in the HUD party;
  - share-link PhoneSheet;
  - join link on Characters;
  - dice-button clearance;
  - Obsidian field gated;
  - `/uploads` dev proxy;
  - HUD names and a live region.
- [x] D2, the TV:
  - no-map turn-order view with the join QR;
  - crests on tokens;
  - plates and banner placement;
  - landed die faces the camera;
  - emoji and all caps removed.
- [x] Landing: the beta card and button match the invite-only beta.
- [x] Also in this wave:
  - stale tabs reload onto a new deploy (`lib/freshness.ts`, `UpdateWatcher`,
    `ErrorBoundary`, `vercel.json`);
  - portraits go to Vercel Blob;
  - Reset link works on DuckDB (`db.base.relax_duckdb_indexes`);
  - gzip on API responses;
  - the admin waitlist's "Invite by email".
- [x] Docs: TESTING, SECURITY, ARCHITECTURE, data dictionary, QUALITY (TD-126a closed,
  TD-128a–k added), README, DESIGN §9.
- [ ] Integration: gates, a cross-group check at 390 and 1280, commit, push, CI.

---

## Surprises and Discoveries
- The feature catalog was seeded only into an empty table, so any database with a few rows never
  got the rest. Builder characters got no tracked features locally.
- Passive class features (Extra Attack, Weapon Mastery, the Paladin's Smite) were never granted
  anywhere; they existed only as level-up notes.
- `broadcast_dice_roll` treated the roll dict as an object, so it has 500'd since Plan 85. The
  test suite never called it with a real roll.
- Justin's Safari tab, restored from memory after a deploy, went blank on Campaigns and
  Characters. It asked for page files the deploy had renamed, and `vercel.json` rewrote every
  path, `/assets/*` included, to `index.html`, so the browser got HTML for a script instead of
  a 404. Fixed with a one-time reload, a deploy watcher and no rewrite for `/assets/`.
- `POST /api/uploads` (portraits, notebook pastes) still wrote to Render's disk and returned a
  relative `/uploads/` URL. The URL broke on the Vercel frontend (another origin), and the file
  vanished on the next deploy. Maps and figures already used Blob; all three now share `_store`.
- Reset link returned a 500 locally for any PC with features or spells. DuckDB turns an update
  of an indexed column into delete + insert, which its foreign keys refuse while rows point at
  the PC. Postgres was never affected.
- WebKit test quirk: when we tested the stale-chunk reload by failing the same file name, the
  reloaded document reused the failed module for that URL, so the reload seemed not to help.
  A real deploy changes the file names, so this doesn't happen in production.

---

## Decision Log
- Six groups with disjoint file ownership, working in parallel, no commits until all report.
- The class-features endpoint contract `[{name, level, source, note}]` is shared between C2 (backend
  and DM sheet) and B (phone). B hides the section on 404, so neither group blocks the other.
- Player feedback reuses the `feedback` table with `email = "player:<pc id>"`, avoiding a
  migration.
- The wizard's strict checks run only when the build carries `class_choices`, which the
  wizard always sends. A build without it (the sample night's pregens) gets warnings for what
  is open. The subclass-at-its-level rule applies to every build.
- Class choices are stored in `feats` as "Label: Choice", the way the level-up guide records
  picks, so there is no migration.
- On DuckDB only, the `play_token` index is dropped rather than changing the reset flow.
  Tokens are 128 random bits, and Postgres keeps the unique index.
- Stale tabs reload at most once per 30 seconds (a sessionStorage timestamp), and a known
  new deploy loads on the next navigation, never mid-screen, so a half-typed note survives.

---

## Context and Orientation
- Reports: `docs/research/personas/run3/`.
- The shared brief for the groups is kept in the session scratchpad (not in the repo); its rules
  are the repo's usual ones:
  - DESIGN.md;
  - no generative AI;
  - React-compiler lint;
  - the Definition of Done.

---

## Validation and Acceptance
- `pytest -q`, black, isort, flake8 and interrogate are clean.
- Frontend: `tsc` and `npm run build` are clean; eslint reports no errors in files this plan
  touched (17 legacy errors elsewhere are TD-128k).
- Each persona's ONE thing is checked on screen at 390 and 1280:
  - the phone turn announcement;
  - the HUD live region;
  - the TV with no map;
  - the die face;
  - the prep runbook on a phone;
  - a level-5 Paladin from the wizard with Lay on Hands, Smite, Extra Attack and Channel
    Divinity on the sheet and phone.

---

## Idempotence and Recovery
- Catalog seeding inserts only missing rows, matched on name, class and subclass, and is safe on
  every start.
- No destructive migrations.

---

## Interfaces and Dependencies
- New routes:
  - `GET /api/play/{key}/class-features`;
  - `GET /api/characters/{id}/class-features`;
  - `POST /api/play/{key}/feedback`.
- `player_name` becomes player-patchable (1–100 characters once trimmed).
- The feature spend routes (`/play/{key}/features/{id}/spend`, the DM's
  `/characters/{id}/features/{id}/spend|restore`) take `?amount=` 1–100 for pools.
- `cast_spell` returns `heal_dice` for healing spells.
- Projection-only fields, filled in at read time and never stored: `Token.class_name`,
  `InitiativeEntry.class_name` and `InitiativeEntry.image_url`.
- A runbook scene may carry `encounter_id` in the scenes JSON (no schema change).
- No new packages, no migrations.

---

## Outcomes and Retrospective
**Outcomes (2026-10-31, before the commit):**
- All six groups landed. A builder character now comes out complete for its level. In the
  tests, a level-5 Paladin built in the wizard gets Divine Smite, Find Steed and its oath
  spells free. Any level-5 Paladin has Lay on Hands as a 25-point pool, and its feature list
  shows Extra Attack, Weapon Mastery and Paladin's Smite.
- The DM and the phone list every class feature at the level, passives included. Startup
  seeding fills the catalog in any database and grants only the rows it adds.
- Players can name themselves, send feedback, recover from a reset link and hear their turn.
  The Terms cover player data, retention, under-16s and contact.
- The TV works without a map. Prep has a runbook editor, and the HUD can add any campaign PC
  to tonight.
- Gates at the time of writing: 1,154 tests pass; black, isort, flake8 and interrogate are
  clean; `tsc` and the build are clean. eslint still reports 17 errors, all in legacy files
  this wave didn't touch (TD-128k).
- Still to do: the Integration step (the cross-group check at 390 and 1280, the commit, and
  the push once Justin approves it, then CI).
- Left open in QUALITY.md: TD-128a–k (wizard leftovers, class choices in the level-up guide,
  the pregens, showing `feats`, Font of Inspiration, Tactical Master, Song of Rest rows,
  healing a friend from the phone, the player feedback throttle, Blob orphans, eslint).

**Retrospective:**
- Three bugs found during the wave weren't on any persona's list. The stale-tab blank screen
  and the portraits on Render's disk only show up after a deploy, and the DuckDB reset bug only
  shows up for a PC with feature rows. Next time, try a change across a real deploy (two builds),
  and use test fixtures with features and spells.
- Seed reference data by identity (name + class + subclass) from the start. "Seed if empty"
  left every database short once migration 0036 had planted two rows.
- Separate file ownership let six groups work in parallel. The shared class-features
  contract, and B hiding its section on a 404, meant no group had to wait for another.
