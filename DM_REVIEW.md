# QuestLab DM Review — Comprehensive Walkthrough

**Date:** April 10, 2026
**Reviewer Role:** Dungeon Master considering a monthly subscription
**Campaign Created:** "The Shattered Crown" (Ravenloft - Dark Gothic Horror)
**Test Method:** API-level testing (curl) + frontend source code review + TypeScript compilation + Python test suite

---

## Data Created During Walkthrough

| Entity | Count | Details |
|--------|-------|---------|
| Campaign | 1 | "The Shattered Crown" — Ravenloft setting, dark gothic horror |
| Adventures | 2 | "Curse of the Crimson Manor" (Tier 1, 3 acts), "The Darkon Conspiracy" (Tier 2, 4 acts) |
| Player Characters | 4 | Kael (Human Fighter 4), Seraphina (Half-Elf Cleric 4), Zephyr (Tiefling Warlock 4), Whisper (Halfling Rogue 4) |
| Encounters | 2 | "The Haunted Foyer" (Moderate, 1200 XP), "Dance of the Damned" (Deadly, 2600 XP) |
| Sessions | 2 | "Into the Crimson Mists" (InProgress), "Dance of the Damned" (Draft) |
| SRD Monsters | 130 | Full SRD 5.1 stat block library |

---

## What Worked Well

### 1. Architecture & Code Quality (A+)
- **282 tests, all passing** in 9.4 seconds. Excellent coverage.
- **TypeScript compiles cleanly** — zero errors across the entire React frontend.
- Clean separation of concerns: API routers -> services -> repos -> domain models. Textbook layered architecture.
- Pydantic validation at all boundaries catches bad input before it hits the DB.
- Auth model is simple and appropriate — header-based identity with service-layer authorization.

### 2. Campaign/Adventure/Character CRUD (A)
- Campaign creation with setting, tone, description, and world notes is exactly what a DM needs.
- Adventures with tier, act count, NPC rosters, and location notes — well-thought-out data model.
- Character sheets capture the essential 5e 2024 stats: ability scores, saves, skills, spell slots, equipment.
- The adventure hierarchy (Campaign > Adventure > Encounters/Sessions) maps cleanly to how DMs actually plan.

### 3. Encounter Builder (A-)
- **Auto-XP budget calculation** is killer. I added 2 Animated Armor + 4 Skeletons and it correctly computed 1200 XP.
- Monster roster with monster_id + count is simple and effective.
- The encounter model captures everything a DM needs: read-aloud text, DM notes, terrain notes, reward XP.
- Difficulty auto-calculation based on party levels is smart.

### 4. Monster Compendium (A)
- **130 SRD monsters** with full stat blocks, abilities, legendary actions, lair actions.
- Search by name, filter by CR, filter by creature type — all work correctly.
- 14 creature types represented with good distribution (41 dragons, 18 humanoids, 14 fiends, 12 undead).
- The monster stat block modal in the frontend is well-designed.

### 5. Session Runner & HUD (A-)
- Initiative roller works correctly: d20 + DEX modifier, sorted descending, tie-breaking by DEX then random.
- Session lifecycle (Draft -> Ready -> InProgress -> Complete) is clean.
- DM notes save/update works.
- The Session Runner has a great layout: runbook left, initiative tracker right.
- The Session HUD has all 16 5e conditions with full rules text — excellent reference.
- AI runbook generation is well-architected with scenes, NPC dialog, encounter flows, XP awards, loot.

### 6. Frontend Design (A-)
- Dark fantasy theme with Cinzel Decorative + EB Garamond fonts looks atmospheric.
- Color-coded difficulty badges (Low=green, Moderate=orange, High=red, Deadly=crimson).
- The sidebar navigation dynamically shows Campaign/Adventure context when one is selected — very intuitive.
- HP bars with color coding (green > yellow > red) are a nice touch.
- Loading states ("Consulting the tomes...") add personality.
- Parchment-style cards for read-aloud text.

### 7. Admin Tools (B+)
- Campaign JSON export works.
- Monster seed/reseed is useful for data management.
- Admin-only endpoints properly gated with auth checks.

---

## Bugs Found

### BUG-001: JSON Column Updates Cause 500 Error (DuckDB) [CRITICAL]
- **Reproduction:** `PATCH /api/sessions/{id}` with `{"attending_pc_ids": ["uuid1", "uuid2"]}` returns `Internal Server Error 500`.
- **Root Cause:** DuckDB has issues updating JSON-typed columns via SQLAlchemy/SQLModel's `setattr` pattern.
- **Impact:** Cannot assign PCs to sessions through the API. This breaks the session -> character assignment flow.
- **Affected Fields:** Any JSON column: `attending_pc_ids` (sessions), `npc_roster` (adventures), `monster_roster` (encounters), `spell_slots`/`spells_known` (characters).
- **Severity:** Critical for DuckDB users. Postgres likely unaffected.

### BUG-002: Session Create Requires PC IDs as Inline JSON (Minor)
- Sending `attending_pc_ids` with actual UUIDs in the POST body triggers the same 500 error on DuckDB. You can only create sessions with `attending_pc_ids: []`.

### BUG-003: Duplicate Character Names Not Prevented (Minor)
- Created "Kael Stormrend" twice with no validation error. No unique constraint on `(campaign_id, character_name)`.
- **Impact:** A DM could accidentally create duplicate characters.

### BUG-004: DuckDB Lock Contention on Startup
- If Streamlit and FastAPI try to run simultaneously, DuckDB single-writer lock causes the second process to crash with `IOException: Cannot open file... already open in PID`.
- The `run.sh` script avoids this by only running FastAPI, but the Streamlit `main.py` still imports `db.base` and would conflict.

---

## Feature Gaps & Suggestions

### High Priority (Would-Pay-For Features)

1. **Encounter Difficulty Override** — The encounter builder auto-calculates difficulty and overrides the user's explicit choice. I set "High" but got "Deadly" back. DMs should be able to manually override difficulty if they disagree with the math (e.g., the party has magic items that change the equation).

2. **Character-to-Session Assignment in UI** — The `attending_pc_ids` update being broken means there's no way to track which PCs are in which session. Once BUG-001 is fixed, the Sessions page should have a PC picker.

3. **NPC Roster Display in Adventures Page** — NPCs are stored but the frontend Adventures page doesn't render the `npc_roster` JSON. This is a data modeling win with no UI payoff yet.

4. **Location Notes Display** — Same issue. `location_notes` is stored but not visually rendered in the adventure detail view.

5. **Campaign Dashboard with Stats** — The Dashboard just lists campaigns. It should show per-campaign stats: number of adventures, characters, sessions, total encounters. Give the DM a bird's-eye view.

6. **Session Calendar View** — `date_planned` exists but there's no calendar visualization. A DM planning weekly sessions would love to see their session schedule at a glance.

### Medium Priority (Nice-to-Have)

7. **Encounter Difficulty Preview Before Save** — Show the calculated difficulty + XP budget as the DM adds/removes monsters, before committing.

8. **Character Level-Up Workflow** — No guided level-up process. When a DM awards XP after a session, there should be a way to advance characters and update stats.

9. **Campaign Notes / World Wiki** — `world_notes` is a single text field. Power DMs need structured world-building: factions, locations, lore entries, NPC relationships.

10. **Session Recap / Player Handout** — After completing a session, auto-generate a player-facing recap (without DM-only notes). Great for sharing in Discord.

11. **Encounter Map Integration** — The Map Builder exists but encounters aren't visually placed on maps in the encounter builder. You can link a map node to an encounter, but there's no visual encounter-on-map experience.

12. **Bulk Monster Add to Encounters** — Adding monsters one by one is fine for small encounters, but a DM building a massive battle (30+ goblins) needs a faster workflow.

13. **Search/Filter on Adventures, Characters, Sessions** — Only the Monsters page has search. As data grows, DMs will need search everywhere.

### Low Priority (Polish)

14. **Adventure Edit Form** — The Adventures page can create and delete but there's no inline edit form for updating an existing adventure's synopsis, tier, or NPC roster.

15. **Character Portrait in Stat Block** — `portrait_url` exists in the model but the Characters page card doesn't prominently display it.

16. **Session Notes Autosave** — The DM Notes textarea requires clicking "Save Notes". During a live session, autosave (debounced) would prevent note loss.

17. **Undo/Confirmation on Delete** — Deleting campaigns, adventures, characters, encounters, and sessions are all immediate with only a browser `confirm()` dialog. No undo.

18. **Initiative Tracker Persistence** — Initiative state is ephemeral (React useState). If the DM accidentally refreshes during combat, all initiative order is lost.

19. **Mobile Responsiveness** — The 3-panel Session HUD layout and sidebar navigation won't work well on tablets/phones. A DM at the table often uses a tablet.

---

## Overall Assessment

### As a DM Considering a Monthly Subscription

**Score: 7.5 / 10** — Strong foundation, not yet daily-driver ready.

**What would make me subscribe today:**
- The encounter builder with auto-XP math is genuinely useful and better than most free tools.
- The 130-monster SRD compendium with full stat blocks is solid.
- The dark fantasy aesthetic is appealing and sets the right mood.
- The AI session runbook concept is compelling (couldn't test due to needing to avoid API costs, but the architecture is sound).

**What's holding me back:**
- The DuckDB JSON bug (BUG-001) breaks core workflows. Can't assign PCs to sessions, can't update NPC rosters.
- No way to see NPC rosters or location notes in the UI despite having them in the data model.
- The session runner needs the attending_pc_ids fix to show which PCs are in the session.
- Missing "quality of life" features that competing tools have: calendar view, campaign wiki, player handouts.

**Competitive Position:**
- vs. **D&D Beyond**: QuestLab wins on encounter planning and session management. D&D Beyond wins on character builder depth and official content.
- vs. **Foundry VTT**: Different category — Foundry is a VTT, QuestLab is a planning tool. They're complementary.
- vs. **Notion/Obsidian D&D templates**: QuestLab wins on D&D-specific features (XP math, stat blocks, initiative). Notion wins on flexibility.
- vs. **Kobold Fight Club**: QuestLab has a superset of KFC's encounter builder, plus sessions, characters, and AI generation.

**Bottom line:** Fix the DuckDB JSON bug, surface the data that's already being stored (NPCs, locations), and add campaign-level stats to the dashboard. That gets you to 8.5/10 and a subscribe-worthy product.

---

## Technical Notes

- Python 3.14.3, all 282 tests passing
- TypeScript compiles cleanly, zero errors
- FastAPI + React + Vite + Tailwind + TanStack Query stack is modern and solid
- DuckDB is the weak link — fine for development, but the JSON column issues need resolution before it can be used as a real dev database
- The Anthropic API integration (Claude Opus 4.6) for runbook generation is well-architected
- CORS, auth headers, and API structure are production-ready
