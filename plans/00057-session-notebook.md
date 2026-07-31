# Plan 00057 — The Session Notebook (📓)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

Built 2026-07-30 in one pass: backend (13 tests) + full editor frontend.
Gate: 722 passed · flake8/black/isort clean · interrogate 96.1% · tsc
clean · vite build clean. Law-1 audit: no code path moves AI/pin text
into blocks (grep-verified). Ships dark behind NOTEBOOK_ENABLED.
Remaining for the DM: deploy → `alembic upgrade head` → set
NOTEBOOK_ENABLED=true → run the acceptance hour → fixes through Thu 8/7.

**Started:** 2026-07-30
**Last updated:** 2026-07-30
**Implemented by:** Claude Code

---

## Purpose

A living planning notebook inside the app: the DM writes and sketches the
session; the app supplies faces, maps, and an AI collaborator in the margin.
Becomes the primary prep surface. Four constitutional laws: (1) the page
belongs to the DM — nothing ever writes into it, AI has no insert button;
(2) the margin holds context/collaboration, never page content; (3) all
notebook content is scratch — the only promote is page→runbook flag;
(4) a finished page IS the session — read mode prints as a runbook.

Usable 2026-08-01, complete 2026-08-02, bug fixes through Thu 2026-08-07
night, then total freeze. Zero modifications to session-critical paths.

---

## Progress

- [x] Step 0: inventory (2026-07-30) — findings in Surprises
- [ ] Step 1: `domain/notebook.py`
- [ ] Step 2: `db/repos/notebook_repo.py`
- [ ] Step 3: `services/notebook_service.py` (+ riff via ai_service pattern)
- [ ] Step 4: `api/routers/notebooks.py` + register + `NOTEBOOK_ENABLED` flag
- [ ] Step 5: migration 0034
- [ ] Step 6: `frontend/src/api/notebooks.ts`
- [ ] Step 7: editor — `pages/Notebook.tsx` + `components/notebook/*`
- [ ] Step 8: sketch block
- [ ] Step 9: mentions → margin pins; margin rail; AI margin
- [ ] Step 10: read mode + print CSS + copy-as-markdown
- [ ] Step 11: search + [[links]] + promote-to-runbook
- [ ] Step 12: tests + quality gate

---

## Surprises and Discoveries

- No markdown library exists in the frontend; runbooks are structured JSON.
  → custom markdown-lite renderer (React nodes, no innerHTML, XSS-safe).
- Scene presets are localStorage-only (`ql-scenes-{sessionId}`) — no server
  list. Picker reads them client-side; monogram tiles, no target page.
- House pattern stores ordered display data as JSON on the row (puzzle
  state, map regions, table tokens) → blocks/pins are JSON columns on
  `notebook_pages`, not a blocks table. `search_text` column derived on
  save feeds full-text search (ILIKE).
- Sketch: custom pointer-events SVG canvas chosen over perfect-freehand —
  no new dep, stylus native, SVG prints crisp. Smoothing: quadratic
  Béziers through segment midpoints.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-07-30 | Block storage | blocks table / JSON on page | JSON on page | House pattern; autosave = one debounced PATCH; ordering free |
| 2026-07-30 | Sketch engine | perfect-freehand / custom SVG | custom SVG | No new dep; napkin spec ≠ pressure outlines; prints crisp |
| 2026-07-30 | Markdown | react-markdown dep / custom lite | custom lite renderer | No dep approval needed; safe by construction; only needs bold/italic/code/mention/link |
| 2026-07-30 | AI pin writes | server appends pins / client PATCHes | riff route returns suggestions; client appends `ai` pins | Single write path for page JSON; provenance travels in the pin |
| 2026-07-30 | Feature flag UX | hide nav via probe / page-level notice | nav always visible; page shows enable notice on 403 | Frontend can't read server env; server paths stay dark until flag |
| 2026-07-30 | Editor text | contenteditable / textarea per block | autosized textarea per block | Native undo/IME/selection; mentions insert `@[Name](kind:id)` tokens |

---

## Context and Orientation

### Files touched
- `domain/notebook.py` (create)
- `db/repos/notebook_repo.py` (create)
- `services/notebook_service.py` (create)
- `api/routers/notebooks.py` (create); `api/main.py` (register only)
- `alembic/versions/0034_notebooks.py` (create)
- `.env.example` (add `NOTEBOOK_ENABLED` — additive)
- `frontend/src/api/notebooks.ts` (create)
- `frontend/src/pages/Notebook.tsx` (create)
- `frontend/src/components/notebook/{blocks.tsx,SketchBlock.tsx,MentionPicker.tsx,MarginRail.tsx,markdownLite.tsx,readMode.tsx}` (create)
- `frontend/src/App.tsx`, `frontend/src/pages/Layout.tsx` (route + nav only)
- `tests/test_services/test_notebook_service.py` (create)

**Explicitly untouched:** board, presets, player views, combat, market, crier.

### Architecture layers involved
Standard flow. Authz in `notebook_service` via `_get_owned_campaign`
(campaign ownership). Riff calls `integrations/claude_client.complete_json`
directly from the service, mirroring `ai_service` (kill switch applies).

### Key terms defined
- **Block** — one unit of a page: `{id, type, content}` where type ∈
  text · verbatim · prompt · key · card · sketch · image · divider.
- **Pin** — margin item anchored to a block: `{id, block_id, kind, ...}`,
  kind ∈ entity · image · note · ai. AI pins carry `{model, at, prompt}`.
- **Mention token** — `@[Name](kind:id)` inline in text content; renders
  styled; inserting one auto-creates an entity pin at that block.
- **Runbook flag** — `is_runbook` on a page; the ONLY promote. Surfaces
  the page under session materials (read-mode link). Nothing else ever
  leaves the notebook.

---

## Concrete Steps

### Step 1: Domain
`Notebook` (id, campaign_id, title, sort_order, created_at) ·
`NotebookPage` (id, notebook_id, campaign_id, title, sort_order, blocks
JSON, pins JSON, search_text, is_runbook, updated_at) · boundary models
incl. `RiffRequest{selection?, question?, block_id?}` /
`RiffResponse{suggestions, model, at}`.

### Step 2: Repo
`NotebookRepo`, `NotebookPageRepo` — CRUD + `search(campaign_id, q)`
(ILIKE over title + search_text) + light page listing.

### Step 3: Service
Ownership on every op; `NOTEBOOK_ENABLED` check (`_require_enabled`) on
every op (default disabled; tests set env). Page save derives
`search_text` from blocks (strip tokens). `riff()` builds campaign
context (name/setting/tone) + page text (≤ ~6k chars) + selection or
question → `complete_json` → 2–3 suggestions ≤60 words each. Never
writes pins.

### Step 4: Router + flag
DM-auth routes: notebooks CRUD, pages CRUD, `GET
/campaigns/{id}/notebook-search`, `POST /notebook-pages/{id}/riff`.
403 "not enabled" when flag off.

### Step 5: Migration 0034 — two tables, hand-written like 0033.

### Steps 6–11: Frontend
Route `campaigns/:campaignId/notebook`. Left rail: notebooks + pages +
search. Center: title + block list (textarea autosize; slash menu on "/"
in empty block; toolbar; Enter-continues; drag handle reorder; snapshot
undo; 800 ms debounced PATCH + Saved indicator). Right: margin rail —
pins absolutely positioned to block offsets; "+" adds entity/image/note
pin; AI header holds Riff (enabled on selection) + Ask input; AI pins
tinted with provenance line, keep/dismiss, NO insert affordance.
Sketch block per spec (3 weights, 6 inks from app palette, eraser =
stroke removal, undo/redo/clear, height drag, SVG paths). Image block:
picker tabs (PCs/NPCs/items/maps/uploads) + paste-from-clipboard →
POST /uploads. Read mode: clean column, first card sticky, pins as edge
portraits (tap expands), print CSS (`@media print` hides all chrome),
Copy as markdown (serializer over blocks). `[[` opens page picker;
`[[Title]]` resolves client-side to page nav.

### Step 12: Tests
Flag off→PermissionError; CRUD + ownership denial; search hits
title+body; search_text derivation strips mention tokens; riff prompt
carries selection & campaign tone + respects kill switch (mock
`complete_json`); riff returns ≤3 suggestions.

---

## Validation and Acceptance

- [ ] `pytest -q` zero failures; gate clean; `tsc --noEmit` clean
- [ ] The DM's first hour (from the handoff): notebook "Session 5" →
      page "Homecoming" → card w/ 5 beats → 📖/💬/🗝 → @Mira/@Sister
      Maren/@Edrik Thorne faces in margin → temple map thumb → sketch
      with mouse/stylus → riff: 3 suggestions, dismiss 2 keep 1 →
      search "gangplank" → read mode card pinned → print looks like a
      runbook → copy as markdown
- [ ] Law 1 audit: grep the notebook frontend for any code path that
      writes AI text into blocks — none may exist
- [ ] Flag off: every /notebook* route 403s; nothing else in the app
      changes behaviour

## Idempotence and Recovery
File creates re-runnable; migration 0034 once (check `alembic current`).
Progress checkboxes are the restart guide.

## Interfaces and Dependencies
**Produces:** `/campaigns/{id}/notebook` DM surface; notebook API.
**Depends on:** campaign authz, claude_client (riff), uploads route,
entity list endpoints. Writes nowhere else (Law 3).

## Outcomes and Retrospective
_Fill in after completion._
