# Plan 00043 — generate_dm_brief (the session-2 format, generated)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-07-04
**Last updated:** 2026-07-04 — full slice built + verified (611 backend tests; vite build clean; eslint baseline). Structured outputs on opus-4-8 worked first try. Remaining: a live generate against the real API (needs ANTHROPIC_API_KEY on the deploy).
**Implemented by:** Claude (Fable 5)

---

## Purpose
Session 1 failed because the DM read the screen; session 2 succeeded because the app
BRIEFED him — a glanceable run-sheet with trigger beats, NPC play-faces, spotlight cues,
and "HP is a story dial" guidance, NOT read-aloud walls. The repo review's #1 finding:
that winning format is hand-authored markdown; the app's `generate_session_runbook` still
emits the read-aloud format that sank session 1. This plan makes the brief a first-class
AI artifact. A new `generate_dm_brief` generator produces the session-2 shape (cold open +
beats-with-machine-triggers + NPC quick-who/want-now/knows + spotlight-per-PC + danger dial
+ optional "roads" ending), persisted per session and rendered as a glanceable HUD panel.
Done = the DM clicks "Generate Brief" and gets a session-3-style sheet for ANY campaign —
the app's best idea, reusable.

---

## Progress
- [x] 1. `claude_client.complete_structured` (SDK `messages.parse()`) + env-driven `DEFAULT_MODEL` default `claude-opus-4-8` (was stale `claude-opus-4-6`).
- [x] 2. `domain/session_brief.py` (SessionBrief + Beat/NpcFace/Spotlight/Road + Create/Read/Update); registered in domain/__init__.
- [x] 3. Migration 0021 — `session_briefs` (offline SQL verified, single head).
- [x] 4. `db/repos/session_brief_repo.py` — get_by_session / create (overwrite) / update / delete.
- [x] 5. `ai_service.generate_dm_brief` — campaign/adventure/PC/NPC context + the GLANCEABLE prompt (HP-is-a-dial, machine triggers, play-faces, spotlight, danger dial, roads) via `complete_structured`. `_BriefOutput` schema.
- [x] 6. `services/session_brief_service.py` — get_brief / generate_brief / update_brief, auth via session ownership.
- [x] 7. Router: GET (null if none) / POST (generate) / PATCH (edit) `/sessions/{id}/brief`.
- [x] 8. Tests — 6 service + 4 API (glanceable-not-read-aloud contract, auth matrix, regenerate). AI mocked at `ai_service.complete_structured`. 611 pass.
- [x] 9. Frontend — types + api methods + `BriefPanel` (cold-open quote card, beat cards with trigger chips + spotlight tags, NPC play-face cards, spotlight rows, danger-dial callout, road cards, notes-driven generate/regenerate) + SessionHud 📋 Brief launcher.
- [x] 10. Gates: pytest 611, black/isort/flake8/interrogate clean, vite build clean, eslint 20 (baseline — 0 new).

---

## Surprises and Discoveries
- The existing runbook records `model_used=ai_service._MODEL` (a constant) while the real call defaults to claude_client's model — they happen to match at `claude-opus-4-6` today. This plan bumps claude_client to `claude-opus-4-8` (env-driven) and has the brief record the ACTUAL model, avoiding the drift for the new artifact. ai_service._MODEL left alone to stay bounded.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-07-04 | Brief storage | extend SessionRunbook / new SessionBrief table | new `session_briefs` (1:1) | Different SHAPE (cues+triggers+faces vs scenes+read_aloud); additive; doesn't touch the runbook the HUD already renders. |
| 2026-07-04 | JSON parsing | reuse complete_json fence-strip / structured outputs | `messages.parse()` structured outputs | Review + claude-api skill: guarantees schema-valid JSON, eliminates the JSONDecodeError-after-16K-tokens failure class. Requires opus-4-8 (supports structured outputs); pydantic constraints are stripped-and-client-validated by the SDK. |
| 2026-07-04 | Model | keep opus-4-6 / bump | env `ANTHROPIC_MODEL`, default `claude-opus-4-8` | 4-6 is two releases stale; centralizes the config the review flagged as scattered; 4-8 supports structured outputs. |
| 2026-07-04 | Beats → combat_beats wiring | build now / defer | defer to a follow-up | The brief SCHEMA carries machine triggers; a "push beats to tracker" action reuses Plan 40's combat_beats — valuable but separable. Ship the brief first. |
| 2026-07-04 | Thinking/effort on the call | add adaptive / plain | plain non-streaming parse() for v1 | Keeps the call fast and truncation-safe at max_tokens=16000; adaptive thinking is a quality tune to add once verified. |

---

## Context and Orientation

### Files touched
Backend: `integrations/claude_client.py`, `domain/session_brief.py`, `domain/__init__.py`,
`alembic/versions/0021_session_briefs.py`, `db/repos/session_brief_repo.py`,
`services/ai_service.py`, `services/session_brief_service.py`, `api/routers/sessions.py`.
Tests: `tests/test_services/test_session_brief_service.py`, `tests/test_api/test_brief_api.py`.
Frontend: `frontend/src/api/types.ts`, `frontend/src/api/sessions.ts`,
`frontend/src/components/brief/BriefPanel.tsx`, `frontend/src/pages/SessionHud.tsx`.

### Architecture layers involved
Full slice api → services → db/repos → domain; integrations/claude_client for the model call.
Boundary rules: the AI SDK stays behind claude_client; authz in services; router thin.

### Key terms
- **DM brief**: the glanceable session-2 artifact — cold open, beats-with-triggers, NPC
  play-faces, spotlight cues, danger dial, roads. The inverse of a read-aloud runbook.
- **Beat**: {title, cue (short, glanceable), kind (rp|combat|reveal|clock), trigger
  (optional machine condition: hp_lte/round_gte/on_defeated/manual), spotlight_pc, dm_note}.
- **Play-face**: NPC quick_who / want_now / knows / voice / secret_short — how to PLAY the
  NPC live (reuses the Plan 40 dual-face vocabulary).

---

## Validation and Acceptance
- [ ] `pytest -q` green incl. new brief tests
- [ ] Generated brief's schema has NO long read-aloud field; beats carry machine triggers; NPC faces populate quick_who/want_now/knows
- [ ] GET/POST/PATCH `/sessions/{id}/brief`: 401 no identity, 403 non-owner
- [ ] `tsc -b` clean; eslint 0 new errors
- [ ] Manual: open a session HUD → Generate Brief → a glanceable sheet renders (cold open, beat cards with trigger chips, NPC play-faces, spotlight, danger dial)

---

## Idempotence and Recovery
Migration 0021 is additive (one table). Backend steps land in order; the generator is behind
the ownership check so a failed AI call raises cleanly. Frontend compiles at each step.
Resume from the Progress checkboxes.

---

## Interfaces and Dependencies
**Produces:** a persisted per-session DM brief + generate/read/edit endpoints + a glanceable panel.
**Depends on:** ANTHROPIC_API_KEY; claude_client; campaign/adventure/PC/NPC data; the Plan 40
dual-face vocabulary (conceptual reuse).

---

## Outcomes and Retrospective
Landed and verified green. The `messages.parse()` structured-outputs path worked on the
first run — no fence-stripping, no JSONDecodeError guard needed — which validates retiring
`complete_json` for future generators. The whole feature is one prompt away from any campaign
getting the session-2 treatment: the generator sees only DB context (campaign tone, session,
cast) and produces the glanceable format, so it's reusable by construction. Deferred: wiring a
brief's combat beats into the Plan 40 combat_beats tracker (a "push beats" action — the schema
already carries the triggers); seeding NPC play-faces from the npcs table's dual-face fields
(v1 feeds adventure.npc_roster and lets the AI invent faces); adaptive-thinking on the call
(a quality tune once verified against the live API). Also bumped the app's default model from
the stale opus-4-6 to env-driven opus-4-8, fixing a review finding for every generator.
