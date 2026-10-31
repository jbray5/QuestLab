# QuestLab — Testing Strategy

## Framework
- **pytest 8.0+** with `--tb=short`
- All tests in `tests/` directory, mirroring source structure.

## Test Database
- Tests use **DuckDB in-memory** via the `duckdb_session` fixture in `conftest.py`.
- Never require a live Postgres connection in CI.
- `SQLModel.metadata.create_all(engine)` creates schema from models at test start.
- Both conftests (`tests/conftest.py`, `tests/test_api/conftest.py`) then call `db.base.relax_duckdb_indexes(engine)`, as local DuckDB files do. It drops `ix_player_characters_play_token`, because DuckDB turns an update of an indexed column into delete + insert, and its foreign keys refuse that. Postgres keeps the unique index (Plan 128).

## Test Layout
```
tests/
  conftest.py              — shared fixtures (duckdb_session, dev_env)
  test_domain/             — Pydantic model validation (field constraints, computed props)
  test_services/           — business logic, authz enforcement (mocked repos)
  test_repos/              — DB query correctness (duckdb_session fixture)
  test_integrations/       — identity parsing, encounter math, Claude client (mocked)
```

## Fixture Reference
| Fixture | Scope | Purpose |
|---|---|---|
| `duckdb_engine` | session | In-memory DuckDB engine with all tables |
| `duckdb_session` | function | Managed session, rolls back after each test |
| `dev_env` | function | Sets ENV=development, CURRENT_USER_EMAIL for identity tests |

## Required Test Cases (by stage)
### Stage 1
- `test_identity.py` — header extraction, dev fallback, fail-closed in prod
- `test_db_base.py` — connection string construction, unknown backend error

### Stage 2
- `test_domain/` — all model field validators, enum values, computed fields (proficiency bonus, spell slots)

### Stage 3
- `test_repos/` — CRUD for each repo (create, get, list, update, delete)

### Stage 6
- `test_integrations/test_encounter_math.py` — known CR/party-size/difficulty combinations

### Stage 7
- (Removed in Plan 124: the AI service and its mocked-Claude tests. `test_api/test_plan86_no_ai.py` now asserts every former generation route is gone.)

### Plan 124 — safe to share
- `test_api/test_sec002_play_links.py` — token links open; a new PC's UUID is 410 with the campaign; the grace period; reset kills old token and UUID; only the owner resets; roster gives keys; join code; PC stream; feature-row ownership; one-campaign duels
- `test_api/test_sec003_catalog.py` — shared rows admin-only; homebrew is its author's; lists scoped
- `test_api/test_sec004_uploads.py` — magic-byte typing; HTML/SVG refused; served uploads inert and nosniff
- `test_services/test_sec005_hardening.py` — crier webhook host check; inventory owner checks; session/tracker PCs from the campaign
- `test_api/test_ux001_conditions.py` — conditions last between fights and reach the phone; players can't set them
- Older suites that address players by UUID opt into `conftest.uuid_play_links` (pre-token links)

### Plan 115 — level-up guide
- `test_services/test_levelup_service.py` — the live party at L3→4 as goldens (average HP 28 / 34 / 28 / 29; spell picks 1+1, 1+1, 0+1, none), feat prerequisites, ASI shape and the 20 cap, retroactive CON and Tough HP, swaps limited to class-list spells, multi-level grants. An autouse fixture deletes `character_spells` after each test: a leftover row pins its spell and breaks later suites that wipe the spells table.
- `test_integrations/test_levelup_rules.py` — class tables, feat catalog shape, scaling notes
- `test_api/test_levelup_api.py` — no grant → 404/422 on the player routes; grant is DM-only

### Plan 126 — the guided character wizard for DMs, with improvements
- `test_services/test_plan126_builder_asi.py` — a level-4 build needs exactly one improvement; a Fighter at 6 has two (4 and 6), a Rogue at 10 three; wrong levels and early picks are refused; a +2 past 20 is refused (+1/+1 still fits); a feat whose prerequisite isn't met is refused (War Caster without spellcasting, Heavy Armor Master without heavy armor, GWM with STR 10), checked against the build so far (STR 12 → +1 at 4 → GWM at 6); a feat can't be taken twice; CON from an improvement raises HP at every level (40 → 44 at level 4); DEX feeds AC and skills; Resilient/Skilled/Fey Touched land on saves, skills and spells; a feat spell can't double a class pick; a book feat is recorded by name; Paladin spell levels on time; every SRD subclass's features sit on its class's subclass levels; options carry the improvement data
- `test_api/test_plan126_dm_wizard.py` — the DM routes need no join code and ignore the sign-up switch (the player routes stay shut); owner only (403 for another DM, 401 without identity, 404 for an unknown campaign, nothing created on refusal); a DM build lands with "Not assigned yet" and a player link; a level-6 Fighter with one pick is a 422, with two it lands with both on the sheet

### Plan 116 — boss battles on everyone's own phone
- `test_services/test_plan116_boss_live.py` — only the boss is referee-played; out-of-turn acts refused; the boss picks its victim (`_RNG.choice`); a seat can be handed to the referee (own, or whoever is up — never one merely waiting; never the last person) and taken back; heals and Lay on Hands land on a friend, a downed friend included. Boss blocks use a `1d1` attack so a scripted fight never ends by itself.
- `test_api/test_plan104_duels.py::test_a_boss_battle_on_everyones_phone` — the same over HTTP: 403 for a waiting seat, 404 for an unknown boss

### Plan 122 — the companion phone's player-link verbs
- `test_api/test_plan122_player_companion.py` — advantage keeps the higher d20; typed-in real dice are logged as given (wrong face or count → 422); the turn kit groups a wizard's Fire Bolt as an action with its to-hit and lists Opportunity Attack as a reaction; a rogue gets Cunning Action and the Sneak Attack tip; casting spends the slot chosen (cantrips free, rituals free, unprepared refused, below the spell's level refused, out of slots → 409); another PC's spell row → 404; preparing respects class (sorcerers can't) and cantrips; player notes round-trip and the DM's `notes` never appear in `/play` responses; temp HP is player-writable within 0–999 while level stays DM-only; off your turn the phone gets the running order (who's up, foes marked, your own row flagged).

### Plan 128 — persona run 3 fixes
- `test_services/test_plan128_builder_rules.py`:
  - the subclass is required at its level (a book subclass is recorded by name);
  - a Bard must pick its cantrip and spell counts; off-list and too-high spells are refused;
  - a build without `class_choices` (an older caller) keeps the lenient rules and is told what's still open;
  - always-prepared spells come free (Paladin 5: Divine Smite, Find Steed and oath spells; Ranger 1: Hunter's Mark; the subclass and Land tables);
  - Magic Initiate picks from the background's list, and a Human's Versatile feat has its own picks;
  - a Fighter picks its style and masteries, and masteries follow the class; unknown and unasked choices are refused;
  - `feat_rules.apply_class_choices` without a database: counts by level, Orders and extra cantrips, invocation prerequisites, Champion styles, Metamagic, Land, skill choices;
  - options carry each spell's details and hide other DMs' homebrew.
- `test_services/test_plan128_feature_catalog.py`:
  - every SRD class's limited-use features arrive at the right level with the right uses; Rage and Wild Shape regain one use on a Short Rest;
  - catalog identities are unique, and SRD rows match the class tables;
  - seeding: migration 0036's two planted rows no longer block the rest; new rows reach existing characters once; an old row's formula and recovery are corrected in place, keeping its id;
  - `sync_for_level` works from an empty catalog; a subclass matches however it was written;
  - Lay on Hands is a 25-point pool at level 5, spent in any amount and clamped at empty;
  - `features_for_level` lists the passives (Extra Attack, Weapon Mastery, Fighting Style), and every SRD feature has a note;
  - turn kit: no Smite at Paladin 1 unless prepared, always at 2; Lay on Hands is a Bonus Action with its pool; Cure Wounds heals; uses left come from the sheet;
  - `heal_dice` (Cure Wounds 2d8+3 at 1st, 4d8+3 at 2nd), and `cast_spell` returns it.
- `test_services/test_feature_service.py`: a same-name row for another subclass is its own row; the real catalog seeds onto a partial table.
- `test_services/test_table_service.py::test_tv_gets_class_and_picture_for_pcs_only`: PC tokens and order rows carry the class and picture; foes and markers carry neither; a class stored on a token is never trusted.
- `test_api/test_plan128_class_features_api.py`: the DM gets every feature at the level (Aura of Protection with its bonus at 6); another DM gets 403, a missing PC 404, no identity 401; the phone gets the same list; tracked features reach the phone after sync.
- `test_api/test_plan128_pools.py`: the phone spends 7 of 25 points in one call; asking for more than is left stops at empty; `amount` of 0, −3 or 101 is a 422; the DM spends 5 and gives 2 back.
- `test_api/test_plan128_player_phone.py`: a player names themselves (trimmed; the DM sees it); blank, too-long and non-text names get a field-level 422, while 100 characters is fine; feedback lands under the character, prefixed with its name; an unknown link is a 404, and an empty or 4,001-character note is a 422, with nothing stored; a reset link can't send feedback.
- `test_api/test_plan128_runbook_scenes.py`: scenes are added, renamed, reordered and deleted as one PATCH of the list; a scene keeps a fight from its own arc and drops any other; another DM can't patch the scenes.
- `test_api/test_plan128_uploads.py`: with a blob token, a portrait is stored under `portraits/` and the blob URL is returned; without one, it goes to `uploads/`.
- `test_api/test_sec002_play_links.py::test_reset_works_for_a_pc_with_features`: Reset link works for a PC with feature rows on DuckDB. It used to 500.

### Plan 130 — pricing (Free and Patron)
Both files set `PRICING` per test (`monkeypatch.setenv("PRICING", "on")`; the default is off) and
use fresh emails, because service tests share one session-scoped engine and services commit.
- `test_services/test_plan130_plans.py`:
  - **Membership parsing** from fixture JSON, with no network: active, declined, another
    campaign, missing, annual $40 counting as $4 a month, an annual low tier not counting, the
    entitled tier's price winning over a converted local amount, and active winning over former.
  - **Plan rules:** admin, comped, active and recent Patreon, lapsed (41 days, while 40 still
    counts), low tier, inactive or never checked; `apply_membership` writes or leaves the snapshot.
  - **Caps off vs on** for campaigns (including through `campaign_service.create_campaign`) and
    uploads (exactly at the line is fine). Patrons get 5 GB and admins have no cap. Patrons
    skip the old 20-campaign soft limit, free DMs don't.
  - The ledger feeds usage, the beta status, and admin-only comp.
- `test_api/test_plan130_pricing.py`:
  - `GET /api/me/plan` in the beta and for an admin, and a 401 without a DM.
  - 402s: the third campaign (exact message, nothing hidden), all three upload routes past
    storage (a refused file is neither stored nor counted), a bad file still answering 415.
  - The ledger records portrait, map and model uploads.
  - **Patreon link:** the state names the signed-in DM, with scope
    `identity identity.memberships`. Link then confirm makes a Patron, and no session token
    rides the callback. A low tier says so. Another DM can't confirm someone else's link (403).
    A Patreon id already linked elsewhere is refused at the callback, and at confirm if it
    happened in between (409). A tampered result, a cancelled link and an unconfigured Patreon
    are all handled.
  - A Patreon sign-in refreshes the membership.
  - **Admin comp:** admin-only, toggles both ways, shows in the beta overview, and an unknown
    email is a 404.

## Running Tests
```bash
pytest -q                        # all tests
pytest tests/test_integrations/  # specific module
pytest -k "test_identity"        # by name pattern
pytest --cov=. --cov-report=term # with coverage
```

## Coverage Target
80% line coverage enforced via CI. Coverage report generated on every run.
