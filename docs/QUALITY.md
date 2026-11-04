# QuestLab — Quality Gate Status and Tech Debt Register

## Quality Gate Status

| Gate | Tool | Threshold | Status |
|---|---|---|---|
| Formatting | black (line-length=100) | Zero diffs | ✅ Enforced |
| Import order | isort (profile=black) | Zero diffs | ✅ Enforced |
| Linting | flake8 (max-line-length=100) | Zero errors | ✅ Enforced |
| Docstring coverage | interrogate | ≥ 80% | ✅ Enforced |
| Vulnerability scan | pip-audit | No known CVEs | ✅ Enforced |
| Test suite | pytest | Zero failures | ✅ Enforced |
| Schema migrations | Alembic | All models have migration | ✅ Enforced |

All gates run in CI (GitHub Actions) on every push to `main` and all PRs.
All gates also run as pre-commit hooks.

## Architecture Boundary Rules

| Boundary | Rule | Enforcement |
|---|---|---|
| `pages/` | UI only. No business logic. No DB access. | Code review |
| `services/` | All business logic and authz. | Code review |
| `domain/` | Models only. No DB sessions, no service calls. | Code review |
| `db/repos/` | DB queries only. No business logic. | Code review |
| `integrations/` | External adapters only. | Code review |

Any import violation is a bug. Add import boundary tests in Stage 3.

## Tech Debt Register

| ID | Description | Severity | Created | Resolved |
|---|---|---|---|---|
| TD-001 | Streamlit MVP — replace with React/FastAPI | Medium | Stage 1 | Stage 10 |
| TD-002 | Map builder uses SVG grid, not a proper canvas | Low | Stage 8 | React phase |
| TD-003 | Monster SRD data hardcoded; needs admin UI for custom monsters | Low | Stage 6 | Stage 6+ |
| TD-004 | py 1.11.0 PYSEC-2022-42969 ReDoS — transitive dep of interrogate; no fix available (unmaintained). Suppressed via `--ignore-vuln`. | Low | Stage 1 | When interrogate drops py dep |
| SEC-001 | Prod header mode trusts any email (no edge auth). Code fixed (Plan 120); **closed when Render runs `AUTH_MODE=oauth`** (LAUNCH.md §0) | Critical | 2026-10-30 | |
| SEC-002 | Projector link / party list / join roster expose every PC UUID; a PC UUID writes that sheet. Fixed: per-PC `play_token` links + DM reset; UUID links only until 2026-12-01 (migration 0057) | High | 2026-10-30 | 2026-10-31 |
| SEC-003 | Catalog monsters/items/spells editable and deletable by any DM. Fixed: `created_by_email` on items/spells (migration 0056); shared rows admin-only, homebrew author-only; lists scoped | High | 2026-10-30 | 2026-10-31 |
| SEC-004 | Uploads took the extension from the client filename → stored XSS. Fixed: magic-byte typing, media-only `/uploads/`, `nosniff` + sandbox CSP | High | 2026-10-30 | 2026-10-31 |
| SEC-005 | Open: fog of war client-side (private TV board); `/stream/campaign` unauthenticated (ids it carries are no longer keys). Fixed 10/31: session/combat PC ids checked vs campaign; crier webhook host-checked; inventory notes/read owner-checked | Medium | 2026-10-30 | |
| SEC-006 | `/play` DM notes (Plan 122), feature spend PC check, arena one-campaign check — fixed; hidden-shop buying is by design (the direct link is the reveal) | Low | 2026-10-30 | 2026-10-31 |
| TD-121a | Lamplit page passes left: the Arena DM side. Done 10/31 in Plan 123: Shops, Admin, Notebook, Puzzles, Town Crier, Map Builder, compendium, GuidePage (rewritten to the public story). Done 10/31 in Plan 128: TableView, BoardView's labels and the HUD's Live pane (`LiveBoardPane`): line icons instead of emoji, no all caps | Low | 2026-10-30 | Plan 124 step 2 |
| TD-121b | `components/dice-tray/PlayerDice.tsx` and `components/character-sheet/RollToast.tsx` are no longer imported (the phone has its own roll sheet). Remove with Justin's OK | Low | 2026-10-30 | |
| UX-001 | ~~HUD: two HP controls; no clear start to the fight; local-only card conditions; "Next hit" jargon~~ Fixed 10/31 (Plan 124): one amount-then-−/+ pattern on card and tracker; "Start the fight" and no End turn until initiative is rolled; conditions saved on the character (migration 0058) and shown on the phone; "Next hit" only for DMs who open the 3D table | Medium | 2026-10-30 | 2026-10-31 |
| UX-002 | Sessions: no rename from lists (quick sessions all "Quick session, Oct 30"); status only moves forward; "Up next" compares against UTC today; ISO dates shown raw; arcs managed in two places | Medium | 2026-10-30 | Plan 121 step 10 |
| TD-126a | ~~Character wizard: class-feature *choices* are named and explained but not picked in the wizard (Fighting Style feat at 1, Expertise, Divine Order / Primal Order, Primal Knowledge's skill, Eldritch Invocations, Metamagic, College of Lore's three skills, Hunter's Prey); the background's Magic Initiate spells aren't picked either~~ Fixed 10/31 (Plan 128): the wizard's "Class choices" step and Magic Initiate picks, checked on the server (`feat_rules.apply_class_choices`) and stored in `feats` as "Label: Choice" (a Fighting Style feat by its name; skill and Expertise picks go to the skills). What is still open is in TD-128a | Low | 2026-10-31 | 2026-10-31 |
| TD-128a | Character wizard, left after Plan 128: the Wizard's starting spellbook (six level 1 spells) isn't picked, only the prepared spells; Warlock Mystic Arcanum and College of Lore's Magical Discoveries aren't picked; Pact of the Tome's and Lessons of the First Ones' own picks are recorded by name only. An Epic Boon from the book is capped at 20 like every other increase (the book allows 30), matching the level-up guide | Low | 2026-10-31 | |
| TD-128b | The level-up guide doesn't ask for new class choices at higher levels (more Invocations, Metamagic, Expertise or Weapon Mastery). The rules are ready to share in `feat_rules.apply_class_choices` | Medium | 2026-10-31 | |
| TD-128c | ~~The sample night's pregens (`onboarding_service._PREGENS`) carry no `class_choices`, so they are built with the lenient rules and arrive without Fighting Style, Weapon Mastery and the rest (the build's warnings say what is open)~~ Moot 10/31 (Plan 129): the sample night and its pregens were removed | Low | 2026-10-31 | 2026-10-31 |
| TD-128d | Nothing in the frontend displays `feats` yet, so class choices ("Divine Order: Protector", "Weapon Mastery: Longsword", a Fighting Style feat by its name) are invisible on the DM sheet and the phone. They also appear in the DM-only `notes` line "Class choices: …" | Medium | 2026-10-31 | |
| TD-128e | Font of Inspiration (Bard 5: Bardic Inspiration also comes back on a Short Rest) isn't in `rest_service`; the catalog row stays a Long Rest recovery | Low | 2026-10-31 | |
| TD-128f | `levelup_2024` lists Fighter 9 as "Master of Armaments"; SRD 5.2.1 calls it "Tactical Master" | Low | 2026-10-31 | |
| TD-128g | Old "Song of Rest" catalog rows (a 2014 Bard feature, gone from the 2024 catalog) stay in existing databases and on the PCs that were granted them; seeding never deletes. Removing them needs Justin's OK | Low | 2026-10-31 | |
| TD-128h | From the phone, a player can heal only themselves ("It's for me"); healing a friend means telling the DM. Boss battles are the exception (Plan 116) | Low | 2026-10-31 | |
| TD-128i | Player feedback (`POST /api/play/{key}/feedback`) has only the per-IP writes throttle (`RATE_LIMIT_WRITES_PER_MIN`, 120); there is no per-link limit | Low | 2026-10-31 | |
| TD-128j | Uploads (portraits, maps, figures) stay in Vercel Blob after their campaign is deleted; the orphan sweep script is still open (storage cost on the Pro tier) | Medium | 2026-10-31 | |
| TD-128k | eslint: 17 legacy errors in files no recent plan touched (`Confetti`, `notebook/EntityPicker`, `notebook/blocks`, `Toast`, `HitDiceTracker`, `RollHelper`, `RollToast`, `DmScreen`). CI runs eslint as information only; `tsc` and the build are the hard gate | Low | 2026-10-31 | |
| TD-130a | Storage use (the uploads ledger, Plan 130) only grows: replacing a portrait, deleting a map or deleting a campaign doesn't lower it, so a Free DM who swaps pictures often reaches 250 MB sooner than their real use. Fix before `PRICING=on`, with the orphan sweep (TD-128j): drop ledger rows (and blobs) that nothing points at | Medium | 2026-10-31 | |
| TD-130b | ~~Admin "Give Patron" saves through `UserRepo.save`, which bumps the DM's `last_seen_at`, so the beta table's "Last seen" shows the comp time. Needs a `touch=False` option on `UserRepo.save`~~ Fixed 10/31: `UserRepo.save(touch=False)` for the admin comp | Low | 2026-10-31 | 2026-10-31 |
| TD-130c | The map, figure and notebook upload screens (`BattleMaps`, `NpcModal`, `ModelUpload`, notebook `blocks`) show the 402's plain message but not the "See your plan" link that `ImageUpload` and Campaigns show | Low | 2026-10-31 | |
| TD-130d | ~~`domain/__init__.py` and `alembic/env.py` don't import `domain.upload` (nor `domain.user`); the tables register because the routers import them. Add both so `create_all` and autogenerate never depend on import order~~ Fixed 10/31: `domain/__init__.py` registers `User` and `Upload`, so Alembic's metadata (which imports `domain`) sees both | Low | 2026-10-31 | 2026-10-31 |
| TD-131a | ~~2024 long rests give back half the PC's Hit Dice (`rest_service._hit_dice_regained`, from Plan 00024, pinned by `test_caster_stats`); the 2024 rules restore all of them. 2014 is correct. Found in Plan 131; not changed there because a 2024 table must not change inside that plan~~ Fixed 11/04 (Plan 134): a 2024 long rest gives back all spent Hit Dice; 2014 keeps half | Medium | 2026-11-01 | 2026-11-04 |
| TD-131b | The "2024" DM screen content (`dm-screen-content.ts`) is partly 2014: the action list, Long Rest (half the Hit Dice), grapple and shove as contested checks, Absorb Elements. Needs a 2024 content pass. The 2014 variant (`DM_SCREEN_TABS_2014`) is correct | Medium | 2026-11-01 | |
| TD-131c | Bardic Inspiration never refills on a Short Rest from level 5 (Font of Inspiration), in either edition; the tracker row is LONG and only its description says so | Low | 2026-11-01 | |
| TD-131d | The immersive Arena's practice fights stay 2024-flavoured: a 2014 sheet builds and fights, but the 2014-only turn options (Channel Divinity, Divine Sense, Step of the Wind) answer "That feature isn't modeled yet", and Font of Magic levels, flat +2 rage and uncapped smite are 2024. The Arena is private and admin-only; the phone's 2014 turn kit is correct | Low | 2026-11-01 | |
| TD-131e | The 2014 content is SRD 5.1 only: 9 races, one subclass per class, the Acolyte, the Grappler feat. Everything else comes in by name with "From my book" (no mechanics). Same pattern as 2024 book content | Low | 2026-11-01 | |
| TD-131f | Dragonborn Breath Weapon and Half-Orc Relentless Endurance have no tracker rows in either edition: the feature catalog is class-only (`class_features.character_class` is required) | Low | 2026-11-01 | |
| TD-131g | ~~2024 phones never show the turn kit's `free` options (Action Surge, Reckless Attack, Stunning Strike, Quickened Spell): `NowTab` renders the "No action needed" panel only for 2014. One-line fix (drop the `old ?` gate in `const free`); left for a 2024 pass~~ Fixed 11/04 (Plan 134): the Now tab shows "No action needed" for 2024 too | Medium | 2026-11-01 | 2026-11-04 |
| TD-131h | 2024 turn kit: Eldritch Blast adds CHA for every Warlock 2+ without checking for Agonizing Blast; "Cunning Action: Dodge" is an Arena simplification shown on the phone; neither edition offers Bardic Inspiration itself as a bonus action | Low | 2026-11-01 | |
| TD-131i | ~~The 2024 level-up guide never asks the class's own later choices (more invocations at 5, Expertise at Rogue 6, Metamagic at 10, and so on); the 2014 guide does (`LevelUpPlan.class_choices`). Port the 2014 path to 2024~~ Fixed 11/04 (Plan 134): the 2024 level-up asks the class's later choices (invocations, Expertise, Metamagic, Weapon Mastery...) | Medium | 2026-11-01 | 2026-11-04 |
| TD-131j | ~~The 2024 level-up never adds spells that become always prepared at a later level (domain spells at Cleric 3, oath spells, circle spells); the 2014 guide does (`SpellStep.always_prepared`)~~ Fixed 11/04 (Plan 134): the 2024 level-up adds always-prepared spells as they arrive, and the phone doesn't count them against the daily number | Medium | 2026-11-01 | 2026-11-04 |
| TD-131k | 2014 level-up: Pact of the Chain's Find Familiar and Pact of the Tome's three cantrips aren't granted, and swapping one invocation per Warlock level isn't offered. The picks are recorded; the extras are played from the book | Low | 2026-11-01 | |
| TD-131l | ~~The builder's AC subtracts a negative DEX modifier in heavy armor (`min(dex, 0)` in `_armor_class`, both editions); heavy armor ignores DEX either way. Found in Plan 131, left because it changes 2024 sheets~~ Fixed 11/04 (Plan 134): heavy armor ignores DEX in the builder and wizard | Medium | 2026-11-01 | 2026-11-04 |
| TD-131m | A 2014 High Elf who isn't a Wizard: the race's Wizard cantrip isn't recorded apart from the class cantrips (the notes say it's cast with INT) | Low | 2026-11-01 | |
| TD-132a | `GET /api/monsters/{id}`, `/items/{id}` and `/spells/{id}` return a row whatever its owner (the lists, the level-up guide, `learn_spell` and inventory adds are filtered). The ids are random UUIDs, so another DM's homebrew is only reachable by someone who already has its id. The DM's own panels fetch known rows by id, so filtering needs care | Low | 2026-11-01 | |
| TD-133a | Battle-map scale is fixed text ("1 square = 5 ft"); a per-map feet value needs a column (Plan 133 kept it migration-free) | Low | 2026-11-03 | |
| TD-133b | Fog can't "start uncovered and hide chosen areas": a `cover` flag fits in the fog areas' JSON, but the player projection (`table_service`, `domain/table_state.py`) and every fog renderer (`MapCanvas`, the 3D board) would need covered regions | Medium | 2026-11-03 | |
| TD-133c | On the TV and remote windows a long strip map shows whole but small (about 240 px wide at 720p); a camera that follows the party needs a viewport in the table state | Low | 2026-11-03 | |
| TD-133d | Dev only: `vite.config.ts` proxies `/uploads` to `:8000`, so with the API on another port uploaded art shows broken locally | Low | 2026-11-03 | |
| UX-003 | Characters: cards embed full inventory/spells/features (very long); DM sheet header fixed and eats half a phone; join settings crowd the header. NPCs: one very long editor form; "Reveal true form" click also opens the editor (event bubbles). Encounters: difficulty shown from two sources; breadcrumb not keyboard-reachable. Battle maps: "drop here" area misses the drop handler | Medium | 2026-10-30 | Plan 121 step 10 |

## Definition of Done (per task)
- [ ] `pytest -q` — zero failures
- [ ] `black . && isort . && flake8 && interrogate -c pyproject.toml` — zero errors
- [ ] `pip-audit` — no known vulnerabilities
- [ ] Schema changes have an Alembic migration
- [ ] Docs updated to reflect structural changes
