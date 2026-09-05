# Rosa — QuestLab persona test (2026-09-05)

Campaign: "Persona test — Rosa" (id `ae0e6dbf-…`), The Saltmarch Reaches. Built: 1 arc, 2 sessions, 7 NPCs (6 by hand: 3 revealed / 3 hidden, 1 AI), 1 notebook with 3 pages, session notes, 2 PCs via the join flow. Deleted at the end. Screenshots in `personas/rosa/`. Two paid generations used (one NPC, one brief), no images.

## 1. First five minutes

The landing page (`01_welcome_cold.png`) is pitched at a table that runs on maps and dice: "A shared board on the TV. A living sheet on every phone. Dice you shake." Not one word about lore, NPCs, notes, or a campaign journal. The three bullets are QR-to-board, HP syncing, and initiative. The sign-in box says "Your email stays on this device… No password, no verification" — which is honest, and also told me immediately that whatever I type into this thing is protected by nothing but my email address (see Secrecy audit).

The guide (`02_guide.png`, "Your first session in 15 minutes") is the same product: HUD, TV, phones, "adding foes and rolling initiative, dragging tokens". The word "notes" appears once in the loop and "NPC" not at all in the first screen. If I only read the landing and the guide I would close the tab: it reads as a VTT for combat-heavy groups, and I run theater of the mind with a folder of secrets.

After sign-in I landed on a dashboard with eleven campaigns on it (other persona tests, showcases) — not my problem, but the sample "Your first campaign" is "classic heroic fantasy, warm, a little spooky", which again tells me who this is for.

Verdict on onboarding for me: it does not speak to a lore-heavy DM at all. The good news is buried under `/campaigns/{id}/npcs` and `/notebook`, and nothing on the front door points there.

## 2. World tools

**NPC records** (`22_npcs.png`, `23_npc_ysabet.png`). This is the best part of the app for me and I want to be fair about it. The record has two halves: a "TABLE FACE — what you read at arm's length" (Quick who / Want now / Knows (cap 3) / Voice / Secret, table-length / Relationship pings) and a "PREP FACE — depth & connections (not for at-table reading)" (role, race, gender, age, status, last known location, appearance, personality, motivation, secret, dialog hooks, tags, private DM notes). At the bottom: **"VISIBLE TO PLAYERS — Hidden, DM-only until you toggle this on."** Hidden is the default, including for the AI-generated NPC. That default is exactly right and it is the thing every campaign manager I've used gets wrong.

Tags become filter chips automatically (`DM-ONLY`, `PLAYERS-KNOW`, `brine-court`, `ledger`…), which is my Obsidian tag workflow for free.

What's missing versus Obsidian/World Anvil:
- **The card grid shows nothing.** Every one of my seven cards read "No table-face filled yet — tap to add WANT / KNOWS / VOICE / SECRET." No role, no tags, no location, and — crucially — **no visible marker of hidden vs revealed**. The left-border colour turned out to be *status* (Alive = green, Unknown = gold), not visibility. I had to open each record to know what my players can see. The one flag I care about most is invisible from the list.
- **Two secret fields, no bridge.** I filled `secret`, `motivation`, `dialog_hooks` (the prep face). The at-table "Cast" panel and the dock only read the table-face one-liners, so at the table every NPC says "No table-face filled yet". Nothing derives a table face from the prep face; I would re-type all 7 (in my real campaign, ~140) NPCs as one-liners.
- No links between records (NPC ↔ faction ↔ location ↔ session), no backlinks, no "first met in session N" — the "People you've met" boundary is a single boolean, not a history. Relationship pings are free text.
- The editor's placeholder text is someone else's world: "Recognizes Thane's fey-light; calls him Ae'lim. Fears Halve on sight." Fey-light. In my editor. Small, but it's the exact thing I'm allergic to.
- No import. Hundreds of Obsidian notes have no path in except typing or the API.

**Notebook** (`24_notebook.png`). Notebooks → pages → blocks (text/markdown, verbatim read-aloud, prompt-to-a-player, "Key — DM key, muted", card with up to 5 beats, sketch, image, divider). Autosaves ("✓ saved"), Undo, a Read mode, search across notebooks, "Make runbook" to promote a page to tonight's script, and a margin rail with pins and "Ask the margin…" / "Riff on selection" (AI, which I didn't spend on). The verbatim block renders as a quoted read-aloud and the Key block renders muted — that is genuinely the prep-vs-play distinction I keep in my head. Missing: wikilinks / `[[NPC]]` mentions (there is an `@mention` token in the code but I couldn't find it in the UI), backlinks, a graph, tags on pages, export, and any "player-facing page" — everything in the notebook is DM-only, which is safe but means the World Anvil mirror stays where it is.

**Arcs and sessions** (`26_sessions_arcs_full.png`). Arcs are tiers ("TIER 1 · LV 1–4" was stamped on my level-5 party's arc by default), sessions are numbered rows with HUD / PREP / PARTY / ADVANCE. The session prep page has a single "DM notes" textarea that saved and reloaded fine. There is no session *log* as a first-class thing — no "what happened", no attendance record, no recap. The notebook can hold a journal page per session, but nothing links a page to a session row. Three years of session logs would live in a flat page list.

## 3. Secrecy audit

All of this was done as an unauthenticated visitor (a phone with no localStorage), with `page.on('response')` capturing every API body and grepping for 18 DM-only strings (secrets, hidden names, my "DO NOT REVEAL" note, my world-notes text). Files: `audit_api.log`, `audit_player.log`, `network_log.json`.

| What a player can reach | Result | Evidence |
|---|---|---|
| `GET /api/play/{pc}/npcs` (the "People you've met" source) | **PASS** — exactly the 3 revealed NPCs; each object has only `id,name,role,race,appearance,location,status,portrait_url`. No secret, motivation, hooks, tags, or notes. | `api_play_pc_npcs.json` |
| Player sheet `/play/{pc}` on a phone, "People You've Met" | **PASS** — Teodor, Maren, Old Pell only; Ysabet/Corwen/Drowned Boy absent. Page text had zero DM strings. | `11_player_people_full.png` |
| After AI generated a new NPC | **PASS** — it defaulted to hidden and did not appear to players. | `dm_tour2.log` |
| `GET /api/play/{pc}` | PASS — the PC's own sheet; `notes` field contains only the builder's SRD note. | `api_play_pc.json` |
| `GET /api/table/{session}` (2D + 3D projection) | PASS — map/fog/tokens/darkness/title only, 288 bytes, no notes. | `api_table_session_projection_.json` |
| `/table/{s}/3d`, `/table/{s}` pages (network) | PASS — only `/api/table/{s}` was fetched; nothing else. | `network_log.json`, `13_table3d.png`, `14_table2d.png` |
| `GET /api/campaigns/{id}/npcs` with **no header** (from the player page and from curl) | PASS — `401 {"detail":"No identity header present. Access denied."}` | `audit_api.log` |
| Same, plus campaign, hidden NPC, session, table, combat, runbook, brief, notebook page, notebooks, characters, campaign list — no header | PASS — all 401. | `audit_api.log` |
| Same routes with a **stranger's** email in the header | PASS — 403 ("You do not have permission to manage NPCs in this campaign"); campaign list returns `[]`. | `audit_api.log` |
| `GET /api/campaigns/{id}/npcs` with **my own email typed into the header** from an unauthenticated player page | **FAIL (by design, and it's the whole ballgame)** — 200, 6.4 KB, all 7 NPCs including "forged", "Ysabet", "Corwen", "Drowned Boy", "DO NOT REVEAL", the lot. | `audit_player.log` last line |
| `GET /api/play/join/{campaign}` (no auth) | **WEAK** — returns every PC's id + player name; `campaign_id` is in every sheet response, so any player can open any other player's sheet and press Damage / spend slots / sell gear. The join page literally says "Tap your character to open your sheet" and shows everyone's. | `api_play_join_campaign_roster_.json`, `12_join_phone.png` |
| Unauthenticated visit to `/campaigns/{id}/npcs` | PASS — bounced to `/welcome?next=…`. | `15_dm_npcs_unauth.png` |

On the FAIL: `docs/SECURITY.md` is honest about it — "`header` — personal / Azure deployments… **This mode must never face the public internet without an authenticating edge in front of it** — the header is trusted as-is." The Render API *is* on the public internet, and the landing page says "no password, no verification". So in this deployment the DM secret is the DM's email address. My players know my email. A player at my table who opens DevTools and adds one header can read every secret in my campaign. The document also says the fix exists (`AUTH_MODE=oauth`, Discord/Patreon, signed bearer tokens — and `Bearer nonsense` correctly got a 401), but the app I was handed is not running it. I checked what I could observe, not what the config file promises.

Everything the app *chooses* to send to a player is clean. I found no projection leak anywhere. The boundary is well drawn; the door to the DM side just isn't locked in this mode.

## 4. Notes at the table

Better than I expected. The HUD (`30_hud.png`) has my session notes in a strip under the board, and **N** opens a "DM Notes" dock (`32_hud_dock_N.png`) with Notes / Script / People tabs, a session picker, and "Pop out". I typed a live line into the dock, it showed "saved ✓" (`36_dock_notes_typed.png`), the API had it a second later, and it was still there after a hard reload (`37_dock_notes_after_reload.png`, `dm_tour.log`). The notes also appear on the session prep page. So prep → play → back to prep survives, in one textarea. The placeholder — "Tonight's notes — what happened, what they said, what you owe them next time" — is the right sentence.

What doesn't survive contact:
- It is **one textarea per session**. No timestamps, no "prep vs. what actually happened" split, nothing that becomes a session log afterwards. My live scribbles now live in the same box as my prep bullets.
- The dock's People tab and the "Tonight's Cast" panel show every NPC as "No table-face filled yet" (`52_dock_script_text.txt`) — my secrets, motivations and hooks are in the record but not in the panel I'd actually read from. (They are DM-only, correctly; they're just not there.)
- The HUD is combat-first: my two PCs were already sitting in a "COMBAT · ROUND 1 · 2 IN ORDER" tracker with an END TURN button on a session that has no fight in it. For theater of the mind the centre panel is "No battle maps in this campaign yet", the 3D table is "The table is being set…" forever (`13_table3d.png`), and the 2D table is "No map on the table". Nothing on the player-facing screen is useful to me without a map.
- The session prep page's premise placeholder is again someone else's campaign ("The party returns to Restwater to find the bathhouse shuttered and Auntie Sorrel gone. A fey courier…", `28_run_prep_full.png`).
- The Script tab in the dock opened an empty panel even after a brief existed; the HUD "Brief" button dimmed the page and I couldn't see the modal in a 1366×860 headless window (`53_hud_brief_full.png`). May be my harness; flagging it, not counting it.

## 5. Canon test

**NPC generate** (`POST /campaigns/{id}/npcs/generate`, role "an inspector from the Concordat of Lanterns, newly arrived at Corran's Ditch to audit Brother Teodor Vask's seal", 18.8 s, `gen_npc.json`):

> **Inspector Halvard Quill** … "wearing the ash-grey traveling coat of the Concordat with a lantern-and-scale pin at his throat … His left cheek bears a faded brand — a lantern with a broken flame" … Secret: "The Concordat sent him because three previous inspectors who examined seals along the Saltmarch Reaches vanished, and each had reported the same anomaly: seals bearing wax that never hardens and smells faintly of low tide … he witnessed something in a flooded chapel that he has never reported, and he suspects Vask's seal is the same kind of 'lantern that lets the dark in.'"

It read the world notes: Saltmarch Reaches, marsh, Concordat, seals, no gold, no elves, no king, no dragons, and the voice ("A seal is a promise, Brother") is right. But: (a) it named him **Quill** — the same name as one of my two PCs, which the generator could see on the roster; (b) it invented Concordat history (three vanished inspectors, a brand, uniform details) and a **new magic mechanic** (wax that never sets, "a lantern that lets the dark in") that I did not write and that gives the Brine Court a second supernatural signature I now have to either adopt or discard; (c) `motivation`, `race`, `location`, `tags` came back null while the prose is four paragraphs. Verdict: inside the lines on setting, colouring outside them on lore. It did not contradict canon; it added canon.

**Session brief** (`POST /sessions/{id}/brief` with a paragraph of my prep, model `claude-opus-4-8`, **95 s**, `gen_brief.json`):

> Cold open: "Old Pell's ferry cuts the dusk-water, low and slow. He hums under his breath — a tune you almost know but can't place…" Premise: "…the Ledger is paying for the breach and the Brine Court is singing it open. This session is about dread and a single quiet clue — gold — not monsters." Beat: "The gold in the ledger … dm_note: THE clue. Land it quietly. Gold = Brine Court." Old Pell wants "To ferry, be paid in shells, and not talk about the tune"; "The water's been 'wrong-hearted' since Neap."

That is my session, in my calendar and my coinage, with Ilse's backstory pulled in ("Warden of Corran's Ditch; saved Ilse's life once" — it read the PC). The beats, the danger dial ("keep foes human and outnumbered", "the wall holds till dawn no matter what"), and the roads are things I would actually run. And then the `npc_faces` block **rewrote my NPC records**:

> Brother Teodor — secret_short: "**His seal is real** but he's been humming the tide-hymn in his sleep."
> Maren Holloway — secret_short: "She's already written the parish off — she wants witnesses, not saviors."
> Old Pell — secret_short: "He knows the hymn is Brine Court and pretends he doesn't."

My record says Teodor's seal is **forged** and that is the entire point of him. My record says Maren wants to keep the wall standing one more winter and is quietly taking Ledger shells. Pell isn't a bystander who "knows the hymn", he's the cantor singing it. All three NPCs exist in the same campaign with those secrets filled in, and the brief either didn't read them or overrode them. It also assigned combat-round triggers (`round_gte: 3`, `round_gte: 6`) to a session that has no combat.

Verdict on hallucination: **no invented names, places, gods, coins or races in either generation — the world-notes discipline works.** But the brief contradicted three NPC secrets I had already written, which for me is worse than a made-up tavern name, and the NPC generator wrote a mechanic into my magic system. "Honest AI that stays inside my canon or stays quiet" — it stayed inside the setting and did not stay quiet about the people.

## 6. Bugs

1. **`DELETE /api/campaigns/{id}` → 500, twice, and it is not transactional.** After the first 500 the PCs were already gone (`/play/{pc}` 404) while the campaign, NPCs, notebook, sessions and adventure remained. Repro: create a campaign with an NPC, a notebook page, a session with a brief, then DELETE the campaign. Deleting NPCs, notebook, sessions, adventure by hand (all 204) and then the campaign (204) worked. Log: last two Bash outputs; `ids.json`.
2. **Header-mode API is public** (see audit). Repro: from any page, `fetch('/api/campaigns/{id}/npcs', {headers: {'X-MS-CLIENT-PRINCIPAL-NAME': '<dm email>'}})` → 200 with every secret. Documented in `docs/SECURITY.md`; still what's deployed.
3. **Join roster exposes every PC's capability URL** to anyone with the campaign id (which every sheet response contains). Repro: `GET /api/play/join/{campaign}` unauthenticated → all pc ids; open `/play/{other pc}` and press Damage. `12_join_phone.png`.
4. **NPC list shows no revealed/hidden state**; border colour is status. `22_npcs.png`, `55_npcs_after_gen.png`.
5. **Prep-face fields never reach the table.** Seven NPCs with secrets/motivations/hooks all render "No table-face filled yet" in Cast and the dock. `52_dock_script_text.txt`.
6. **AI NPC reused a PC's name** ("Inspector Halvard Quill" vs PC "Quill"). `gen_npc.json`.
7. **Brief contradicts stored NPC secrets** (Teodor "seal is real" vs record "forged"). `gen_brief.json`.
8. **Foreign-campaign placeholders** in the NPC editor ("Thane's fey-light… Ae'lim… Halve", `23_npc_ysabet.png`) and session premise ("Restwater… Auntie Sorrel… fey courier", `28_run_prep_full.png`).
9. Arc auto-stamped "TIER 1 · LV 1–4" for a level-5 party. `26_sessions_arcs_full.png`.
10. Join flow accepted "Sailor"/"Urchin" backgrounds with a warning ("isn't in the SRD") but no way to define my own — the builder is SRD-only. `build.log`.
11. Minor: dock Script tab empty after a brief exists; HUD Brief modal not visible in headless capture (`53_hud_brief_full.png`) — unconfirmed.

## 7. Scores (1–5)

- **Onboarding: 2.** Honest, fast, and aimed at someone else. Nothing on the door says "your NPCs' secrets are safe here", which is the only sentence that would have kept me.
- **World tools: 3.** The NPC record with its hidden-by-default toggle and the notebook's verbatim/key blocks are the right shapes. The list view hides the one flag I care about, nothing links to anything, and there is no import. Companion to Obsidian, not a replacement.
- **Table experience: 2.** For a map-and-initiative table, probably a 4. For mine, the centre of the screen is empty, the initiative tracker is always on, and my NPC prep doesn't show up in the panel built to show it. The notes dock is the one thing I'd use.
- **Player experience: 3.** The sheet is clean, "People You've Met" is exactly the boundary I want, and it never showed a hidden name or a secret. Docked for any player being able to open any other player's sheet, and for the 3D/2D table being a black rectangle without a map.
- **Value: 2.** The free tier gives me a safe NPC list and a notes box. The paid AI made a good brief and then corrected my own NPCs at me.

Would you move your campaign's running notes here? **No.** I'd move my NPC roster's *reveal flags* here as a mirror once the list shows them, and keep the notes in Obsidian until pages can link to NPCs and sessions have a log.

Would you pay for the AI tier? **$5 — maybe**, only for briefs, only if it reads and respects NPC records before it writes `secret_short`. $12 no. $25 no.

The one thing that would make me switch: **make the NPC record the source of truth for everything else** — the card shows Hidden/Revealed at a glance, the table panel reads my prep-face secret and hooks without re-typing, notebook pages can `[[link]]` an NPC, and the brief is forbidden from contradicting a stored secret (quote it or leave it blank). Do that, and fix the delete, and lock the API, and I'd try a real session.

## 8. Verdict

The parts that guard my players' immersion — hidden-by-default NPCs, a clean "people you've met" projection, a table that fetched nothing it shouldn't — are built by someone who understands the problem, and I didn't catch a single leak in what the app sends to players. But the front door is my email address, the AI rewrote three of my secrets in a session brief, and the tool built to read my NPC prep at the table showed me seven blank cards; I'll keep watching it, and I'll keep my binder.
