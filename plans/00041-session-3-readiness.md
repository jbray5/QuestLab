# Plan 00041 — Session 3 Readiness

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-07-03
**Last updated:** 2026-07-03 — Phases 0 & 1 code-complete + verified green (577 backend tests incl. 13 new combat tests; frontend `tsc -b` clean; migration 0019 offline SQL valid). Remaining: user actions (Render tier check, DATABASE_URL secret, untrack backups, branch protection), commit/push, and a live at-the-table drill.
**Implemented by:** Claude (Fable 5)

---

## Purpose
Combat tracking failed live in Session 2: the DM fell back to pencil-and-paper for
initiative/HP and used the app only to ding player HP in real time. Root cause is a
cluster of verified combat-state bugs — roster edits wipe round/conditions/beats,
combat "active" is inferred so false "your turn" pings and stale-session state leak to
player phones, displayed initiative order diverges from the server turn order, the roll
helper can crash the whole HUD, and monster AC is lost on refresh. This plan makes
combat state trustworthy enough that the DM runs Session 3 on the app with no paper
fallback. Secondary: unblock the 2-week-red CI so these combat changes are actually
guarded, and secure the live campaign data (verify Render DB tier + automate backups).

Done = a DM can roll initiative, add a late-arriving PC mid-fight, tag conditions, drop
a monster, and refresh the browser — and lose nothing; players never see a turn banner
that isn't real; and the live DB has an automated backup.

---

## Progress
_Update every time you stop. Phased — Phase 0 first (enables safe change), then 1, then 2._

### Phase 0 — Safety net (unblock + guard)
- [x] 0.1 `black` reformat the 3 Plan-40 files. `black --check .` clean (172 files).
- [x] 0.2 Pinned `msgpack>=1.2.1` (approved); upgraded venv; `pip-audit` reports no vulns. Installed `pre-commit` + `pre-commit install` (root cause of the silent CI break: pre-commit was never installed).
- [x] 0.3 pre-commit hooks installed. **Branch protection (require CI on main) is a GitHub-settings action for the owner — not code.**
- [x] 0.4 API test scaffold `tests/test_api/conftest.py` (TestClient, DB override, lifespan skipped) + `test_combat_api.py` (4 tests: 401/403 authz + add/remove endpoints). Plus service-level `tests/test_services/test_combat_lifecycle.py` (9 tests) covering every fix.
- [x] 0.5 Frontend CI job added to `.github/workflows/ci.yml` (npm ci → `npm run build` hard gate → eslint informational). Also dropped `ANTHROPIC_API_KEY` from the pytest env (AI is mocked).

### Phase 1 — Combat state the DM can trust
- [x] 1.1 Incremental roster ops. `add_combatant` / `remove_combatant` in session_service preserve surviving rows (UUIDs stable → beats survive), round, active pointer, conditions. Endpoints `POST/DELETE /sessions/{id}/combat/combatants`. Store gained `addCombatant`/`removeCombatant`; SessionHud add/remove/load-encounter now use them instead of `replaceFromRoll`.
- [x] 1.2 Explicit lifecycle. Migration 0019 adds `sessions.combat_state` (**plain `str` column, server_default 'idle' — deliberately NOT sa.Enum, to avoid the enum name/value storage drift flagged in the review**). save_combat_state honors it (idle seed → no active, no ping); player lookups filter `combat_state=='running'`; advance-to-Complete + End Combat set 'ended'. Store carries `combatState`; seed sends "idle", Roll Init sends "running".
- [x] 1.3 Initiative order unified. `update_combatant` recomputes `sort_index` (initiative desc, dex, name) when initiative changes + publishes session.combat.updated. Store `setInitiative` PATCHes immediately (was silently dropped by the debounced HP sync); HUD inline editor wired to it.
- [x] 1.4 RollHelper crash fixed structurally: guard split into a thin wrapper + `RollHelperInner` so hook order is always stable. Also fixed one in-scope eslint error (SessionHud toggleCondition ternary-statement). **~20 pre-existing eslint errors in legacy components remain (backlog; CI eslint is informational).**
- [x] 1.5 Monster AC persisted. Migration 0019 adds `session_combatants.ac` (nullable). Carried through Create/Read/Update + the loose Combatant shape; `acFor` reads the row; the `setTimeout` name-match `acOverrides` hack is deleted.
- [x] 1.6 `advance_combat_turn` walks the full order with real wrap detection — a defeated/removed active combatant advances to the next living one without a spurious round bump. Regression test `test_defeated_active_skips_without_round_bump`.

### Phase 2 — Live data safety
- [~] 2.1 render.yaml annotated with a DRIFT WARNING on the DB `plan` (paid tier set in dashboard doesn't sync back; re-apply could downgrade). **User action: confirm questlab-db shows a paid tier in the Render dashboard, and set the real tier in render.yaml.**
- [x] 2.2 `.github/workflows/backup.yml` — daily `pg_dump` (postgres:16 via docker) → GitHub artifact (30-day retention), no-ops if the secret is missing. `.gitignore` now excludes `campaigns/backups/`. **User actions: add the `DATABASE_URL` repo secret (Render external URL); `git rm -r --cached campaigns/backups/` to untrack the committed PII snapshot.**

---

## Surprises and Discoveries
- Phase 0.1 already applied this session — the 3 files were the entire black failure; repo-wide `black --check` clean afterward.
- render.yaml still declares `plan: free` for BOTH the web service (L19) and database (L75). If the owner upgraded via the Render dashboard, the blueprint has drifted and a future re-apply could attempt a downgrade — 2.1 reconciles this.
- `save_combat_state` (services/session_service.py:654-681) already guards the *emit* against deleted active-id rows, but still force-selects `created[0]` as active and writes the client-sent `round` verbatim — so the reset-to-1 comes from the frontend payload (`useInitiativeStore.replaceFromRoll` hardcodes `round:1, active_combatant_id:null`), not the server. Fix landed on both sides.
- **pre-commit was never installed in the venv** (`No module named pre_commit`) — the root cause of how the black gate silently broke for 2 weeks. The `.pre-commit-config.yaml` was committed but hooks were never active. Fixed by `pip install pre-commit && pre-commit install`.
- 9 existing combat tests encoded the OLD (buggy) behavior — a seeded roster auto-activated a combatant. Updated them to pass `combat_state="running"` where a live fight is intended; the idle-seed path is now separately asserted to ping NO ONE.
- Stored `combat_state` as a plain VARCHAR (server_default 'idle'), NOT `sa.Enum` — SQLModel's sa.Enum persists member NAMES while migration server_defaults use VALUES, the exact drift the data-model review flagged. A plain str column sidesteps it.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-07-03 | Plan number | 00040 / 00041 | 00041 | 00040 reserved to backfill the already-shipped "Plan 40" (commit deddc0f) per docs review; avoid collision. |
| 2026-07-03 | Beat-survival strategy | (a) incremental roster ops keep combatant UUIDs; (b) re-parent beats to stable pc/npc/monster ids via new columns | (a) for this plan; (b) deferred | (a) fixes the common case (add/remove/edit) with no schema churn and preserves UUIDs so the CASCADE never fires. (b) only needed for "re-roll all initiative but keep beats" — out of Session-3 scope. |
| 2026-07-03 | Combat "active" state | keep inferring from active_combatant_id / add explicit enum | explicit `combat_state` enum | Inference is the root of the false-ping and stale-leak bugs; an explicit lifecycle is the only clean fix and is additive (nullable-default column). |
| 2026-07-03 | msgpack fix | upgrade venv only / pin in requirements.txt | pin in requirements.txt (pending approval) | Durable + reproducible in CI/Render; but requirements changes need owner approval per CLAUDE.md. |
| 2026-07-03 | Phase ordering | fix combat first / safety net first | safety net first (0.4 tests before 1.x) | Writing the regression tests first makes each combat fix provable and prevents re-introducing the cluster. |

---

## Context and Orientation

### Files touched
- `requirements.txt` (0.2, approval)
- `.pre-commit-config.yaml` (0.3, verify only) · `.github/workflows/ci.yml` (0.5)
- `tests/test_api/conftest.py`, `tests/test_api/test_combat_state.py` (0.4, new)
- `services/session_service.py` (1.1, 1.2, 1.3, 1.6) · `db/repos/session_repo.py` (1.1, 1.3)
- `api/routers/sessions.py` (1.1) · `domain/session.py` (1.2, 1.5 — model + Read/Create schemas)
- `alembic/versions/00XX_combat_state.py` (1.2, new) · `alembic/versions/00YY_combatant_ac.py` (1.5, new)
- `frontend/src/stores/useInitiativeStore.ts` (1.1, 1.3) · `frontend/src/pages/SessionHud.tsx` (1.1, 1.2, 1.3, 1.5)
- `frontend/src/components/character-sheet/RollHelper.tsx` (1.4) + eslint fixes across flagged files (0.5/1.4)
- `render.yaml` (2.1) · `.gitignore` (2.2) · `.github/workflows/backup.yml` (2.2, new)

### Architecture layers involved
`api → services → db/repos → domain` (backend) and React store/page (frontend). Boundary
rules apply: new combat endpoints stay thin in `api/`, all logic + authz in
`services/session_service.py`, pure CRUD in `db/repos/session_repo.py`. New request/response
shapes go in `domain/session.py` (no inline dicts). Migrations target Postgres; both new
columns are additive (nullable / server-default) so no drops → no approval gate.

### Key terms defined
- **Combatant roster**: rows in `session_combatants` for one session (PCs + monsters in a fight).
- **replace_all**: repo method that deletes the whole roster and recreates it with new UUIDs — the current blast radius.
- **Combat beat**: a scripted trigger (`hp_lte 25`, `round_gte 5`) in `combat_beats`, FK-cascaded off a combatant row (migration 0018).
- **sort_index**: server's authoritative turn order; the HUD instead displays initiative-descending, so the two can diverge.

---

## Concrete Steps
_Detailed per-step file/action/verify are expanded at implementation time; the Progress list
above is the authoritative step index. Each Phase-1 step must have a failing test from 0.4
before the fix and a passing one after._

### Step 0.4 (illustrative detail)
**File:** `tests/test_api/test_combat_state.py` (create)
**Action:** Create
**Details:** TestClient cases: (a) add a combatant mid-fight → round + conditions + existing combat_beats survive; (b) End Combat → no `pc.turn.changed` emitted, `combat_state=ended`; (c) session marked Complete → player `combat_state` reports `in_combat=false`; (d) edit initiative 3→19 → server turn order matches displayed order.
**Verify:** Tests fail against current `main`, pass after Phase 1.

---

## Validation and Acceptance
- [ ] `black --check . && isort --check-only . && flake8 && interrogate -c pyproject.toml` clean
- [ ] `pip-audit --ignore-vuln PYSEC-2022-42969` reports no vulnerabilities (0.2)
- [ ] `pytest -q` passes incl. new tests/test_api/ suite
- [ ] Frontend: `npx tsc -b` clean and `npx eslint .` reports 0 errors (0.5, 1.4)
- [ ] Manual table drill (the pencil test): roll initiative → add a late PC → tag Poisoned on two monsters → drop one monster → **refresh the browser** → round, turn pointer, all conditions, all combat beats, and monster ACs are intact; no player phone shows a turn banner unless it is that PC's turn.
- [ ] End Combat leaves no combat state; starting Session 3 shows no Session-2 leftovers on any player phone.
- [ ] A backup of the live DB exists off-repo and is reproducible on a schedule (2.2).

---

## Idempotence and Recovery
Phase 0 steps are independent and re-runnable (`black`, `pre-commit install`, adding CI jobs).
Migrations (1.2, 1.5) are additive — re-running `alembic upgrade head` is safe; each has a real
`downgrade`. If interrupted mid-Phase-1, the Progress checkboxes are the resume point; incremental
roster ops (1.1) can ship before the lifecycle enum (1.2) but 1.2 depends on 1.1's endpoints
existing. Frontend and backend halves of 1.1/1.3 must ship together (contract change).

---

## Interfaces and Dependencies
**Produces:** incremental combatant endpoints, an explicit `combat_state` lifecycle, persisted
monster AC, a green CI (backend + frontend), and an automated DB backup.
**Depends on:** existing Plan-40 combat-beats + session-combatant tables; Render Postgres;
GitHub Actions. 0.2 depends on owner approval for the requirements.txt pin.

---

## Outcomes and Retrospective
Phases 0 and 1 landed and verified green (577 backend tests incl. 13 new; frontend `tsc -b` clean; migration 0019 → valid additive Postgres DDL offline). The root-cause approach (incremental roster ops + an explicit lifecycle) dissolved the whole bug cluster in one structural move rather than patching each symptom. Hardest part: the fix is inherently two-sided — server semantics, the Zustand store, and SessionHud must agree — so the contract had to be designed once and threaded through `types.ts`, the store, and the HUD together. What remains is genuinely outside code: verify the Render DB tier, set `DATABASE_URL`, untrack the PII snapshot, enable branch protection, and run the at-the-table drill. Deferred by design: re-parenting beats to survive a full initiative RE-roll (Decision Log option (b)); the ~20 pre-existing frontend eslint errors; a Postgres CI lane.
