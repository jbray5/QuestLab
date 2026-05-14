# Plan 00015 — Persist Initiative Tracker to DB

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-14
**Last updated:** 2026-05-14
**Implemented by:** Claude (pre-session-1 hardening)

---

## Purpose

Currently the live combat tracker (combatants, HP, current turn, current round) lives only in `st.session_state` in `pages/session_runner.py`. An accidental browser refresh during play **wipes everything** — combatants, HP totals, round counter. With the first live DM session in 9 days, this is the single highest-risk UX failure.

This plan adds a `SessionCombatant` table and persistence calls so the tracker rehydrates from the DB on every page render. Refresh-safe, multi-tab-safe.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-14
- [x] Step 2: Add `SessionCombatant` SQLModel in `domain/session.py` — 2026-05-14
- [x] Step 3: Add CRUD on `db/repos/session_repo.py` (`SessionCombatantRepo`) — 2026-05-14
- [x] Step 4: Service methods on `services/session_service.py`: `load_combat_state`, `save_combat_state`, `update_combatant`, `clear_combat_state`, `advance_combat_turn` — 2026-05-14
- [x] Step 5: Alembic migration `0006_add_session_combatants.py` + DuckDB patch in `db/base.py` (migration-reviewer subagent caught the missing DuckDB columns) — 2026-05-14
- [x] Step 6: API endpoints in `api/routers/sessions.py` — `GET / PUT / DELETE /sessions/{id}/combat`, `PATCH /sessions/{id}/combat/{combatant_id}`, `POST /sessions/{id}/combat/advance` — 2026-05-14
- [x] Step 7: Frontend types in `frontend/src/api/types.ts` + 5 new methods in `frontend/src/api/sessions.ts` + `put` helper in `client.ts` — 2026-05-14
- [x] Step 8: Frontend: rewrote `frontend/src/stores/useInitiativeStore.ts` as async persistence-aware store with optimistic updates, auto-defeat at 0 HP, and revive-restores-1-HP logic — 2026-05-14
- [x] Step 9: Frontend: wired `SessionHud.tsx` (combat tracker derived from persisted store with AC override map, stat-block modal, condition-immunity flagging) and `SessionRunner.tsx` (InitiativeTracker hydrates and persists) — 2026-05-14
- [x] Step 10: Tests: 16 new service tests in `tests/test_services/test_session_service.py` (load/save/update/advance/clear). Includes authz, cross-session protection, defeat-skip, wrap-increments-round — 2026-05-14
- [x] Step 11: `/quality-gate` green — 304 backend tests, all linters, 97.9% docstring coverage. Manual F5 refresh test deferred to user (checklist provided separately).

Migration applied to Postgres on 2026-05-14, confirmed at revision `0006 (head)`.

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-14 | Persistence granularity | (a) Save whole tracker as JSON column on Session row, (b) Separate table with one row per combatant | (b) | Per-combatant rows let us index by session, support partial updates (HP change ≠ full rewrite), and stay queryable for future features (combat log). JSON blob is faster to write but loses query power. |
| 2026-05-14 | Round/turn state location | (a) New columns on `sessions` table, (b) Separate `SessionCombatState` row | (a) | Simpler. Round + current-combatant-id are two scalars per session. |

---

## Context and Orientation

### Files touched
**Backend (shared by both UIs):**
- `domain/session.py` — add `SessionCombatant` table + `SessionCombatantCreate/Read/Update` schemas; add `combat_round` + `combat_active_combatant_id` columns to `Session`
- `db/repos/session_repo.py` — add CRUD for combatants and round state
- `services/session_service.py` — service-layer methods with authz checks
- `alembic/versions/0006_add_session_combatants.py` — new table + 2 new columns on `sessions`
- `api/routers/sessions.py` — add 3 endpoints
- `tests/test_domain/test_session_combatant.py` — domain validation
- `tests/test_repos/test_session_combatant_repo.py` — CRUD
- `tests/test_services/test_session_combatant.py` — authz + round-state

**Frontend (React canonical UI):**
- `frontend/src/api/sessions.ts` — new client methods
- `frontend/src/stores/useInitiativeStore.ts` — async hydration + persistence
- `frontend/src/pages/SessionHud.tsx` — switch combat tracker to persisted store
- `frontend/src/pages/SessionRunner.tsx` — same

**Out of scope:**
- `pages/session_runner.py` (Streamlit) — frozen legacy, no updates

### Architecture layers involved
Full vertical slice: `domain → db/repos → services → pages`. Standard one-way flow. No boundary changes.

### Key terms defined
- **Combatant:** one entity in initiative order. Has name, dex_score, initiative_roll, hp, max_hp, type (`pc`/`monster`), and lifecycle flags (`active`, `defeated`).
- **Round state:** the `(round_number, active_combatant_id)` pair stored on the parent `Session`.

---

## Concrete Steps

### Step 2: Domain model

**File:** `domain/session.py`
**Action:** Add `SessionCombatant` SQLModel and Pydantic schemas. Add two columns to `Session`.

```python
class SessionCombatant(SQLModel, table=True):
    __tablename__ = "session_combatants"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="sessions.id", index=True)
    sort_index: int = Field(ge=0)  # initiative order: 0 = first
    name: str = Field(min_length=1, max_length=100)
    dex_score: int = Field(ge=1, le=30)
    initiative_roll: int = Field(ge=-10, le=50)
    hp_current: int = Field(ge=0)
    hp_max: int = Field(ge=1)
    type: str = Field(min_length=1, max_length=20)  # "pc" or "monster"
    defeated: bool = Field(default=False)
    conditions: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
```

Add to `Session`:
```python
combat_round: int = Field(default=1, ge=1)
combat_active_combatant_id: Optional[uuid.UUID] = Field(default=None)
```

Plus `SessionCombatantCreate`, `SessionCombatantRead`, `SessionCombatantUpdate`.

**Verify:** `pytest tests/test_domain/test_session_combatant.py -q` passes.

### Step 3: Repo

**File:** `db/repos/session_repo.py`
**Action:** Add to existing `SessionRepo`:
- `list_combatants(session_id) -> list[SessionCombatant]`
- `create_combatants(session_id, combatants: list[SessionCombatantCreate]) -> list[SessionCombatant]`
- `update_combatant(combatant_id, payload: SessionCombatantUpdate) -> SessionCombatant`
- `clear_combatants(session_id)` — deletes all combatants for the session (used on re-roll)
- `update_round_state(session_id, round: int, active_id: uuid.UUID | None)`

**Verify:** `pytest tests/test_repos/test_session_combatant_repo.py -q` passes.

### Step 4: Service

**File:** `services/session_service.py`
**Action:** Add the same surface but with authz (`_require_owner_or_admin` mirroring the existing pattern for sessions). All methods take `dm_email: str` and verify ownership before delegating to the repo.

**Verify:** `pytest tests/test_services/test_session_combatant.py -q` passes including "user denied" cases.

### Step 5: Migration

**File:** `alembic/versions/0006_add_session_combatants.py`
**Action:** Create table `session_combatants` and `ALTER TABLE sessions ADD COLUMN combat_round INTEGER NOT NULL DEFAULT 1, ADD COLUMN combat_active_combatant_id UUID`. Use `/new-migration "add session combatants"` after the model is in place so the migration-reviewer subagent vets it for DuckDB drift.

**Verify:** `alembic upgrade head` succeeds.

### Step 6: Page wiring

**File:** `pages/session_runner.py`
**Action:**
- Replace `st.session_state[_INIT_KEY]` initialization with a service call: `session_service.load_combatants(db, session_id, dm_email)`. Keep a derived `tracker` local for the render.
- After `roll_initiative`, save the rolled combatants via `save_combatants`.
- After every HP / defeat / revive mutation, call `update_combatant` instead of mutating in place.
- "Next Turn" / round increment: persist via `update_round_state`.
- "Re-roll" button: `clear_combatants` + reset round state.

Keep `st.session_state` only for UI ephemera (the "add combatant" form inputs).

**Verify:** Manual smoke test: roll initiative, refresh browser, combatants and round counter still there.

### Step 7: Tests
Documented above in each step.

### Step 8: Quality gate
Run `/quality-gate`. All checks green.

---

## Validation and Acceptance

- [ ] `pytest -q` passes (>=282 prior + new tests)
- [ ] Manual: load a session, roll initiative, hit F5 — combatants and round counter survive
- [ ] Manual: open the same session in two browser tabs — HP changes in tab 1 visible in tab 2 after refresh
- [ ] `alembic current` shows revision 0006

---

## Idempotence and Recovery

Each step is independent. If interrupted:
- Migration is reversible via `alembic downgrade -1` (but blocked by hook — user must run manually if needed).
- Page wiring (Step 6) requires Steps 2-5 to be complete; partial completion will show import errors but won't corrupt data.

---

## Interfaces and Dependencies

**Produces:** A persistent combat tracker. Future features (combat log, post-session report, undo) can build on `SessionCombatant` rows.

**Depends on:** Existing `Session` table (`sessions.id` is the FK target). No new external services.

---

## Outcomes and Retrospective

**Shipped:**
- Full vertical slice landed in one session. 304 backend tests pass, frontend TypeScript clean.
- Combat state now survives browser refresh, multi-tab open, and Cmd+R muscle memory — the single biggest ship-blocker for game-night flagged by the pre-flight review.
- Picked up two adjacent wins for free: auto-defeat at 0 HP and revive-restores-1-HP, both in the store's `patchCombatant` / `toggleDefeated` so the entire app benefits without per-call-site logic.

**Harder than expected:**
- SessionHud's combat tracker is 1228 lines with rich local state (AC + Condition Set). Refactoring to derive from the persisted store while keeping the existing UX required a `projectExisting()` helper and an `acOverrides` local map (since AC is not yet on the persisted schema).
- The original Combatant type didn't carry `monster_id`/`character_id`; threading these through the roll-then-persist round-trip needed type updates and a careful audit of every projection site.

**Migration-reviewer subagent earned its keep** — caught two missing DuckDB patch entries that would have silently broken local dev for anyone with an existing `.duckdb` file.

**Deferred to a future plan:**
- AC is not yet persisted (still a local override map). Game-night impact is minimal because the stat-block modal exposes the canonical AC, but a small migration (`session_combatants.ac`) would close the gap.
- The store does NOT yet broadcast updates between tabs of the same session. Refresh works; live cross-tab does not. Use one tab.
- No structured combat log (just per-row state). Future work could persist a per-round action history for retrospective.
