# ARCHITECTURE — QuestLab

Bird's-eye codemap for new contributors. The detailed layered diagram and design decisions live in [`docs/STACK.md`](docs/STACK.md), [`docs/SECURITY.md`](docs/SECURITY.md), and [`docs/react_migration.md`](docs/react_migration.md). The behavior contract for working in this repo is [`CLAUDE.md`](CLAUDE.md).

## What QuestLab is

D&D 5e (2024) campaign planning + session tool for Dungeon Masters at an in-person table. Build campaigns → arcs → sessions → encounters, then run the night from the HUD (initiative, party, rolls) while players use their phones as a companion. No generative AI anywhere (Plan 86/124): everything is written by the DM, drawn by code, or uploaded.

## Two front-ends, one backend

- **Streamlit MVP** ([`main.py`](main.py) + [`pages/`](pages/)) — current production UI.
- **React + FastAPI** ([`frontend/`](frontend/) + [`api/`](api/)) — in-progress migration. See [`docs/react_migration.md`](docs/react_migration.md).

Both share the same `services/`, `db/repos/`, and `domain/`. The migration replaces only the transport/UI layers.

## Layers (the source of truth is [`CLAUDE.md`](CLAUDE.md))

```
   ┌─────────────┐    ┌─────────────┐
   │  pages/     │    │  api/       │     ← UI / transport. NO business logic.
   │  (Streamlit)│    │  (FastAPI)  │
   └──────┬──────┘    └──────┬──────┘
          │                  │
          └─────────┬────────┘
                    ▼
            ┌───────────────┐
            │  services/    │             ← business logic + authorization
            └───────┬───────┘
                    ▼
            ┌───────────────┐
            │  db/repos/    │             ← DB access only, no logic
            └───────┬───────┘
                    ▼
            ┌───────────────┐
            │  domain/      │             ← Pydantic + SQLModel definitions
            └───────────────┘
                    ▲
            ┌───────┴───────┐
            │ integrations/ │             ← Claude SDK, identity, 5e rules
            └───────────────┘
```

Import rules (enforced by the `boundary-checker` subagent and `.claude/rules/layers.md`):
- One-way: `pages|api → services → repos → domain`.
- `integrations/` is depended on by `services/` and `api/` only.
- Violations are bugs.

## File index

### Domain ([`domain/`](domain/))

| File | Aggregate |
|------|-----------|
| [`campaign.py`](domain/campaign.py) | `Campaign` |
| [`adventure.py`](domain/adventure.py) | `Adventure` |
| [`encounter.py`](domain/encounter.py) | `Encounter` |
| [`character.py`](domain/character.py) | `Character` (player + NPC) |
| [`monster.py`](domain/monster.py) | `MonsterStatBlock` |
| [`item.py`](domain/item.py) | `Item` (magic items) |
| [`map.py`](domain/map.py) | `Map` (world + dungeon) |
| [`session.py`](domain/session.py) | `Session` (live play) |
| [`arena.py`](domain/arena.py) | `ArenaState` — a Practice Arena fight (no table; the phone holds it) |
| [`duel.py`](domain/duel.py) | `Duel` — a fight the server holds so each player can be on their own device (duel or boss battle) |
| [`enums.py`](domain/enums.py) | Shared enums (ChallengeRating, ItemRarity, ...) |
| [`user.py`](domain/user.py) | `User` — a DM account; Patreon link, membership snapshot and `patron_comped` (Plan 130) |
| [`upload.py`](domain/upload.py) | `Upload` — the uploads ledger: owner, URL, bytes, kind (Plan 130) |
| [`plan.py`](domain/plan.py) | Plan shapes (Plan 130): `PlanStatus`, the Patreon link request/result, the admin comp, the beta overview rows with a plan |

### Repos ([`db/repos/`](db/repos/))
One per aggregate above. Each exposes `get`, `list`, `create`, `update`, `delete` plus aggregate-specific queries.

### Services ([`services/`](services/))

| File | Responsibility |
|------|----------------|
| [`auth_service.py`](services/auth_service.py) | Admin/user role checks, identity-header validation |
| [`campaign_service.py`](services/campaign_service.py) | Campaign CRUD + ownership |
| [`adventure_service.py`](services/adventure_service.py) | Adventure tree + linking to campaigns |
| [`encounter_service.py`](services/encounter_service.py) | Encounter builder, monster roster, CR math |
| [`character_service.py`](services/character_service.py) | PCs and NPCs |
| [`item_service.py`](services/item_service.py) | Magic items compendium |
| [`map_service.py`](services/map_service.py) | World + dungeon maps |
| [`session_service.py`](services/session_service.py) | Live session state, initiative, the runbook. A scene's optional `encounter_id` (the fight the HUD can load) is kept only when it names an encounter in the session's arc (`_link_scene_encounters`, Plan 128) |
| [`table_service.py`](services/table_service.py) | The TV/projector projection: revealed fog, tokens, the turn order and the party's own HP. A PC's `class_name` and picture on tokens and order rows are filled in when the projection is built, never stored (Plan 128) |
| [`player_service.py`](services/player_service.py) | Everything a player link may do: the bounded PATCH allowlist (with `player_name` since Plan 128), spends, casts (`heal_dice` for healing spells), notes, feedback |
| [`arena_service.py`](services/arena_service.py) | The 5e rules engine: turns, attacks, saves, slots, class features |
| [`duel_service.py`](services/duel_service.py) | Who may act in a multi-device fight (duel, or the party vs a boss — Plan 116), where it rests between turns, handing an absent player's seat to the referee |
| [`levelup_service.py`](services/levelup_service.py) | Level-up guide (Plan 115): DM grants a level (`pending_level`), the player's guide plans and applies HP, ASI/feat, subclass and spell picks |
| [`character_builder_service.py`](services/character_builder_service.py) | The character creator (Plan 74, Plan 126): one set of rules for two doors — the player's join link (`options`/`create`, join code + sign-up switch) and the DM's Add character (`options_for_dm`/`create_for_dm`, campaign owner only). Validates scores, background bonus, skills, subclass, kit, spells and one Ability Score Improvement or feat per improvement level, then derives HP/AC/saves/skills. Plan 128 adds the rest of the rules: the subclass at its level, cantrip and prepared-spell counts, always-prepared spells (`levelup_2024.always_prepared`), Magic Initiate picks and the class choices. The strict checks apply only when the build carries `class_choices`; older callers (scripts, old clients) get warnings instead. The subclass rule applies to every build. `attend_newest_session` puts every new PC on the next unplayed session, whether built in the wizard or typed in by hand (`character_service.create_character`) |
| [`feat_rules.py`](services/feat_rules.py) | Shared feat/ASI rules (Plan 126): feat eligibility at a level, ability-increase shape, feat sub-picks (spells, skills, expertise, save), per-level HP bonuses. Used by the level-up guide and the creator. Plan 128: the class choices (`apply_class_choices`: Fighting Style, Weapon Mastery, Expertise, Orders, Invocations, Metamagic), recorded in `feats` as "Label: Choice" (`entry`; a Fighting Style feat by its name, skill picks on the skills) |
| [`feature_service.py`](services/feature_service.py) | Class features (Plans 21, 128). `seed_and_backfill` runs at startup: it inserts the catalog rows a database lacks, matched on name + class + subclass, and grants only the newly inserted rows to the PCs who qualify. `sync_for_level` grants on build and level-up. `spend_use`/`restore_use` take an `amount` for pools (Lay on Hands). `list_class_features` lists every class and subclass feature at the PC's level, passives included |
| [`beta_service.py`](services/beta_service.py) | Friends beta (Plan 125): invites and the feedback inbox. Player notes are filed as `player:<pc id>` (Plan 128). The DM rows carry each plan (Plan 130) |
| [`plan_service.py`](services/plan_service.py) | Pricing (Plan 130). The plans live here in one place: Free gets 2 campaigns and 250 MB, Patron gets unlimited campaigns and 5 GB, and Patron needs $4/month or $40/year, checked within 40 days. Also here: who is a Patron (admin, comped, Patreon), the uploads ledger, and the checks campaign create and every upload route call. The checks act only with `PRICING=on` and raise `PlanLimitError`, which `api/main.py` answers with a 402 |

### Integrations ([`integrations/`](integrations/))

| File | Purpose |
|------|---------|
| [`identity.py`](integrations/identity.py) | Parse the trusted Azure Front Door / Entra identity header |
| [`oauth.py`](integrations/oauth.py) | Discord and Patreon OAuth. Plan 130: `patreon_link_url` (scope `identity identity.memberships`) and `parse_patreon_membership`, a pure function that finds the membership of `PATREON_CAMPAIGN_ID` |
| [`feature_flags.py`](integrations/feature_flags.py) | Product settings from the environment: `BETA_INVITES`, `PRICING`, `PATREON_CAMPAIGN_ID`, `PATREON_URL` (support link) |
| [`dnd_rules/encounter_math.py`](integrations/dnd_rules/encounter_math.py) | CR-to-XP, encounter difficulty curves |
| [`dnd_rules/stat_blocks.py`](integrations/dnd_rules/stat_blocks.py) | Stat block validation against 5e rules |
| [`dnd_rules/magic_items.py`](integrations/dnd_rules/magic_items.py) | Magic item reference data |
| [`dnd_rules/levelup_2024.py`](integrations/dnd_rules/levelup_2024.py) | Level-up rules: class and SRD subclass feature names by level (with plain-words notes), ASI levels, feat catalog + prerequisites, scaling notes. Plan 128: the class choices (`CHOICE_KINDS`, `class_choice_counts`) and the always-prepared spell tables (`always_prepared`) |
| [`dnd_rules/class_features_2024.py`](integrations/dnd_rules/class_features_2024.py) | The tracked class-feature catalog (`CLASS_FEATURES_2024`, rewritten for 2024 coverage in Plan 128), uses that scale with level (`scaled_uses`), pools (Lay on Hands, 5 × level) and `features_for_level` (every feature at a level, with a plain-words note) |
| [`dnd_rules/srd_character_options_2024.py`](integrations/dnd_rules/srd_character_options_2024.py) | Character creation data: species, backgrounds, origin feats, class tables (skills, kits, spell caps), armor |
| [`dnd_rules/rulesets.py`](integrations/dnd_rules/rulesets.py) | Plan 131 — picks an edition's tables: `options(r)`, `levelup(r)`, `class_features(r)`, `spell_seed(r)`, `normalize`, `is_2014`. Services ask here instead of importing an edition module |
| [`dnd_rules/*_2014.py`](integrations/dnd_rules/) | Plan 131 — the 2014 (SRD 5.1) twins of the 2024 modules, with the same public names and shapes: `srd_character_options_2014` (races and subraces with ability bonuses, Acolyte, classes with known/prepared casting), `levelup_2014` (features, choices, invocations, Grappler), `class_features_2014` (trackers), `srd_spells_2014` (319 spells, generated by `scripts/build_srd51_spells.py` from the open 5e-database JSON) |

### Pages ([`pages/`](pages/))
Streamlit pages, one per aggregate. UI only — instantiates a service, calls methods, renders. No business logic.

### API ([`api/`](api/))
FastAPI app for the React migration. [`api/main.py`](api/main.py) mounts routers in [`api/routers/`](api/routers/) — one per aggregate plus [`uploads.py`](api/routers/uploads.py) for image, map and rigged-figure (`.glb`, magic-checked) uploads and [`admin.py`](api/routers/admin.py) for admin ops. [`api/deps.py`](api/deps.py) builds service instances per-request. Uploads go through one `_store` helper: to Vercel Blob (`portraits/`, `maps/`, `models/`) when `BLOB_READ_WRITE_TOKEN` is set, else to the local `uploads/` folder. `api/main.py` gzips responses of 1,000 bytes or more (`GZipMiddleware`; Starlette never compresses the SSE streams). Plan 130: [`me.py`](api/routers/me.py) serves `GET /me/plan` and the Patreon link (`POST /me/patreon/link`, `POST /me/patreon/confirm`). The shared `/auth/patreon/callback` routes a link state to `/plan#patreon=…` (see `docs/SECURITY.md`). Every upload route checks the plan before storing and records the file in the ledger. `api/main.py` turns `PlanLimitError` into a 402 `{detail: {code: "plan_limit", limit, message}}` from any route.

### DB ([`db/`](db/))
- [`db/base.py`](db/base.py) — engine factory. Switches between Postgres (prod) and DuckDB (local/test) via `DB_BACKEND` env var. Contains the FK-workaround for DuckDB, and `relax_duckdb_indexes`, which drops `ix_player_characters_play_token` on DuckDB only (Plan 128; see invariant 1).
- [`db/repos/`](db/repos/) — see above.

### Alembic ([`alembic/`](alembic/))
Postgres-only. 5 migrations as of 2026-03. `versions/` files are zero-padded `NNNN_` prefix.

### Tests ([`tests/`](tests/))
- [`tests/conftest.py`](tests/conftest.py) — root fixtures (DuckDB in-memory session, current_user, factories)
- [`tests/test_domain/`](tests/test_domain/) — Pydantic boundary tests, no DB
- [`tests/test_integrations/`](tests/test_integrations/) — identity, encounter math, db_base
- [`tests/test_repos/`](tests/test_repos/) — repo CRUD round-trips
- [`tests/test_services/`](tests/test_services/) — authz + business logic

### Frontend ([`frontend/`](frontend/))
React SPA. Zustand state. See [`docs/react_migration.md`](docs/react_migration.md).
- **Look: "Lamplit"** (Plan 121) — every token and base class in [`frontend/src/index.css`](frontend/src/index.css); the rules (tool vs story type, one orange for what's live, line icons from `lucide-react`, the companion principles) in [`docs/DESIGN.md`](docs/DESIGN.md). Logo: [`components/BrandMark.tsx`](frontend/src/components/BrandMark.tsx) (nav) and [`components/D20Mark.tsx`](frontend/src/components/D20Mark.tsx) (line-art die).
- **Player phone** (Plan 122) — [`pages/PlayerView.tsx`](frontend/src/pages/PlayerView.tsx) mounts [`pages/player/PlayerApp.tsx`](frontend/src/pages/player/PlayerApp.tsx): tabs `NowTab` · `CharacterTab` · `SpellsTab` · `BagTab` · `JournalTab`, `FirstOpen`, `DyingScreen`; `RollSheet` (+ `rollContext.ts`, `rolls.ts`) turns any number into a roll; `playerContext.ts` shares the live queries; `rules.ts` holds plain-language rules text; help level per PC in [`stores/usePlayerPrefs.ts`](frontend/src/stores/usePlayerPrefs.ts). Plan 128 adds `Conditions.tsx` (what affects you, near the top), `NamePrompt.tsx` ("What should we call you?"), `PlayerFeedback.tsx` and `linkMemory.ts`, which remembers each link's campaign so a reset link points the player back to the party. A live region in `PlayerApp` announces turns.
- **Character wizard** (Plan 74, Plan 126) — [`components/character-wizard/CharacterWizard.tsx`](frontend/src/components/character-wizard/CharacterWizard.tsx) is the one guided builder: [`pages/CharacterCreator.tsx`](frontend/src/pages/CharacterCreator.tsx) mounts it at `/join/:campaignId/new` (player) and, with `mode="dm"`, at `/campaigns/:campaignId/characters/new` inside the DM layout (the Characters page's Add character; the raw form is "Enter an existing sheet" in the ⋯ menu). `AsiStep.tsx` is the improvement step, `ChoicesStep.tsx` the class choices, `SpellsStep.tsx` + `SpellList.tsx` the spells with their full text, `SkillsStep.tsx` skills and gear, `Fold.tsx` the fold-out sections (Plan 128), `Explainers.tsx` the "what this gives at level N" panels, `rules.ts` the client mirror of the server's math. API calls in [`api/characterBuilder.ts`](frontend/src/api/characterBuilder.ts). The build is kept as a per-tab draft (sessionStorage) until it is created.
- **Public pages** — [`pages/TryLanding.tsx`](frontend/src/pages/TryLanding.tsx) (`/try`, the drawn night-scene hero from [`components/landing/nightScene.generated.ts`](frontend/src/components/landing/nightScene.generated.ts), regenerate with `python tools/landing/gen_night_scene.py`) and [`pages/Welcome.tsx`](frontend/src/pages/Welcome.tsx) (`/welcome`, sign-in). Never pitch the private 3D table or VTT gameplay on them.
- **Shell and accessibility** (Plan 128): every modal uses [`hooks/useDialogFocus.ts`](frontend/src/hooks/useDialogFocus.ts) (focus in, Tab kept inside, Escape, focus back to the opener). [`pages/Layout.tsx`](frontend/src/pages/Layout.tsx) has the skip link to `#ql-main` and makes the closed nav drawer `inert`. `PhoneSheet` stays above the iPhone keyboard (`visualViewport`).
- **Stale tabs** (Plan 128): [`lib/freshness.ts`](frontend/src/lib/freshness.ts) reloads once on `vite:preloadError`, guarded by a sessionStorage timestamp. [`components/UpdateWatcher.tsx`](frontend/src/components/UpdateWatcher.tsx) checks for a new deploy when the tab becomes visible and every 10 minutes; the next navigation then loads fresh, and a "Reload" pill appears. `ErrorBoundary` wraps all routes with a `resetKey` and reloads on a stale-chunk error. [`vercel.json`](frontend/vercel.json) doesn't rewrite `/assets/*`, so a missing chunk is a real 404.
- **DM prep and HUD** (Plan 128): [`components/runbook/RunbookEditor.tsx`](frontend/src/components/runbook/RunbookEditor.tsx) edits the runbook on the prep page (scenes can link a fight). Single-letter shortcuts check `isTypingTarget` ([`components/dm/hotkeys.ts`](frontend/src/components/dm/hotkeys.ts)). On phones the floating dice button hides on the HUD and prep ([`dice-tray/diceEvents.ts`](frontend/src/components/dice-tray/diceEvents.ts)). The Obsidian vault and folder are a per-device setting ([`lib/obsidian.ts`](frontend/src/lib/obsidian.ts), localStorage `ql-obsidian-vault`). [`lib/portrait.ts`](frontend/src/lib/portrait.ts) points old `/uploads/` URLs at the API, and the Vite dev server proxies `/uploads`.
- **Your plan** (Plan 130): [`pages/PlanPage.tsx`](frontend/src/pages/PlanPage.tsx) at `/plan` shows the plan, usage meters, the plans, "Support QuestLab" or "Become a Patron", and "Link your Patreon". It confirms a returning link from the URL fragment. API calls are in [`api/plan.ts`](frontend/src/api/plan.ts). [`api/errors.ts`](frontend/src/api/errors.ts) reads a 402's `plan_limit` message; `isPlanLimitError` lets Campaigns and `ImageUpload` add "See your plan". Layout has "Your plan" in the menu footer, plus "Support QuestLab" when `PATREON_URL` is set. Admin → Beta has a "Give Patron" toggle per DM.
- **Room TV** (Plan 128): [`components/table/TableTracker.tsx`](frontend/src/components/table/TableTracker.tsx) is the turn-order view when no map is staged, with the join QR before the fight. `TurnCorner` shows the same order in a corner of a map, and `?view=order` or the T key switches the TV to the full order. `diceTiming.ts` keeps rolls hidden until the die lands; `rollText.ts` words them.

[`frontend/src/engine/`](frontend/src/engine/) is the immersive table (Plans 107–111): a second renderer of the same table projection, alongside the 2D board. `maps.ts`/`registry.ts` hold scene data per map, `lint.ts` the sanity check, `Scene.tsx` the room, `fogOfWar.ts`/`Weather.tsx`/`Director.tsx`/`Fx.tsx` the atmosphere, `figureModel.ts` + `Walker.tsx` the figures — any Mixamo-rigged `.glb` on a PC or monster (`model_url`), with one shared clip library baked onto each rig in world space. Routes: `/table/:sessionId/engine` (live) and `/engine/spike` (a map on its own). [`tools/figures/`](tools/figures/) packs Character Creator / Mixamo exports for it.

### Docs ([`docs/`](docs/))
[`STACK.md`](docs/STACK.md), [`SECURITY.md`](docs/SECURITY.md), [`TESTING.md`](docs/TESTING.md), [`QUALITY.md`](docs/QUALITY.md), [`data_dictionary.md`](docs/data_dictionary.md), [`deployment.md`](docs/deployment.md), [`react_migration.md`](docs/react_migration.md), [`immersive_table.md`](docs/immersive_table.md) (the DM/player guide to the 3D table).

### Plans ([`plans/`](plans/))
ExecPlans, numbered `NNNNN-*.md`. Spec is [`.agent/plans.md`](.agent/plans.md). New plans → `/new-plan <desc>`.

### Claude Code config ([`.claude/`](.claude/))
Subagents, slash commands, hooks, rules. See [`.claude/README.md`](.claude/README.md). MCP servers in [`.mcp.json`](.mcp.json).

## Key invariants

1. **Postgres is the schema source of truth.** DuckDB is for local dev + tests only and gets its schema from SQLModel `create_all`. Alembic never targets DuckDB. The two backends do not agree on timestamps: Postgres returns the aware UTC value that was written, DuckDB converts to local time *and* drops the tzinfo. Normalize a timestamp you read back (`value.astimezone(UTC)` when naive) before comparing it to `datetime.now(UTC)`. DuckDB also turns an update of an indexed column into delete + insert, which its foreign keys refuse, so `db.base.relax_duckdb_indexes` drops the `play_token` index there (local and tests only; Postgres keeps it unique).
2. **No in-app auth.** Azure Front Door + Entra ID inject identity via a trusted HTTP header. Missing header = deny.
3. **Authorization lives in `services/`**, never in pages alone. Every public service method's first line is a role check.
4. **No SQL string concatenation.** ORM or `text()` with bound params. Pydantic-validate every external input.
5. **No generative AI.** No LLM or image-model client exists in the codebase (removed in Plan 124); don't add one. Content is DM-written, procedural, or uploaded.
6. **Layer imports are one-way.** `pages|api → services → repos → domain`. `integrations/` is a sibling to `services/`, never imported from `domain/`.
7. **ExecPlans for anything >20 min or >1 layer.** Living documents — Progress, Surprises, Decision Log updated every stop.
8. **Players never pay; caps never take anything away.** Pricing (Plan 130) caps only campaign count and upload storage, only for DMs, and only with `PRICING=on`. The checks live in `services/plan_service.py`. Going past a cap refuses the new campaign or upload with a 402. Nothing is ever deleted, hidden or locked.
9. **One ruleset per table.** A campaign plays by `2024` or `2014` (Plan 131); each PC copies it at creation, and the campaign's rules lock once it has a character. Rules code reads an edition's tables through `integrations/dnd_rules/rulesets.py`, and spell or feature lookups pass the ruleset. A 2024 campaign must behave exactly as it did before 2014 existed.

## Definition of Done

Every change is complete only when all of these pass (run `/quality-gate`):

- `pytest -q` — zero failures
- `black --check . && isort --check-only . && flake8` — zero errors
- `interrogate -c pyproject.toml` — ≥80% docstring coverage
- `pip-audit` — no known vulnerabilities
- Schema changes have an Alembic migration
- Docs updated to reflect structural changes
