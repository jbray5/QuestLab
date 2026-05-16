# Plan 00025 — Player View

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-16
**Last updated:** 2026-05-16
**Implemented by:** Claude (Roll20-killer — table-state polish 8/8 → deploy track)

---

## Purpose

Give each player their own URL — `/play/{pcId}` — they pull up on their
phone next to the DM's HUD. The page is **their** character: HP, attacks,
spells, features, inventory, all live-driven from the same database the
DM uses. Bake the rules help directly into the sheet via InfoTips so a
new player has answers at hand.

This unblocks the road-deploy use case: a player on their couch can hit
`questlab.vercel.app/play/<their-uuid>` and see exactly the same state
as the DM in front of them.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-16
- [x] Step 2: Backend — `services/player_service.py` + `api/routers/play.py` (16 endpoints) — 2026-05-16
- [x] Step 3: Backend tests — 21 player-service tests; full suite 501✓ — 2026-05-16
- [x] Step 4: Frontend — `/play/:pcId` route + `playApi` client — 2026-05-16
- [x] Step 5: Frontend — `PlayerView.tsx` with mobile-first layout, 7 sections, InfoTips + Turn Walkthrough — 2026-05-16
- [x] Step 6: DM side — `PlayerLinkButton` in character sheet header and HUD party panel (compact) — 2026-05-16
- [x] Step 7: Quality gate green — pytest 501✓, frontend prod build clean, black/isort/flake8/interrogate 96.6% — 2026-05-16

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-16 | Player auth model | (a) UUID-in-URL, (b) rotateable share token, (c) magic-link login | (a) | UUID has ~10^36 entropy; unguessable. In-person trusted group means DM shares each URL out-of-band. Plan 26 can add token rotation; Plan 27 can add real auth. |
| 2026-05-16 | Player write scope | (a) Read-only, (b) DM-managed only, (c) Self-service for table moves | (c) | Bottleneck-at-the-DM is the failure mode this is solving. Allow self-service for HP, hit dice, slots, death saves, inspiration toggle, concentration drop, feature uses, exhaustion. NOT for create/delete/equip/stats. |
| 2026-05-16 | Endpoint shape | (a) Reuse `/api/characters/*` with player-token header, (b) Dedicated `/api/play/{pcId}/*` namespace | (b) | Explicit boundary. Player endpoints take `pcId` in path and never expose other PCs/campaigns. Easier to audit. |
| 2026-05-16 | Inline rules help | (a) Separate `/help` page, (b) InfoTip badges in every section | (b) | "When is this useful" answered at the moment of decision, not after navigating away. Plan 24 InfoTip component is already built and proven. |

---

## Context and Orientation

### Files touched

**Backend:**
- `api/routers/play.py` (new) — `/api/play/{pcId}/*` endpoints
- `services/player_service.py` (new) — player-scoped wrappers around existing services
- `api/main.py` — mount the new router
- `tests/test_api/test_play.py` (new)

**Frontend:**
- `frontend/src/api/play.ts` (new) — typed client for `/api/play/{pcId}/*`
- `frontend/src/pages/PlayerView.tsx` (new) — the page
- `frontend/src/App.tsx` — register `/play/:pcId` route
- `frontend/src/components/character-sheet/*` — most components already
  accept `readOnly`; surface the ones the player can mutate (HP, slots,
  hit dice, death saves, etc.) without `readOnly`
- DM-side: add "Share player link" button to CharacterSheet header and
  HUD party panel

### Player endpoint matrix

| Verb | Path | Service action | Notes |
|---|---|---|---|
| GET | `/play/{pcId}` | Get PC details | Returns PlayerCharacterRead |
| GET | `/play/{pcId}/spellcasting-stats` | Computed DC + attack | Casters only |
| GET | `/play/{pcId}/skill-bonuses` | Computed skill bonuses | |
| GET | `/play/{pcId}/saving-throws` | Computed save bonuses | |
| GET | `/play/{pcId}/spell-slots` | Slot state | |
| GET | `/play/{pcId}/spells` | Known/prepared spells | |
| GET | `/play/{pcId}/features` | Class features w/ uses | |
| GET | `/play/{pcId}/inventory` | Inventory + equipped | |
| POST | `/play/{pcId}/damage` | Apply damage | temp-HP waterfall |
| POST | `/play/{pcId}/heal` | Apply healing | |
| POST | `/play/{pcId}/death-save` | Roll death save | |
| POST | `/play/{pcId}/spend-hit-dice` | Spend N HD | |
| POST | `/play/{pcId}/spell-slots/{level}/expend` | Use a slot | |
| POST | `/play/{pcId}/features/{id}/spend` | Use a feature | |
| PATCH | `/play/{pcId}/state` | Toggle inspiration / set concentration / set exhaustion / set currency | Single endpoint, bounded fields |

Forbidden in player scope (DM endpoints only):
- POST `/play/{pcId}/inventory` — adding items
- PATCH `/play/{pcId}/inventory/{itemId}` — equip/attune changes (TBD —
  may relax later for combat weapon swaps)
- Any modification of ability scores, level, class, name

### Layer compliance

`api/routers/play.py` → `services/player_service.py` → existing services
(`character_service`, `spellcasting_service`, `feature_service`,
`inventory_service`). The player service is a thin authz-and-shape layer;
it does not duplicate business logic. All mutations call through to the
same code paths the DM uses, so the temp-HP waterfall, death-save RAW,
slot consumption rules, etc., are exercised once.

---

## Validation and Acceptance

- [ ] `pytest -q` passes
- [ ] Player URL loads on a fresh browser (no DM email needed)
- [ ] Player URL cannot read/modify a different PC
- [ ] Player can spend a hit die end-to-end (UI → server → HP changes)
- [ ] Player can roll a death save
- [ ] Player can toggle their own inspiration
- [ ] Mobile viewport (375×667) is usable without horizontal scroll
- [ ] InfoTip popovers fit on mobile

---

## Outcomes and Retrospective

**What shipped (2026-05-16):**

Backend
- `services/player_service.py` — 18 player-scoped functions wrapping
  existing services. Each looks up the PC, resolves the owning DM, and
  dispatches with the DM impersonated under the hood. All business
  logic lives in the existing services — player_service is auth-and-shape.
- `api/routers/play.py` — 16 public endpoints under `/api/play/{pc_id}/*`.
  Reads: PC, spellcasting stats, skill bonuses, saves, slots, spells,
  features, inventory. Writes: damage/heal, death save, hit dice spend,
  slot expend/restore, feature spend, bounded /state PATCH.
- Bounded /state PATCH: whitelisted to `heroic_inspiration`,
  `concentration_on`, `exhaustion`, `cp/sp/ep/gp/pp`. Anything else
  raises 403 — DM-only.
- 21 new tests in `tests/test_services/test_player_service.py`
  covering all reads/writes, the /state whitelist, and cross-PC
  isolation. Full backend suite 501✓.

Frontend
- New route `/play/:pcId` (standalone — bypasses DM layout/chrome).
- `frontend/src/api/play.ts` — typed client for all 16 endpoints.
- `frontend/src/pages/PlayerView.tsx` — mobile-first single-column
  page with:
  - Sticky header (portrait, name, class/level, stat chips, caster line)
  - HP zone (damage/heal/inspiration)
  - Death-save tracker (auto-show at 0 HP)
  - Concentration line (with starter when empty)
  - Resources card (hit dice with real-die flow, exhaustion, currency)
  - Spell slots (tap pip to expend/restore)
  - Features (use pips with click-to-spend)
  - Skills + saves (read-only)
  - **Your Turn — Walkthrough** (defaultOpen, step-by-step for true
    beginners: pick a goal, move, choose ONE action from 10 options,
    bonus action, free interaction, end turn)
  - Quick Rules Reference (Adv/Dis, crit, opportunity attack, cover,
    conditions gloss)
  - InfoTip badges everywhere — every section answers "when is this
    useful?" at the moment of decision
- `PlayerLinkButton` — reusable "🔗 Share" button with copy-to-clipboard;
  dropped into CharacterSheet header (full size) and HUD party panel
  (compact) so the DM can text each player their URL.

**Auth model in production:**
- Player URL = `/play/{pcUUID}`. UUID is ~10^36 entropy, unguessable.
- DM shares each URL out-of-band with the right player.
- A leaked URL exposes only that one PC, never the whole campaign.
- Plan 26 (future) can add rotateable share tokens.
- Plan 27 (future) can add real magic-link auth.

**Surprises:**
- None major. The existing Plan 23 + Plan 24 InfoTip system + mutation
  patterns transferred cleanly. The biggest decision was layout — went
  with one continuous mobile-first column rather than tabs, since at the
  table a player wants to scroll, not navigate.

**Tech debt:**
- Vite build emits a 711 KB bundle (gzip 208 KB) and warns about chunk
  size. Acceptable for first session; later plan should code-split
  PlayerView and the DM HUD so a player only loads the player view.
