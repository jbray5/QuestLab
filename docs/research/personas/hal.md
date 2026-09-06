# Persona test, run 2 — Hal Brennan (West Marches organizer, 14 on the roster, 3 rotating DMs)

Test window: 2026-09-05, 19:54–20:14 CDT. I built `Persona2 — Hal` through the API (characters, arcs, sessions, NPC records, encounters, a notebook) and drove the UI in headless Chrome at 1440×900 and 1366×768, plus a 390×844 phone pass on the join page. My own email was the header and the sign-in; `persona2-hal-codm@questlab.test` played my co-DM in a separate browser. AI used: one DM brief (36.1 s) and one NPC (14.1 s); the counter went 50 → 48. Both campaigns deleted at the end (mine: 204 in 2.0 s; the co-DM never had one).

## Who I am and what I need

I run a shared-world campaign: fourteen characters at levels 2–6, three to five at any table, three arcs live at once, and two other DMs running nights from the same canon. My problem is continuity at scale — who holds which loot, which tier each arc is at, what happened last Thursday at a table I was not at, and getting everything out if the tool dies. Today that is a wiki and a spreadsheet, ugly but indestructible. I would move to a tool with a roster, arcs with tiers, a log and an export I could rebuild from. I will not move to one that cannot hold my roster.

## First five minutes

Landing in 1.1 s, `/guide` in 0.9 s, email box to dashboard in 3.4 s (hal_01_landing.png, hal_03_dashboard_firstrun.png). The eight-step tour is short and honest ("None of it needs AI") and describes the campaign → arc → session model correctly (hal_04_tour_1.png). Nothing anywhere mentions a party-size limit. The FAQ says "Only your signed-in account can see or change it" — accurate, and for me a problem.

## Scale: fourteen on the roster

The ninth character was refused: `422 Campaign already has 8 characters (maximum)`. It is a constant (`services/character_service.py:28`) enforced everywhere: the DM form shows it as a toast only after the form is filled in (hal_07b_ninth_result.png), and the player join path calls the same function (`services/character_builder_service.py:224`), so player nine hits the wall on the phone. No count is shown; "+ Add Character" is never disabled. Headline: a West Marches roster does not fit.

So I tested at eight (F6, C5, R4, W5, B3, Rg4, Wl3, P6; average 4.5). Creation ran 108–154 ms per PC; inventory and spells attached, but features needed a `/features/sync` call each, and mundane armour is not in the item catalog at all.

Arcs created without a tier all came back Tier 1 — right for a 4.5 average, wrong for the sixth-level arc. The per-arc override works (`PATCH tier: Tier2`) and the Sessions page shows it honestly, with attendees named under each session (hal_08_sessions_1440.png) — the view my spreadsheet does today. One nit: `status` on session create is ignored, so backfilling three finished nights was nine Advance clicks.

Eight already strains the screens. Characters is a three-column card grid: 2.5 cards above the fold at 1440, a 2,254 px scroll (hal_06_characters_1440.png); fourteen would be five rows. The HUD party column shows a card and a half at 1366×768 (hal_13_hud_muster_1366.png). With thirteen in the order the initiative strip opens collapsed at laptop height and, opened, shows 2.5 combatants behind a horizontal scroll (hal_14_hud_muster_strip_1366.png) — usable, not glanceable. The join page holds: eight names with class icons at 1440 and on the phone (hal_16_join_1440.png, hal_17_join_phone.png).

## Continuity: secrets, log, co-DM

NPC records are good. Every field I need exists, cards show SECRET on the DM side, the unrevealed one wears HIDDEN (hal_09b_npc_corrigan_modal.png), and the player endpoint strips secrets and hidden NPCs entirely. That is the canon record I wanted.

The brief does not read it. I generated one for Reach session 2 with the Warden on the arc roster; the stored secret says Pike forged the writ and sells survey maps. The brief invented "He's being impersonated; the real Pike may already be gone" (hal_19c_hud_reach2_brief_panel.png against hal_09c_npc_pike_modal.png). The code explains it: the "NPC records (canon — never contradict)" block lives in `generate_session_runbook` (`services/ai_service.py` ~200), not in `generate_dm_brief` (~340), which sees only the arc's free-text roster. Credit where measured: it named only the four attending PCs, one spotlight each, and no run-1 placeholder names appeared. The generated NPC had a usable secret and five hooks and did not contradict Pike.

There is no session log and no "since last time". A session has `actual_notes`; nothing reads session 1's notes when writing session 2, and no page shows last night to the next DM. The notebook is the closest thing: `@[Marrow Vell]` and `[[Loot ledger]]` worked, the margin pins rendered as PC/NPC chips, and search found "seal" across pages (hal_12_notebook_1440.png). That is my wiki, minus the history.

My co-DM sees nothing. With her own email she gets "No campaigns yet" (hal_20_codm_campaigns.png); every call against my ids is a 403; a pasted URL renders an empty "No arcs yet" on Sessions and six stacked permission toasts on the HUD (hal_21b_codm_direct_hud.png). Fail-closed is right; the UX is wrong. Shared DMs would need a members table with a role, `_assert_owner` (`campaign_service.py:31`) widened to members, and a clean not-yours page.

## Export

`GET /campaigns/{id}/export`: 26 KB in 330 ms — campaign, eight characters, four NPCs with full secrets, three arcs with encounters and sessions, notebook pages with blocks and pins, maps, shops, puzzles. Missing: character inventory, spells and features (the row's `equipment` and `spells_known` are null; the real rows live elsewhere), briefs, combat state, beats, world maps, custom monsters and items. It carries `dm_email` and the `join_code`. Could I rebuild the world? The story, yes; the sheets, no — and there is no import, so rebuilding means scripting against an API that stops at eight. Kanka's export re-imports; this is a backup of the prose, not the game.

## Encounters across arcs

`/campaigns/{id}/encounters` becomes an arc picker with three arcs, which is right. The builder's meter is wrong for me by design: it takes the party from every character in the campaign (`services/encounter_service.py:326`; the page does `characters.map(c => c.level)`), reading "Party: 8 PCs (avg lvl 5)" for a five-PC night. A 4,500 XP camp read LOW against 3000/4700/6800 while the same card's saved badge said MODERATE from my API save with the five real levels (hal_11_encounter_builder_1440.png). The API accepts `pc_levels`; the UI has no attendee picker. The pack and brief do filter to `attending_pc_ids` (`session_pack_service.py:166`): the AI respects who is coming; the maths does not.

## Bugs

1. **Eight-character cap** — `character_service.py:28`; form, API and join all refuse the ninth; no count, button live, undocumented. hal_07b_ninth_result.png.
2. **Brief contradicts stored NPC secrets** — `generate_dm_brief` lacks the NPC-records block `generate_session_runbook` has. hal_19c / hal_09c.
3. **Meter uses the whole roster** — `encounter_service.py:326`, `Encounters.tsx` pcLevels; no attendee picker; badge and meter disagree on one card. hal_11_encounter_builder_1440.png.
4. **"Low" for 4,500 XP against a 3,000 Low budget** — `encounter_math.py:190–197` buckets everything under the Moderate budget as Low while the bar draws it in the Moderate band.
5. **Session status ignored on create** — `create_session` never receives `status`; every session is Draft.
6. **Co-DM direct URL** — six stacked toasts and a "create your first arc" page instead of a not-yours screen. hal_21_codm_direct_sessions.png, hal_21b.
7. **Table projection survives delete** — after the cascade `GET /api/table/{session}` still returns 200 with a fresh empty projection while `GET /sessions/{id}` is 404. Nothing leaks, but the link is not dead and anonymous GETs create rows.
8. **Export is not a rebuild** — no inventory/spells/features, briefs, combat, beats, world maps, custom catalog; no import.
9. **Minor** — no features until `/features/sync`; mundane armour absent from the catalog; roster encounters 0 XP until re-saved.

## Scores (1–5)

- **Onboarding 4** — 3.4 s to a dashboard and a truthful tour; nothing warns about the cap.
- **Table experience 3** — thirteen in the order and eight in the party work, as scrolling lists at laptop height.
- **Player experience 3** — join page and sheets clean for eight; player nine is turned away.
- **Prep 2** — good NPC canon and a notebook I would use; a brief that overrides that canon and a meter that counts absent PCs.
- **Value 2** — the roster does not fit, the second DM cannot see it, the export does not restore it.

*Next session?* **No.** Six of my fourteen cannot have a sheet, and Thursday's DM cannot sign in.

*Would you pay?* $5 Hearth — **no**; the brief contradicts my own records. $12 Lantern — **no**; art is not my problem. $25 Table — **no**; nothing there touches roster, sharing or import.

**The ONE thing:** lift the eight-character cap and let the session's attendee list be the party everywhere — meter, HUD, brief. Close second: a second DM email on the campaign.

## Verdict

This is a well-built tool for one DM and one party of four to six, and what I measured shows it: sub-second pages, NPC secrets that never reach a phone, a notebook that links and searches. It is not built for a roster. An eight-character constant, an owner-only check and a meter that assumes everyone is at every table are three small decisions that together exclude every West Marches, club night and campaign with a bench. The export confirms the shape: prose about sessions, not the sheets my players carry. Lift the cap, let attendees drive the maths and the brief, give me a members table, and I would run my next muster here and bring two DMs with me. Until then the wiki and the spreadsheet keep the canon, because they never told me the world was full.
