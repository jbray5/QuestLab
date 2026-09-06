# Persona test, run 2 — Rosa Delgado (worldbuilder, twelve-year homebrew, NPCs are the game)

Test window 20:47–21:04 CDT, 2026-09-05, as `persona2-rosa@questlab.test` — a true first-run account this time. Campaign `Persona2 — Rosa` (The Saltmarch Reaches): two level-4 PCs (Ilse, Quill), six hand-written NPCs (four revealed, two hidden; table face left empty on three), an arc created without a tier, a session, a notebook with three pages, then the sample night, the export, and delete. Built over the API from node, screenshotted with headless Chrome at 1440×900 and a 390×844 @2x phone. AI budget: one brief, one NPC, no images. Scripts in `scratchpad/personas2/rosa/`.

## Since run 1

**Fixed.** The card grid shows a `HIDDEN` badge on Corwen and Ysabet and nothing on the four revealed (`rosa_05_npc_cards.png`). The three cards with an empty table face no longer say "No table-face filled yet"; they show 🎯 motivation, personality and 🔒 the long secret from the prep face. Tonight's Cast shows the same full cards (`rosa_08_hud_cast.png`), and the dock's People tab is a row per NPC that opens to personality, motivation, secret and hooks, badge on the summary (`rosa_09_dock_people.png`). Zero owner-world names in 21 placeholders across twelve forms (`placeholders.json`). An arc made without a tier came back `TIER 1 · LV 1–4` for a level-4 party (`rosa_12_arcs_form.png`) — correct under the 2024 bands — and Tier 2 once I pushed the average to 5, so it is inferred, not forced. Delete: 204 in 242 ms, then 404 on campaign, NPCs, player sheet and brief. The AI NPC ("Almar Fenn") avoided all eight of my names. The player projection stayed clean after that generation: four revealed NPCs, keys `id,name,role,race,appearance,location,status,portrait_url`, nothing else (`rosa_10_phone_people.png`).

**Still bites.** The brief rewrote all three secrets again — the "records are canon" block went into the *runbook* generator, and the brief never reads NPC records. The HUD's own People tab shows name-and-role tiles with no hidden marker (`rosa_07_hud_people.png`). No session log beyond one textarea. The HUD still opens a no-fight session in "ROUND 1". Mentions render as raw `@[Name]` tokens, no backlinks, no import.

**Regressed.** Nothing I measured.

## First five minutes

Cold `/welcome` 1,167 ms (DOMContentLoaded 272 ms). The landing now says "NPCs with secrets" — in the pricing line, not the pitch (`rosa_01_welcome.png`). Email, Continue, dashboard in 2,574 ms with two buttons, "Run the sample night" and "Manage Campaigns", and a tour at step 1/8 that opens with "None of it needs AI" (`rosa_02_dashboard.png`) — the right first sentence. Guide in 865 ms: NPCs twice, "every NPC with their secrets" under the N-key dock; "notebook" and "export" zero times (`rosa_04_guide.png`). NPC page 2.3 s, HUD 3.5 s, phone sheet 3.2 s.

## NPC record as canon

Cards, Cast, dock: pass. Where a table face exists it wins (Maren shows WANT/KNOWS/VOICE/short SECRET), where it doesn't the prep face stands in. A HUD People tile opens the prep face with "VISIBLE TO PLAYERS" (`rosa_07b_hud_people_tile_open.png`), but the tile itself carries no state.

**The brief** (`POST /sessions/{id}/brief`, notes naming Teodor, Maren and Pell; 35.8 s; `claude-opus-4-8`; `brief.json`). Cold open, premise ("dread and paperwork… the only real clue is the seal itself"), danger dial and spotlight are good and inside my world — no elves, gold, kings, foreign names, no PC name reused. Then `npc_faces`:

- Teodor — stored: *the seal is FORGED, sold to the Ledger three winters ago*. Brief: "The debt is the parish's price for a soul the breach gave back — maybe Ilse's."
- Maren — stored: *takes Ledger shells to look the other way*. Brief: "She signed the acknowledgement years ago to save the Ditch."
- Pell — stored: *he IS the cantor of the Brine Court*. Brief: "He hums to keep the Court from noticing his boat."

Three for three, as in run 1. It added a fourth face, "Ysabet" — my hidden NPC, pulled from Quill's backstory, under a truncated name that will never match the record — with an invented secret, and put `round_gte: 1` on the last beat of a session I called "no monsters". The source explains it: `generate_dm_brief` in `services/ai_service.py` (~L380–470) lists NPCs from `adventure.npc_roster`, the arc's free-text roster, and still says "Invent faces… if an NPC lacks detail". The canon block with `NpcRepo.list_by_campaign` lives in `generate_session_runbook` (~L200–280) only.

**The NPC** (`gen_npc.json`, 12.5 s): a Ledger clerk, hidden by default, no clash, no invented races or coin. Eight fields empty — motivation, race, location, tags and all five table-face fields — because `generate_npc` asks for five. The record is the source of truth and the generator fills a third of it.

## Placeholders and copy

Twelve forms, no owner-world names. The NPC editor's examples are "Captain Aldric", "Tavern of the Black Bird, Phandalin" (WotC's; I'd swap it), "the second sundering's architect". Session premise: "The party returns to town to find the inn shuttered…" (`rosa_13_session_prep.png`). Arc form: title and one line, no tier control. The sample night's two NPCs (`rosa_17_sample_npcs.png`) — Aldous Fenwright, "Grey, wet-eyed, hasn't slept in three days", secret: he heard the bells and bolted his door; Tansy Quill, fourteen, secret: she ran and hasn't forgiven herself — are good enough to steal, faces and hooks filled. They show the form better than the AI one does.

## Continuity

`@` inserts `@[Name]` and pins the NPC in the margin with its kind (`rosa_15_notebook_page.png`); the text keeps the raw token, and `[[Page]]` links insert without rendering. Search found "Teodor", "forged", "hymn", "Neap" (`rosa_16_notebook_search.png`); "Ledger" returned nothing because it is notebook-only, and six NPC records say Ledger. After "running" — a live note via the dock, Draft→Ready→InProgress→Complete — the note survived every step in the dock's Notes tab, but the sessions list shows no notes, recap or log (`rosa_18_sessions_after_run.png`), Teodor's record has no "met in session 1", and the only thing that appends a dated line to session notes is handing out an item (`record_item_handout`, `services/session_service.py` ~L1000). What I need: a per-session log — dated lines, attendance, NPCs who appeared, reveals flipped — that the NPC record links back to.

## Export

`GET /campaigns/{id}/export` → 14.4 KB, `questlab-campaign/1` (`export.json`): campaign with world notes, 2 characters, all 7 NPCs with `secret`, `is_revealed`, tags and table faces, the arc with tier, the session with `actual_notes`, 3 notebook pages with blocks and pins. Missing: the brief I paid for (`export_campaign` in `services/campaign_service.py` pulls the runbook, not `SessionBriefRepo`), combat beats, crier. It would rebuild my NPCs and notebook — the part I'd cry over — except there is no import route, so today it rebuilds nothing.

## Bugs

1. **Brief ignores stored NPC records and contradicts their secrets.** Six NPCs with `secret`; `POST /sessions/{id}/brief` naming three → all three `secret_short` new, a fourth face invented for a hidden NPC under a truncated name. Expected: quote the record or leave blank. `brief.json`; `services/ai_service.py` `generate_dm_brief`.
2. **Brief sets `round_gte` in a no-combat session.** Last beat `round_gte: 1`; expected `manual`.
3. **HUD People tiles show no hidden/revealed state.** Corwen and Ysabet tiles identical to revealed. `rosa_07_hud_people.png`; `frontend/src/pages/SessionHud.tsx` NPC tiles (~L2350–2380); `NpcTableFace` and `DmDockBody` do it right.
4. **AI NPC leaves eight record fields empty.** `gen_npc.json`; `generate_npc` schema (~L590–625).
5. **Mentions render as raw tokens**, `[[Page]]` not linkified, no backlinks. `rosa_15_notebook_page.png`; `NotebookPage.tsx` `pickMention`.
6. **Search is notebook-only** — `notebook-search?q=Ledger` → `[]` with six NPC records matching.
7. **Export omits briefs** (and beats, crier); no import. `services/campaign_service.py` `export_campaign`.
8. **No session log** — one `actual_notes` textarea, nothing on the sessions list or the NPC. `rosa_18_sessions_after_run.png`.
9. **HUD opens in combat on a fightless session** — ROUND 1, END TURN on load. `rosa_07_hud_people.png`.
10. `/play/join/{campaign}` still returns every PC id unauthenticated; unchanged.

## Scores (1–5)

- **Onboarding: 3.** True first-run, "none of it needs AI", a sample worth stealing; the guide never says "notebook" or "export".
- **Table experience: 3.** Cast and dock read my prep now; the HUD People tab can't show hidden, and the screen opens in a fight I'm not running.
- **Player experience: 4.** People You've Met and its API are exactly the boundary I want, verified after an AI generation; join roster still open.
- **Prep: 3.** The record flows outward to cards, Cast and dock; not into the brief, the search, or a session log.
- **Value: 3.** The free tier holds my roster honestly. The $5 brief is the thing that damages it.

*Next session?* **Maybe.** I'd bring the roster and run from the Cast drawer; notes stay in Obsidian until there's a log.

*Would you pay?* $5 Hearth — **no, until the brief reads the records**; the runbook does, the brief doesn't, and the brief is the format I'd use. $12 Lantern — no, I don't want art. $25 Table — no.

**The ONE thing:** move the "Campaign NPC records (canon — never contradict)" block from the runbook into `generate_dm_brief`, and have `npc_faces` copy `secret_short` from the record when one exists instead of inventing. Everything else on my run-1 list is done or half-done; this turns the paid feature from a liability into the reason to pay.

## Verdict

Most of what I asked for in run 1 arrived, and I measured it: hidden badges, prep fields standing in for empty table faces on cards, Cast and dock, no foreign placeholders, a tier that follows the party, a delete that deletes, an export that holds my secrets and my pages. The record is the source of truth for the screens now. It still isn't for the AI — the brief rewrote Teodor, Maren and Pell for the second time because the fix went into the other generator — and it isn't for the session, because nothing records what happened or who the party met. Fix the brief and I'd pay the five; add a session log and I'd move in.
