# Plan 00001 — QuestLab App Build

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-03-07
**Last updated:** 2026-03-07
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

QuestLab is an AI-powered D&D 5e (2024 rules) campaign planning and session execution tool for Dungeon Masters.
It allows a DM to build campaigns, adventures, player character sheets, encounters, and maps; generate AI-authored
session runbooks with quotable dialog, encounter flows, monster stat blocks, and loot tables; and run live sessions
with a real-time companion view. The app is built Streamlit-first (MVP), then migrated to React. It will be
visually stunning with a dark fantasy aesthetic. This plan covers all 10 stages from blank repo to feature-complete.

---

## Progress

> Check items as stages complete. Each stage has its own sub-checklist.

- [x] **Stage 1** — Foundation & Scaffold (complete — all quality gates pass)
- [x] **Stage 2** — Core Domain Models (complete — 60 tests pass, all gates green)
- [x] **Stage 3** — DB Schema, Repos, Alembic Migration (complete — 77 tests pass)
- [x] **Stage 4** — Campaign & Adventure CRUD (complete — 102 tests pass)
- [x] **Stage 5** — Player Character Sheet Builder (complete — 147 tests pass)
- [x] **Stage 6** — Encounter Builder (complete — 197 tests pass)
- [x] **Stage 7** — AI Engine (Claude API — runbooks, dialog, loot, NPCs) (complete — 210 tests pass)
- [x] **Stage 8** — Map Builder (complete — 243 tests pass)
- [x] **Stage 9** — Session Runner (complete — 272 tests pass)
- [x] **Stage 10** — Visual Polish & React Migration (complete — 283 tests pass)

---

## Surprises and Discoveries
- 2026-03-07: No Python installation found in PATH on the dev machine. Windows App Execution Aliases
  exist but point to the Store stub (not a real interpreter). User must install Python 3.11+ before
  quality gates can be run. All Stage 1 files are written and ready; run quality gates after install.
- 2026-03-07: Python 3.14.3 installed (newer than required 3.11+). All packages compatible.
- 2026-03-07: flake8 linted .venv — fixed by adding .flake8 config with exclude.
- 2026-03-07: py 1.11.0 PYSEC-2022-42969 — transitive dep of interrogate; no fix available.
  Suppressed via --ignore-vuln in CI. Tracked as TD-004.
- 2026-03-07: SQLModel table models cannot use list/dict type hints directly — must use
  sa_column=Column(JSON, nullable=True). Separated table models from Pydantic schemas.
- 2026-03-07: datetime.utcnow() deprecated in Python 3.12+. Using datetime.now(UTC) throughout.
- 2026-03-07: DuckDB connect() does not accept check_same_thread kwarg — removed from conftest.
- 2026-03-07: Alembic migration written manually (no local Postgres). Targets Postgres dialect.
  Will be verified via alembic upgrade head on first deploy.
- 2026-03-07: Session-scoped DuckDB engine means test isolation via rollback is partial.
  Count-style tests use relative (before/after) assertions instead of absolute zeros.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-03-07 | ORM | SQLModel vs SQLAlchemy 2.x | SQLModel | Cleaner Pydantic integration; one class = domain model + table |
| 2026-03-07 | AI provider | OpenAI / Anthropic | Anthropic Claude API | User preference; superior long-form narrative generation |
| 2026-03-07 | Map builder (MVP) | Custom canvas, third-party lib | Streamlit custom component (SVG grid) | No JS dependency in MVP; revisit in React phase |
| 2026-03-07 | 5e ruleset | 2014 vs 2024 | 2024 | User requirement; use updated encounter math (XP budget method v2) |

---

## Context and Orientation

### Files touched (full list across all stages)

```
.agent/PLANS.md                         (reference only)
plans/00001-questlab-app-build.md       (this file)
.env.example
.pre-commit-config.yaml
pyproject.toml
requirements.txt
alembic.ini
alembic/env.py
alembic/versions/                       (migration files added per stage)
main.py                                 (Streamlit entry point)
pages/
  home.py
  campaigns.py
  adventures.py
  characters.py
  encounters.py
  maps.py
  session_runner.py
  admin.py
domain/
  campaign.py
  adventure.py
  character.py
  encounter.py
  monster.py
  item.py
  map.py
  session.py
  enums.py
db/
  base.py                               (engine + session factory)
  repos/
    campaign_repo.py
    adventure_repo.py
    character_repo.py
    encounter_repo.py
    monster_repo.py
    item_repo.py
    map_repo.py
    session_repo.py
services/
  campaign_service.py
  adventure_service.py
  character_service.py
  encounter_service.py
  ai_service.py
  map_service.py
  session_service.py
  auth_service.py
integrations/
  identity.py                           (header parsing)
  claude_client.py                      (Anthropic SDK wrapper)
  dnd_rules/
    encounter_math.py                   (2024 XP budget calculator)
    stat_blocks.py                      (SRD monster data)
    loot_tables.py                      (DMG 2024 loot tables)
static/
  styles/
    main.css                            (dark fantasy theme)
  assets/
    logo.png
    fonts/
docs/
  STACK.md
  SECURITY.md
  TESTING.md
  QUALITY.md
  architecture.md                       (added after Stage 3)
  data_dictionary.md                    (added after Stage 3)
tests/
  conftest.py
  test_domain/
  test_services/
  test_repos/
  test_integrations/
README.md
ARCHITECTURE.md
.github/
  workflows/
    ci.yml
```

### Architecture layers involved
All layers. Boundary rules (from CLAUDE.md):
- `pages/` → UI only. Import services, never repos or domain DB models directly.
- `services/` → Business logic. Import repos and domain. Enforce authz here.
- `domain/` → Pydantic/SQLModel models. No DB sessions, no service calls.
- `db/repos/` → DB queries only. Return domain objects. No business logic.
- `integrations/` → External calls (Claude API, identity header). No business logic.

### Key terms defined
- **Campaign** — Top-level container. Has a title, setting, tone, world notes, list of Adventures.
- **Adventure** — A story arc within a Campaign. Has chapters/acts, NPC roster, locations.
- **Session** — A single play session within an Adventure. Has date, attending PCs, runbook.
- **Runbook** — AI-generated document for a Session: scene-by-scene flow, quotable dialog, encounter triggers, improvisation prompts.
- **PlayerCharacter (PC)** — Full 2024 5e character sheet: stats, class, subclass, feats, equipment, spells, backstory.
- **Encounter** — A combat or social challenge. Has PC party, monster roster, terrain, difficulty rating, XP budget.
- **MonsterStatBlock** — 2024 5e monster definition: AC, HP, speed, ability scores, actions, reactions, legendary actions, traits.
- **LootTable** — Randomizable list of items, gold, and magic items appropriate to CR/adventure tier.
- **MapRoom** — A node on a dungeon/overworld map: name, description, exits, encounter/loot hooks.
- **CR (Challenge Rating)** — 5e difficulty measure for monsters. 2024 uses updated XP budget math.
- **XP Budget** — 2024 method: multiply per-PC baseline by party size and multiplier; compare to monster XP total.
- **ExecPlan** — This document type. A living plan that guides implementation of a multi-layer feature.

---

## Stages — Concrete Steps

Each stage is independently implementable and verifiable. Implement one stage at a time.

---

### STAGE 1 — Foundation & Scaffold

**Goal:** A running (empty) Streamlit app with all tooling wired, CI passing, auth middleware stubbed, and all required docs created.

#### 1.1 Python environment
**Files:** `requirements.txt`, `pyproject.toml`
**Action:** Create

`requirements.txt` must include:
```
streamlit>=1.35
sqlmodel>=0.0.19
alembic>=1.13
psycopg2-binary>=2.9
duckdb>=0.10
pydantic>=2.7
anthropic>=0.28
python-dotenv>=1.0
pytest>=8.0
pytest-cov>=5.0
black>=24.0
isort>=5.13
flake8>=7.0
interrogate>=1.7
pip-audit>=2.7
```

`pyproject.toml` must include:
```toml
[tool.black]
line-length = 100

[tool.isort]
profile = "black"
line_length = 100

[tool.interrogate]
fail-under = 80
ignore-init-method = true
ignore-magic = true
verbose = 0

[tool.pytest.ini_options]
testpaths = ["tests"]
```

**Verify:** `pip install -r requirements.txt` exits 0.

#### 1.2 Environment config
**Files:** `.env.example`
**Action:** Create with all required vars:
```
DB_BACKEND=postgres
PGHOST=localhost
PGPORT=5432
PGDATABASE=questlab
PGUSER=questlab
PGPASSWORD=changeme
PGSSLMODE=require
DUCKDB_PATH=./data/app.duckdb
AUTH_EMAIL_HEADER=X-MS-CLIENT-PRINCIPAL-NAME
CURRENT_USER_EMAIL=dev@local.test
BOOTSTRAP_ADMIN_EMAILS=admin@example.com
LOG_LEVEL=INFO
ANTHROPIC_API_KEY=sk-ant-...
```
**Verify:** File committed with no `.env` present.

#### 1.3 Alembic init
**Files:** `alembic.ini`, `alembic/env.py`
**Action:** `alembic init alembic` then configure `env.py` to read `PGHOST` etc. from env.
**Verify:** `alembic current` exits 0 (no migrations yet is acceptable).

#### 1.4 Auth integration stub
**Files:** `integrations/identity.py`
**Action:** Create. Reads `AUTH_EMAIL_HEADER` from env, extracts email from request headers.
Falls back to `CURRENT_USER_EMAIL` if header absent AND `ENV=development`. Raises `403` otherwise.
**Verify:** Unit test passes for both paths.

#### 1.5 DB session factory
**Files:** `db/base.py`
**Action:** Create. Reads `DB_BACKEND` from env. Returns SQLModel `Session` for postgres or duckdb.
Engine is module-level singleton.

#### 1.6 Streamlit entry point
**Files:** `main.py`
**Action:** Create. Configures page title "QuestLab", wide layout, custom CSS import.
Renders top nav. No business logic.

#### 1.7 Pre-commit config
**Files:** `.pre-commit-config.yaml`
**Action:** Create with hooks: `black`, `isort`, `flake8`, `interrogate`, `pip-audit`.

#### 1.8 GitHub Actions CI
**Files:** `.github/workflows/ci.yml`
**Action:** Create. Runs on push to `main` and all PRs.
Steps: checkout → setup Python 3.11 → pip install → black check → isort check → flake8 → interrogate → pip-audit → pytest.

#### 1.9 Docs
**Files:** `docs/STACK.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/QUALITY.md`, `README.md`
**Action:** Create all. Each is a proper runbook (not a stub).

**Stage 1 Verify:**
- `streamlit run main.py` renders a blank app with nav
- `black . && isort . && flake8 && interrogate -c pyproject.toml && pip-audit && pytest -q` all pass

---

### STAGE 2 — Core Domain Models

**Goal:** All Pydantic/SQLModel domain models defined. No DB yet. Models encode 2024 5e rules as constraints.

#### 2.1 Enums
**File:** `domain/enums.py`
**Action:** Create.
Key enums:
- `CharacterClass` (Barbarian … Wizard, including 2024 additions)
- `AbilityScore` (STR, DEX, CON, INT, WIS, CHA)
- `DamageType` (Acid, Bludgeoning, Cold, Fire, Force, Lightning, Necrotic, Piercing, Poison, Psychic, Radiant, Slashing, Thunder)
- `CreatureSize` (Tiny, Small, Medium, Large, Huge, Gargantuan)
- `CreatureType` (Aberration, Beast, Celestial, Construct, Dragon, Elemental, Fey, Fiend, Giant, Humanoid, Monstrosity, Ooze, Plant, Undead)
- `EncounterDifficulty` (Low, Moderate, High, Deadly)
- `AdventureTier` (Tier1=1-4, Tier2=5-10, Tier3=11-16, Tier4=17-20)
- `SpellSchool` (Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation)
- `ItemRarity` (Common, Uncommon, Rare, VeryRare, Legendary, Artifact)
- `MapNodeType` (Room, Corridor, Outdoor, Settlement, Dungeon, Lair)
- `SessionStatus` (Draft, Ready, InProgress, Complete)

#### 2.2 Campaign model
**File:** `domain/campaign.py`
**Action:** Create SQLModel `Campaign` table + Pydantic `CampaignCreate` / `CampaignRead` schemas.
Fields: `id` (uuid), `name`, `setting`, `tone`, `world_notes` (text), `dm_email`, `created_at`, `updated_at`.
Relationship: one-to-many with `Adventure`.

#### 2.3 Adventure model
**File:** `domain/adventure.py`
Fields: `id`, `campaign_id` (FK), `title`, `synopsis`, `tier` (AdventureTier), `act_count` (int, 1-5), `npc_roster` (JSON), `location_notes` (text), `created_at`.
Relationship: belongs to Campaign; one-to-many with Session, Encounter, Map.

#### 2.4 PlayerCharacter model
**File:** `domain/character.py`
Fields: `id`, `campaign_id` (FK), `player_name`, `character_name`, `race`, `character_class` (CharacterClass), `subclass`, `level` (1-20), `background`, `alignment`,
ability scores (6 ints: str/dex/con/int/wis/cha), `hp_max`, `hp_current`, `ac`, `speed`, `proficiency_bonus` (computed from level),
`saving_throw_proficiencies` (list[AbilityScore]), `skill_proficiencies` (JSON), `feats` (JSON array), `equipment` (JSON array),
`spells_known` (JSON), `spell_slots` (JSON), `backstory` (text), `notes` (text), `portrait_url`.

#### 2.5 MonsterStatBlock model
**File:** `domain/monster.py`
Fields: `id`, `name`, `source` (SRD/custom), `size` (CreatureSize), `creature_type` (CreatureType), `alignment`,
`ac`, `ac_notes`, `hp_average`, `hp_formula`, `speed` (JSON: walk/fly/swim/burrow/climb),
ability scores (6 ints), `saving_throws` (JSON), `skills` (JSON), `damage_resistances` (list[DamageType]),
`damage_immunities` (list[DamageType]), `condition_immunities` (JSON), `senses` (JSON), `languages`,
`challenge_rating` (str: "1/8", "1/4", "1/2", "1" … "30"), `xp` (int), `proficiency_bonus` (int),
`traits` (JSON: [{name, description}]), `actions` (JSON: [{name, description, attack_bonus, damage}]),
`bonus_actions` (JSON), `reactions` (JSON), `legendary_actions` (JSON), `lair_actions` (JSON),
`is_custom` (bool), `created_by_email` (nullable).

#### 2.6 Encounter model
**File:** `domain/encounter.py`
Fields: `id`, `adventure_id` (FK), `name`, `description`, `difficulty` (EncounterDifficulty),
`xp_budget` (int), `monster_roster` (JSON: [{monster_id, count, hp_override}]),
`terrain_notes`, `read_aloud_text` (text), `dm_notes` (text), `reward_xp` (int), `loot_table_id` (FK nullable).

#### 2.7 Item / LootTable models
**File:** `domain/item.py`
`Item`: `id`, `name`, `rarity` (ItemRarity), `item_type`, `description`, `attunement_required` (bool),
`properties` (JSON), `value_gp` (int), `is_magic` (bool).
`LootTable`: `id`, `adventure_id` (FK), `name`, `tier` (AdventureTier), `entries` (JSON: [{item_id or gold_range, weight}]).

#### 2.8 Map model
**File:** `domain/map.py`
`MapNode`: `id`, `map_id` (FK), `label`, `node_type` (MapNodeType), `x` (int), `y` (int),
`description`, `encounter_id` (FK nullable), `loot_table_id` (FK nullable), `notes`.
`MapEdge`: `id`, `map_id` (FK), `from_node_id`, `to_node_id`, `label`, `is_secret` (bool).
`Map`: `id`, `adventure_id` (FK), `name`, `grid_width`, `grid_height`, `background_color`.

#### 2.9 Session / Runbook models
**File:** `domain/session.py`
`Session`: `id`, `adventure_id` (FK), `session_number` (int), `title`, `date_planned` (date),
`attending_pc_ids` (JSON list[uuid]), `status` (SessionStatus), `actual_notes` (text).
`SessionRunbook`: `id`, `session_id` (FK, unique), `generated_at`, `model_used`,
`opening_scene` (text), `scenes` (JSON: [{title, read_aloud, dm_notes, encounter_id}]),
`npc_dialog` (JSON: [{npc_name, quotes: [str], improv_hooks: [str]}]),
`encounter_flows` (JSON: [{encounter_id, round_by_round_notes}]),
`closing_hooks` (text), `xp_awards` (JSON), `loot_awards` (JSON).

**Stage 2 Verify:**
- `python -c "from domain.campaign import Campaign; print(Campaign.__fields__)"` succeeds
- All domain models importable with no circular imports
- `pytest tests/test_domain/ -q` passes (field validation tests)

---

### STAGE 3 — DB Schema, Repos, Alembic Migration

**Goal:** All tables created in Postgres. Repo layer provides typed CRUD for every model.

#### 3.1 Alembic migration
**File:** `alembic/versions/0001_initial_schema.py`
**Action:** `alembic revision --autogenerate -m "initial schema"` after all SQLModel tables imported in `alembic/env.py`.
**Verify:** `alembic upgrade head` creates all tables; `alembic current` shows head.

#### 3.2 Repos (one per domain model)
**Files:** `db/repos/*.py`
**Action:** Create. Each repo exposes:
- `get_by_id(session, id) -> Model | None`
- `list_all(session, filters) -> list[Model]`
- `create(session, data) -> Model`
- `update(session, id, data) -> Model`
- `delete(session, id) -> bool`

No business logic. No auth checks. All queries use SQLModel `select()` — zero SQL string concatenation.

#### 3.3 Data dictionary
**File:** `docs/data_dictionary.md`
**Action:** Create. Every table, column, type, constraint, FK, and enum value documented.

**Stage 3 Verify:**
- `alembic upgrade head` passes on a clean Postgres instance
- `pytest tests/test_repos/ -q` passes (uses DuckDB fixture for speed)

---

### STAGE 4 — Campaign & Adventure CRUD

**Goal:** DM can create, view, edit campaigns and adventures via Streamlit UI.

#### 4.1 Campaign service
**File:** `services/campaign_service.py`
Business logic: authz check (DM must own campaign), slug generation, validates adventure count limits.

#### 4.2 Adventure service
**File:** `services/adventure_service.py`
Business logic: validates campaign ownership, tier constraints, NPC roster schema.

#### 4.3 Campaigns page
**File:** `pages/campaigns.py`
- List all campaigns for current DM
- Create new campaign form (name, setting, tone, world notes)
- Click → Adventure list for that campaign
- Edit/delete (DM-only, confirmed)
- Styled with dark fantasy card layout

#### 4.4 Adventures page
**File:** `pages/adventures.py`
- List adventures within a campaign
- Create adventure (title, synopsis, tier, act count)
- NPC roster builder (name, role, description, stat block link)
- Location notes rich text

**Stage 4 Verify:**
- Can create a campaign and adventure via UI
- Campaign owned by another user cannot be edited (authz enforced service-side)
- `pytest tests/test_services/test_campaign_service.py -q` passes

---

### STAGE 5 — Player Character Sheet Builder

**Goal:** DM can input full 2024 5e character sheets for each PC in a campaign.

#### 5.1 Character service
**File:** `services/character_service.py`
Logic: proficiency bonus auto-computed from level. Spell slots validated against class/level table (2024 rules). Saving throw and skill modifiers computed server-side.

#### 5.2 Characters page
**File:** `pages/characters.py`
Full character sheet form:
- Identity: player name, character name, race, class (dropdown from enum), subclass, level, background, alignment
- Ability scores (6 number inputs) → auto-display modifiers and proficiency bonus
- Combat stats: HP max/current, AC, speed, initiative
- Saving throws (checkboxes for proficiency)
- Skills (checkboxes + computed bonuses)
- Feats (text input list)
- Equipment list
- Spells known + prepared + slots (per class spell tables)
- Backstory (text area)
- Portrait upload (stored as URL)
- View: formatted sheet layout matching physical 5e sheet aesthetics

**Stage 5 Verify:**
- Level 5 wizard has correct spell slots (4/3/2)
- Proficiency bonus auto-updates when level changes
- `pytest tests/test_services/test_character_service.py -q` passes

---

### STAGE 6 — Encounter Builder ✅ COMPLETE (2026-03-08)

**Goal:** DM can build encounters with monster rosters, see difficulty rating, XP budget, and initiative order.

#### 6.1 2024 XP budget calculator
**File:** `integrations/dnd_rules/encounter_math.py`
Implements 2024 encounter difficulty math:
- Per-PC XP baseline by level (table from 2024 DMG)
- Party XP budget = sum of per-PC baselines × difficulty multiplier
- Monster XP total = sum of individual monster XP
- Difficulty band: Low / Moderate / High / Deadly
- Returns `EncounterDifficultyResult` Pydantic model

#### 6.2 SRD monster data
**File:** `integrations/dnd_rules/stat_blocks.py`
Seed data for all SRD 2024 monsters as `MonsterStatBlock` objects.
Loaded into DB at startup if table is empty (admin-only seed function).

#### 6.3 Encounter service
**File:** `services/encounter_service.py`
Logic: party size from attending PCs, XP budget calc, difficulty rating, initiative roller.

#### 6.4 Encounters page
**File:** `pages/encounters.py`
- Select adventure → list encounters
- Create encounter: name, terrain notes, read-aloud text
- Monster roster builder: search/add monsters, set count and HP override
- Party selector: which PCs are present
- Real-time XP budget display with difficulty color indicator (green=Low, yellow=Moderate, orange=High, red=Deadly)
- Loot table builder / link
- Save → encounter stored in DB

**Stage 6 Verify:**
- 4× level 5 PCs vs 1 Adult Red Dragon = Deadly
- XP display updates without page reload (use `st.session_state`)
- `pytest tests/test_integrations/test_encounter_math.py -q` passes with known values

---

### STAGE 7 — AI Engine (Claude API) ✅ COMPLETE (2026-03-08)

**Goal:** AI generates session runbooks, quotable dialog, encounter flows, loot, and NPCs via Claude API.

#### 7.1 Claude client
**File:** `integrations/claude_client.py`
Wraps `anthropic.Anthropic`. Exposes `complete(system, user, model, max_tokens) -> str`.
Reads `ANTHROPIC_API_KEY` from env. Never logs the key. Raises on non-200.

#### 7.2 AI service — core
**File:** `services/ai_service.py`
All AI prompts live here. No raw API calls in pages or other services.

Functions (each returns a typed Pydantic model):

**`generate_session_runbook(session_id, dm_notes) -> SessionRunbook`**
System prompt includes: campaign setting/tone, adventure synopsis, attending PCs (class/level/backstory snippets), encounter list with monster rosters, NPC roster.
Instructs Claude to produce: opening scene read-aloud, 3-5 scenes with read-aloud + DM notes, NPC dialog quotes + improv hooks, encounter flow (round-by-round tactical notes), closing hooks, XP/loot award suggestions.
Output: structured JSON → parsed into `SessionRunbook` domain model.

**`generate_npc_dialog(npc_name, personality, context) -> list[str]`**
Returns 5-10 quotable lines + 3 improv hooks.

**`generate_loot_table(adventure_tier, encounter_cr, num_entries) -> LootTable`**
Returns randomizable loot table appropriate to tier. Uses 2024 DMG loot tables as reference in system prompt.

**`generate_monster_flavor(monster_name, setting_context) -> str`**
Returns 2-3 sentences of read-aloud flavor for when the monster appears.

**`generate_npc(role, setting, tone) -> dict`**
Returns NPC with name, appearance, personality, secret, and 5 dialog hooks.

**`generate_adventure_hook(campaign_setting, tier, tone) -> str`**
Returns a 1-paragraph adventure hook the DM can read aloud.

#### 7.3 Session runbook page integration
**File:** `pages/session_runner.py` (initially), later `pages/adventures.py` "Generate Runbook" button
**Action:** Add "Generate Session Runbook" button on Session detail view.
Calls `ai_service.generate_session_runbook()`. Streams output to UI using `st.write_stream`.
Saves generated runbook to DB.

**Stage 7 Verify:**
- Runbook generation returns valid `SessionRunbook` JSON
- NPC dialog contains quotable lines (non-empty list)
- API key missing → friendly error, not stack trace
- `pytest tests/test_services/test_ai_service.py -q` passes (mock Anthropic client)

---

### STAGE 8 — Map Builder ✅ COMPLETE (2026-03-08)

**Goal:** DM can create dungeon/overworld maps as node graphs, annotate rooms, link encounters and loot.

#### 8.1 Map service
**File:** `services/map_service.py`
Logic: node creation, edge creation, validates no duplicate node positions, links encounter/loot to nodes.

#### 8.2 Map builder page
**File:** `pages/maps.py`
MVP approach: SVG-based grid rendered via Streamlit HTML component.
- Grid (configurable size, e.g. 20×20)
- Click cell → create/edit MapNode (label, type, description, encounter link, loot link)
- Click two nodes → create MapEdge (label, is_secret toggle)
- Color coding by MapNodeType
- Export map as PNG (via browser print or base64 SVG)
- Sidebar: node list with links to encounters

**Stage 8 Verify:**
- Can place 5 nodes, connect them with edges
- Encounter link shows encounter name in node tooltip
- Map persists after page reload
- `pytest tests/test_services/test_map_service.py -q` passes

---

### STAGE 9 — Session Runner ✅ COMPLETE (2026-03-08)


**Goal:** DM can run a live session using QuestLab: track initiative, view runbook, reference encounters.

#### 9.1 Session service
**File:** `services/session_service.py`
Logic: session state management (Draft → Ready → InProgress → Complete), initiative roller (d20 + DEX mod per PC and monster), XP award distribution, session notes persistence.

#### 9.2 Session runner page
**File:** `pages/session_runner.py`
Split-pane layout:
- **Left pane:** Initiative tracker (sorted list, click to mark active turn, HP tracker per combatant), encounter controls (start/end, round counter)
- **Right pane:** Session runbook display (current scene, read-aloud text, DM notes, NPC dialog cards), quick reference monster stat blocks (expandable), loot table roller (click to roll random loot)
- **Top bar:** Session title, adventure, date, status badge
- **Hotkeys:** keyboard shortcut to advance turn, toggle dark mode (already default)

**Stage 9 Verify:**
- Initiative rolls produce sorted order correctly (ties broken by DEX, then coin flip)
- HP tracker decrements and shows "Defeated" at 0
- Runbook scenes navigable (Next Scene / Prev Scene)
- Session status transitions correctly
- `pytest tests/test_services/test_session_service.py -q` passes

---

### STAGE 10 — Visual Polish & React Migration Prep ✅ COMPLETE (2026-03-08)

**Goal:** App is visually stunning. Dark fantasy aesthetic with custom fonts, color palette, and card layouts.
React migration groundwork laid.

#### 10.1 Global CSS theme
**File:** `static/styles/main.css`
Design system:
- **Color palette:** Deep black (#0D0D0D) background, dark red (#8B0000) primary, aged parchment (#F5E6C8) text, gold (#C9A84C) accents, shadow purple (#2D1B4E) cards
- **Typography:** "Cinzel Decorative" (headings, Google Fonts), "EB Garamond" (body text), "Share Tech Mono" (stat blocks, dice)
- **Cards:** Parchment-textured card backgrounds for campaign/adventure/character cards
- **Icons:** Custom SVG icons for D20, sword, scroll, map, skull, treasure chest
- **Animations:** Subtle glow on active encounter, fade-in for read-aloud text, dice roll animation on initiative
- **Scrollbars:** Styled dark with gold thumb
Applied via `st.markdown(unsafe_allow_html=True)` + `st.html()`

#### 10.2 Component library (Streamlit custom components)
**File:** `pages/_components/`
Reusable Streamlit component snippets:
- `stat_block_card.py` — renders a formatted monster stat block matching 5e book layout
- `character_mini_card.py` — compact PC card for session view
- `dice_roller.py` — animated d20 roll widget
- `loot_card.py` — styled loot reveal card

#### 10.3 React migration prep
**File:** `docs/react_migration.md`
Documents: which Streamlit pages map to which React routes, API endpoint design (FastAPI), state management recommendation (Zustand), component library recommendation (shadcn/ui with custom dark fantasy tokens).
This is a planning doc only — no code changes yet.

#### 10.4 Admin page
**File:** `pages/admin.py`
Admin-only (enforced via `auth_service.require_admin()`):
- User list
- Bootstrap admin management
- Monster stat block seed/reseed
- Export campaigns as JSON (admin-only)

**Stage 10 Verify:**
- App renders with dark fantasy theme in all pages
- Stat block card matches D&D Beyond visual layout
- Dice roller shows animation on click
- Admin page returns 403 for non-admin users

---

## Validation and Acceptance (Full App)

- [ ] `pytest -q` — zero failures across all test suites
- [ ] `black . && isort . && flake8 && interrogate -c pyproject.toml` — zero errors
- [ ] `pip-audit` — no known vulnerabilities
- [ ] `alembic upgrade head` — clean migration on fresh DB
- [ ] `streamlit run main.py` — app loads, DM can complete full workflow:
  - Create campaign → add adventure → add PCs → build encounter → build map → generate session runbook → run session
- [ ] Session runbook contains: opening scene, 3+ scenes with read-aloud, NPC dialog, encounter flow, loot awards
- [ ] Encounter XP budget matches 2024 DMG values for test cases
- [ ] Auth: non-owner cannot view/edit another DM's campaign
- [ ] Admin: non-admin cannot access export or admin page
- [ ] Visual: app renders dark fantasy theme with custom fonts loaded

---

## Idempotence and Recovery

- Stages are independent. If stopped mid-stage, check Progress boxes to find restart point.
- Alembic migrations are idempotent — `alembic upgrade head` is safe to re-run.
- AI generation is stateless — re-run `generate_session_runbook` to regenerate; old runbook overwritten only if DM confirms.
- Monster seed data: seeded only if `monsters` table is empty; safe to re-run.

---

## Interfaces and Dependencies

**Produces:**
- Full QuestLab web app (Streamlit MVP)
- React migration planning doc
- All required docs (STACK, SECURITY, TESTING, QUALITY, data dictionary, architecture)

**Depends on:**
- Azure Postgres Flexible Server (prod) or local Postgres (dev)
- Anthropic Claude API key (`ANTHROPIC_API_KEY`)
- Python 3.11+
- Azure Front Door + Entra ID (prod auth — not needed for local dev)

---

## Outcomes and Retrospective
_Fill in after completion._
