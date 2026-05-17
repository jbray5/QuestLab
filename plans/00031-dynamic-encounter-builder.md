# Plan 00031 — Dynamic Encounter Builder (with Theme-Aware Suggestions)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-16
**Last updated:** 2026-05-16

---

## Purpose

The existing encounter form lets the DM type a name and store a monster
roster JSON — but it leaves all the math (CR vs party XP budget) to the
DM and gives no help picking monsters that fit the story.

Rebuild as a *builder*:

1. **Live difficulty meter** — XP total of the current roster vs. the
   party's Easy / Medium / Hard / Deadly thresholds (2024 DMG).
2. **Monster search + CR filter** — find candidates fast.
3. **✨ Suggest themed monsters** — Claude reads the adventure's title +
   synopsis + location notes and the available monster catalog, then
   returns 4–6 ranked picks with a one-line rationale each ("These
   shadows fit your crypt setting, all CR 1–3 to threaten a level 3
   party"). One click adds a suggestion to the roster.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-16
- [ ] Step 2: Backend — XP-threshold helper, encounter math service,
  `services/ai_service.suggest_themed_monsters`
- [ ] Step 3: Endpoints — `GET /api/adventures/{id}/encounter-budget`
  (XP thresholds for the party), `POST /api/adventures/{id}/suggest-monsters`
  (themed picks)
- [ ] Step 4: Backend tests
- [ ] Step 5: Frontend — rewrite `EncounterBuilder` panel inside the
  existing Encounters page with difficulty meter, search, and the
  Suggest button + suggestion cards
- [ ] Step 6: Quality gate + commit + push

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-16 | Theme matching | (a) Heuristic keyword → creature_type, (b) Claude reads synopsis + monster list, (c) Hybrid | (b) | Claude already knows D&D themes. Sending it the synopsis + the available monsters yields better picks than a keyword map. Cost is trivial — one ~$0.003 call per Suggest click. |
| 2026-05-16 | Suggestion shape | (a) Just monster IDs, (b) IDs + counts + per-monster rationale | (b) | "Two shadows because the dim crypt; one wraith as a centerpiece" is the kind of context that helps a new DM trust the suggestion. |
| 2026-05-16 | Caching | (a) Cache per-(adventure, difficulty) for 5 minutes, (b) Always re-suggest | (b) | The DM wants varied picks. Re-running should give a fresh set. Trivial token cost makes (b) viable. |
| 2026-05-16 | Party resolution | (a) DM enters party size + avg level, (b) Pull from campaign's PCs | (b) | Already have the data. Removes a step. |
| 2026-05-16 | XP threshold source | (a) 2014 DMG table, (b) 2024 DMG table | (b) | We use 2024 rules throughout. Per the 2024 DMG XP-budget table: Low(Easy) / Moderate(Medium) / High(Hard) tiers. |

---

## XP thresholds (2024 DMG)

Per PC, by level — Low / Moderate / High XP budget points:

| Lvl | Low | Mod | High |
|---:|---:|---:|---:|
| 1 | 50 | 75 | 100 |
| 2 | 100 | 150 | 200 |
| 3 | 150 | 225 | 400 |
| 4 | 250 | 375 | 500 |
| 5 | 500 | 750 | 1100 |
| 6 | 600 | 1000 | 1400 |
| 7 | 750 | 1300 | 1700 |
| 8 | 1000 | 1700 | 2100 |
| 9 | 1300 | 2000 | 2600 |
| 10 | 1600 | 2300 | 3100 |
| 11 | 1900 | 2900 | 4100 |
| 12 | 2200 | 3700 | 4700 |
| 13 | 2600 | 4200 | 5400 |
| 14 | 2900 | 4900 | 6200 |
| 15 | 3300 | 5400 | 7800 |
| 16 | 3800 | 6100 | 9800 |
| 17 | 4500 | 7200 | 11700 |
| 18 | 5000 | 8700 | 14200 |
| 19 | 5500 | 10700 | 17200 |
| 20 | 6400 | 13200 | 22000 |

Threshold for the party = sum of each PC's threshold. Sum the XP of all
monsters in the encounter (their stat-block `xp` field) and compare.

---

## Files touched

**Backend:**
- `services/encounter_math.py` (new) — XP thresholds + party math
- `services/ai_service.py` — add `suggest_themed_monsters` function
- `api/routers/encounters.py` — add the two new endpoints
- `tests/test_services/test_encounter_math.py` (new)

**Frontend:**
- `frontend/src/api/encounters.ts` — typed clients for the two endpoints
- `frontend/src/pages/Encounters.tsx` — rebuild the editor as a builder
- `frontend/src/components/encounter-builder/` (new dir) — components

---

## Outcomes and Retrospective

**Shipped 2026-05-16:**

Backend
- Reused the existing `integrations/dnd_rules/encounter_math` module
  (`calculate_difficulty`, `cr_to_xp`) — already had the 2024 DMG
  thresholds, monster-count multiplier, and difficulty classification.
- `services.encounter_service.preview_difficulty`: returns the full
  difficulty breakdown for a hypothetical roster without persisting.
  Resolves the party from the adventure's campaign characters
  automatically — DM doesn't re-enter levels.
- `services.encounter_service.suggest_themed_monsters`: orchestrates
  the AI call. Builds adventure + party context, ships the monster pool
  to Claude, hydrates each returned name back to a monster_id
  (case-insensitive match) so the frontend can drop suggestions
  straight into the roster.
- `services.ai_service.suggest_themed_monsters`: structured Claude call
  using `complete_json`. Prompt reads the adventure's title, synopsis,
  location notes, tier, party summary, and target difficulty; returns
  4–6 picks with rationale + an `encounter_concept` one-sentence pitch.
- Endpoints:
  - `POST /api/adventures/{id}/encounters/preview-difficulty`
  - `POST /api/adventures/{id}/encounters/suggest-monsters`
- 9 new tests (the AI call is monkey-patched so they run offline).
  Full suite 531 ✓.

Frontend
- `DifficultyMeter` — colored gauge bar: green / amber / orange / red
  bands for Low / Moderate / High / Deadly. Marker slides with smooth
  transition as the DM tunes the roster. Threshold values labelled
  underneath. Animates updating state.
- `SuggestionsPanel` — collapsed by default, opens an AI request when
  the DM clicks **Suggest**. Renders the concept blurb + suggestion
  cards (×N Monster Name · CR · XP · rationale) each with a "+ Add"
  CTA, plus an "+ Add all" shortcut.
- `Encounters.tsx` RosterEditor now mounts both above the search box.
  Difficulty preview is keyed on the roster JSON, so each unique
  combination fetches once and caches.

**Surprises:**
- Almost reinvented `encounter_math` before realizing the
  fully-functional 2024 module already lived in
  `integrations/dnd_rules/`. Deleted my duplicate and reused it.

**Tech debt:** none.
