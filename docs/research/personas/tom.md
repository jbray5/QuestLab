# Persona test, run 2 — Tom Whitfield (busy hybrid DM, two kids, 40 minutes after bedtime)

Tested 2026-09-05, 20:47–21:06 local (19 minutes live, write-up after). One campaign, "Persona2 — Tom": an arc, one session, four level-3 PCs (Fighter, Cleric, Wizard, Rogue) through the same join endpoint the phone creator posts to, one of my own ink maps uploaded over the API. Driven by headless Chrome: HUD, prep page and the remote player's tab at my laptop's 1366×768, the in-room phone at 390×844 @2x. AI used: one Session Pack (through the prep page, not the API) and one brief; zero images. Campaign deleted through the Campaigns page at the end. Screenshots: `personas2/shots/tom_*.png`.

## Since run 1

Last time: a pack that pulled a custom monster with AI art from another campaign, a villain it named but never created, "Round 1: Round 1:", a "Moderate" label on a fight I read as High, no map, an NPC called "Hessa Cleft (absent)"; a 60 px board sliver at laptop height; conditions that stopped at my screen; delete returning 500; packs priced in the $12 art tier.

**Fixed, measured.** Delete: one click, campaign 404 in 4.1 s, session, sheets and map gone with it (tom_61_campaigns_after_delete.png). Pack: SRD Ogre only, `is_custom: false`, no art; clean NPC names (tom_14_prep_runbook_top.png); no "Round N:"; difficulty label matches the maths; every scene names a map from my library. Board at 1366×768: a 656×278 px SVG (tom_40_hud_live_1366.png), nothing scrolls. Ten HP taps in 1.88 s landed as ten (27→17 on the server). "+ Foes (combat)" landed first try. Grappled reached the phone (tom_50_phone_ansel_condition.png) and the remote window (tom_45_remote_wrens_turn.png). The QR retired when I staged a map. The guide's sign-in line now matches the email box. Packs are in the $5 Hearth tier.

**Still bites.** The pack's success banner — the only place its warnings show — never appears; the card unmounts when the runbook loads (Bug 2). Three of four loot lines are "(catalog)" and aren't (Bug 3). It named a boy, Ferrel, six times and didn't create him (Bug 4). Runbook XP still disagrees with the encounter (Bug 5). Two of four party cards fit on screen.

**New, and worse.** The brief. Generated after the pack, it invented a different toll-keeper, "Barrow Cleft", and a drowned thing under the arch — with Hessa Cleft a stored NPC record and the Ogre the only encounter. Two nights from two buttons on one page (Bug 1). The pack at least tells me what it made.

## First five minutes

Cold landing 1,363 ms at 1366×768, guide 899 ms, the email box got me off `/welcome` in 49 ms (tom_01_welcome_1366.png, tom_03_signin_typed.png). The eight-step tour says the useful things in order: run the sample night first, campaign → arc → session, "press N", "TV or projector for the players, your laptop for the HUD" (tom_05_tour_1.png). The dashboard offers "🎲 Run the sample night" (tom_06_dashboard_after_tour.png). Nothing in those minutes contradicted anything else, which is new.

## The Session Pack

Premise typed at 20:52:56; the runbook's `generated_at` is 20:54:21 local: **85 seconds**, same as run 1 (tom_11_prep_premise_typed.png, tom_12_prep_building.png). The button says "~1 min"; say two.

| Check | Result |
|---|---|
| Catalog monsters only | Yes: one Ogre, SRD, CR 2, Giant, no art. |
| Antagonist on the list | The antagonist is the encounter row itself. Hessa Cleft, Bettony Ashe, Odo Marsh are on the roster with secrets and voices; Ferrel is not (Bug 4). |
| Names clean / "Round N:" | Clean / gone. |
| Difficulty | "Low". Four level-3s: Low 600, Moderate 900, High 1,600; one Ogre is 450, below Low. Label matches. My read: +6 and 2d8+4 puts a 20 HP wizard down in two hits, so it's a real fight, but the Ogre bolts at half HP into the chase I asked for. I'd run it as written. |
| No undead / one fight / chase / Hessa | All honoured. It also read "two players are remote" and wrote "Remote players: give them the peddler and the mother as easy people to interview" — the constraint it ignored last time. |
| Map | Every scene: `stage_map: "Forest road and ford"`, my one map. Staged with one click in the HUD (tom_22_hud_map_staged.png). |

The writing holds up: "I raise the toll so folk cross fast and don't dawdle where it can reach — fewer crossings, fewer mouthfuls for it." The chase has DCs and a four-round clock. ＋ Add → "The Thing Beneath (Low)" → Load gave me five combatants, my four PCs included; Roll Init sorted them (tom_23_hud_encounter_loaded.png, tom_24_hud_after_init.png).

## The laptop cockpit at 1366×768

Default HUD (tom_20_hud_default_1366.png): party column with two cards visible, the board with Maps / Live / People tabs, a 115 px notes pane, no rules bar, the strip collapsed behind "▸ Combat · Round 1 · 5 in order"; opening it costs 99 px (tom_30_hud_strip_toggled.png). N opens a 424 px notes dock over the board (tom_28_hud_notes_dock.png); 🎬 Script slides in scene 1's read-aloud (tom_29_hud_script_drawer.png). Load Encounter is inside the ＋ Add popover (tom_25_hud_tokens.png); I found it because I'd found it in run 1. This is one screen I could run from with Discord on the other half.

## Hybrid, two rounds

HUD at 1366×768; Sam's phone on Dagny's sheet; Marcus remote on `/table/<session>?pc=<Wren>` in a laptop tab — the link is on the phone as "🗺 TABLE" (tom_41_phone_dagny_sheet.png, tom_42_remote_wren_window.png). Phone 1.6 s, remote window 0.84 s.

The remote player gets: initiative with names and PC HP bars (the Ogre shows "foe", no numbers, correctly), a ▶ on the current turn, a full-width "YOUR TURN — Wren Holloway" 606 ms after my End Turn (tom_45_remote_wrens_turn.png), a Rolls panel showing Dagny's d20 204 ms after the roll (tom_46_remote_roll_log.png), GRAPPLED and PRONE chips (tom_48_remote_conditions.png), and "only yours moves": her move returned 200, an attempt on Dagny's token moved her own. Round 3 on the remote when the HUD said Round 3 (tom_51_remote_round3.png).

The room gets: an HP change from my party card on the phone in 820 ms (the card debounces 320 ms), "IT'S YOUR TURN" 498 ms after End Turn (tom_53_phone_turn_banner_r3.png), Grappled on Ansel's sheet.

So the remote player gets what the room gets, plus an initiative panel the room doesn't. One drift, partly mine (Bug 6): the remote panel reads the combatant row, the phone reads the sheet, and I got them to disagree.

## Value at $5

Pack: 85 s to make, eight minutes to read, five to fix (add Ferrel, check the loot, ignore the XP line) — a runnable night in fifteen against a 40-minute window that usually spills. Twenty-five minutes a week. Brief: 39 s, and as it stands it costs time, because I'd have to reconcile "Barrow" with Hessa; until it reads the pack it saves zero. A pack is one generation (50 → 49 → 48 for pack + brief), so 15 a day is a month of Saturdays. $1.25 a night for 25 minutes back: yes. The guide's "Hearth — $5 / month … and full Session Packs. 15 generations a day" is the sentence I asked for. The landing's "…full Session Packs, portraits and standees. From $5 a month" lumps the $12 art in with the $5 text; "from" carries it, barely.

## Bugs

1. **Brief contradicts the pack.** Repro: pack (Hessa Cleft on the roster, Ogre encounter) → POST `/sessions/{id}/brief`, notes "Tonight is the toll at Cleft Ford." Expected: Hessa and the Ogre. Actual: "Barrow Cleft" and "The Drowned Toll"; 38.7 s, `claude-opus-4-8`; no screenshot (JSON, my `brief.json`). `services/ai_service.py` ~200–284 lists NPC records as "canon — never contradict" but passes only encounter names, not the runbook, and the model renamed the toll-keeper anyway.
2. **Pack summary never shown.** Repro: prep page → Generate Session Pack → wait. Expected: "Pack ready … warnings". Actual: the runbook replaces the card the instant it loads (tom_13_prep_pack_ready.png). `frontend/src/pages/SessionRunner.tsx` ~515–560, banner inside the `!runbook` branch.
3. **Loot tagged "(catalog)" that isn't.** "Fey-Touched Plum Jam", "Coil of Hemp Rope (50 ft.)", "Barrel of Salted Provisions" — none in `GET /items` (180 rows). `services/session_pack_service.py` ~193 reads `ItemRepo.list_all`; `POST /items` (`api/routers/items.py` 137) is a shared catalog any DM can write to. Either the tag is wrong or another DM's homebrew jam is in my pack.
4. **Named person not created.** Ferrel: three NPC hooks, the loot, the closing hooks, no NPC row. The prompt (`session_pack_service.py` ~226) only demands the antagonist.
5. **Runbook XP vs encounter.** `xp_awards` 300 + 100; encounter `xp_budget` 450, `reward_xp` 0 (tom_14b_prep_runbook_full.png).
6. **Sheet HP and row HP drift.** PATCH `/sessions/{id}/combat/{combatant}` left `/play/{pc}` at 28 (tom_43_phone_after_damage.png vs tom_44_remote_after_damage.png); a party-card tap then changed the sheet, not the row. Partly my shortcut; the HUD's own paths should be checked.
7. **Minor:** Load Encounter lives inside ＋ Add, which hides the strip header (tom_25_hud_tokens.png); the API map upload returns only a URL, no guessed grid (`grid_size: null`; UI path not tested); `/table/{session}` still returns 200 with an empty projection after delete, so a TV tab left open shows an empty table rather than "gone".

## Scores (1–5)

- **Onboarding: 4.** Email, an honest tour, a guide that matches the sign-in box.
- **Table experience: 4.** Laptop board, taps and foes that land, QR that retires, conditions that leave my screen. Loses one for two-of-four cards and Load Encounter in a popover.
- **Player experience: 4.** The remote window is the screen I described last time, everything under a second. Loses one for the sheet/row drift.
- **Prep: 3.** The pack is trustworthy on what I audited; the brief undoes that in 39 seconds.
- **Value: 4.** Packs at $5, 25 minutes a week, the table still free.

**Would you use it for your next session?** Yes — table and pack, brief button untouched.

**Would you pay?** $5 Hearth: **yes**, the tier I asked for. $12 Lantern: **no**, I can't show AI art to my table. $25 Table: **no**, nothing there for a prep-only DM.

**The ONE thing:** one canon per night — the brief reads the pack, or the Brief button hides once a pack exists.

## Verdict

My run-1 list is mostly crossed off, and I checked each line rather than took it on faith: delete works, the board fits my laptop, taps and foes land, conditions reach both my players, and the remote guy has a window with initiative, HP, rolls and a card that says it's his turn. The pack cost 85 seconds, honoured every constraint including the one about remote players, and sits in the tier I'd pay for. What's left is a trust problem in a new place: the brief invented a second toll-keeper beside the one the pack created. Fix that, show me the pack's warnings, and I'm a $5 subscriber who preps in fifteen minutes.
