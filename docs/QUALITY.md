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
| SEC-002 | Projector link / party list / join roster expose every PC UUID; a PC UUID writes that sheet. Needs per-PC `play_token` (schema) | High | 2026-10-30 | |
| SEC-003 | Catalog monsters/items/spells editable and deletable by any DM (no owner on items/spells; `PATCH /items` writes from the router) | High | 2026-10-30 | |
| SEC-004 | Uploads take the extension from the client filename → `.html`/`.svg` served from the API origin (stored XSS); no `nosniff` | High | 2026-10-30 | |
| SEC-005 | Fog of war client-side; `/stream/campaign` ignores join code; session/combat PC ids unchecked vs campaign; crier webhook URL unrestricted (SSRF); inventory notes-only PATCH skips row check | Medium | 2026-10-30 | |
| SEC-006 | ~~`/play/{pc}` returns the DM notes field~~ (fixed, Plan 122); feature spend skips PC check; arena accepts other-campaign PCs; `buy` ignores hidden shops | Low | 2026-10-30 | |
| TD-121a | Lamplit page passes not yet done: Shops, Admin, Notebook, Puzzles, Town Crier, Map Builder, compendium pages, TableView/BoardView/LiveBoardPane (TV), GuidePage (still names old labels and the TV board), Arena DM side. Legacy tokens keep them readable meanwhile | Medium | 2026-10-30 | Plan 121 step 7 |
| TD-121b | `components/dice-tray/PlayerDice.tsx` and `components/character-sheet/RollToast.tsx` are no longer imported (the phone has its own roll sheet). Remove with Justin's OK | Low | 2026-10-30 | |
| UX-001 | HUD: two HP controls per PC (±1 batch on the card vs typed amount on the strip); no clear "start the fight" moment (party seeds as an idle roster showing End turn); card conditions outside combat are local-only; "Next hit" is jargon for the private 3D table | Medium | 2026-10-30 | Plan 121 step 10 |
| UX-002 | Sessions: no rename from lists (quick sessions all "Quick session, Oct 30"); status only moves forward; "Up next" compares against UTC today; ISO dates shown raw; arcs managed in two places | Medium | 2026-10-30 | Plan 121 step 10 |
| UX-003 | Characters: cards embed full inventory/spells/features (very long); DM sheet header fixed and eats half a phone; join settings crowd the header. NPCs: one very long editor form; "Reveal true form" click also opens the editor (event bubbles). Encounters: difficulty shown from two sources; breadcrumb not keyboard-reachable. Battle maps: "drop here" area misses the drop handler | Medium | 2026-10-30 | Plan 121 step 10 |

## Definition of Done (per task)
- [ ] `pytest -q` — zero failures
- [ ] `black . && isort . && flake8 && interrogate -c pyproject.toml` — zero errors
- [ ] `pip-audit` — no known vulnerabilities
- [ ] Schema changes have an Alembic migration
- [ ] Docs updated to reflect structural changes
