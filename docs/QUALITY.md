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
| TD-128c | The sample night's pregens (`onboarding_service._PREGENS`) carry no `class_choices`, so they are built with the lenient rules and arrive without Fighting Style, Weapon Mastery and the rest (the build's warnings say what is open) | Low | 2026-10-31 | |
| TD-128d | Nothing in the frontend displays `feats` yet, so class choices ("Divine Order: Protector", "Weapon Mastery: Longsword", a Fighting Style feat by its name) are invisible on the DM sheet and the phone. They also appear in the DM-only `notes` line "Class choices: …" | Medium | 2026-10-31 | |
| TD-128e | Font of Inspiration (Bard 5: Bardic Inspiration also comes back on a Short Rest) isn't in `rest_service`; the catalog row stays a Long Rest recovery | Low | 2026-10-31 | |
| TD-128f | `levelup_2024` lists Fighter 9 as "Master of Armaments"; SRD 5.2.1 calls it "Tactical Master" | Low | 2026-10-31 | |
| TD-128g | Old "Song of Rest" catalog rows (a 2014 Bard feature, gone from the 2024 catalog) stay in existing databases and on the PCs that were granted them; seeding never deletes. Removing them needs Justin's OK | Low | 2026-10-31 | |
| TD-128h | From the phone, a player can heal only themselves ("It's for me"); healing a friend means telling the DM. Boss battles are the exception (Plan 116) | Low | 2026-10-31 | |
| TD-128i | Player feedback (`POST /api/play/{key}/feedback`) has only the per-IP writes throttle (`RATE_LIMIT_WRITES_PER_MIN`, 120); there is no per-link limit | Low | 2026-10-31 | |
| TD-128j | Uploads (portraits, maps, figures) stay in Vercel Blob after their campaign is deleted; the orphan sweep script is still open (storage cost on the Pro tier) | Medium | 2026-10-31 | |
| TD-128k | eslint: 17 legacy errors in files no recent plan touched (`Confetti`, `notebook/EntityPicker`, `notebook/blocks`, `InventoryPanel`, `Toast`, `HitDiceTracker`, `RollHelper`, `RollToast`, `DmScreen`). CI runs eslint as information only; `tsc` and the build are the hard gate | Low | 2026-10-31 | |
| UX-003 | Characters: cards embed full inventory/spells/features (very long); DM sheet header fixed and eats half a phone; join settings crowd the header. NPCs: one very long editor form; "Reveal true form" click also opens the editor (event bubbles). Encounters: difficulty shown from two sources; breadcrumb not keyboard-reachable. Battle maps: "drop here" area misses the drop handler | Medium | 2026-10-30 | Plan 121 step 10 |

## Definition of Done (per task)
- [ ] `pytest -q` — zero failures
- [ ] `black . && isort . && flake8 && interrogate -c pyproject.toml` — zero errors
- [ ] `pip-audit` — no known vulnerabilities
- [ ] Schema changes have an Alembic migration
- [ ] Docs updated to reflect structural changes
