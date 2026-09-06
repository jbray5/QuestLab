# Persona test, run 2 — Adaeze Okafor (public-library youth-services librarian, Thursday teen D&D club)

Test window: 2026-09-05, 19:55–20:16 local (21 minutes live). Signed in through the email box as `persona2-adaeze@questlab.test`, pressed "🎲 Run the sample night", renamed the campaign it built to `Persona2 — Adaeze`, set a join code, joined as eight kids in eight separate browser contexts, probed the API with curl and `fetch`, fought in the Arena three times, then deleted the campaign. Headless Chrome at 1366×768 and 1280×720 (DM), 1280×720 (projector), 390×844 @2x (phones). AI used: none. Screenshots: `personas2/shots/adaeze_NN_label.png`.

## Who I am and what I need

I run a Thursday club for eight 13–16-year-olds on the library's projector and their own phones, after six years of DMing Starter Set boxes and one-shots. The library's rules: no accounts, no personal data, nothing that costs us money, and I must be able to tell a parent who can see what. I get no prep time, so the night has to run as it comes out of the box. The words on screen have to make sense to a thirteen-year-old who has never heard "proficiency". And the projector is a cheap one in a bright room, so the players' screen needs contrast, not atmosphere.

## First five minutes

Landing in 1.1 s: "Free, forever, for the table" and "Your email stays on this device" (`adaeze_01_welcome.png`). Email box, no password; Enter to a dashboard with the sample button in 59 ms (`adaeze_02_dashboard.png`). The eight-step tour opens with "None of it needs AI", the sentence I needed (`adaeze_03_tour_step1.png`); it never mentions the join code, which only the guide covers. Guide 748 ms (`adaeze_04_guide.png`); terms 614 ms, one readable screen (`adaeze_05_terms.png`).

## Running the sample night as-is

The sample button built the campaign and opened the HUD with the script drawer open in 3.5 s; a second press re-opened the same campaign in 0.85 s without duplicating it. The script is runnable: three scenes with italic read-aloud text, DM notes, minutes per scene, NPC lines and a 🎭 Cast panel with what each NPC wants (`adaeze_06_hud_script_1366.png`, `adaeze_07_script_scene2.png`). The level is right for my group; "If you're going down the mill road, I'm coming. Don't argue." is a line the kids will repeat.

Then scene two says "This is the fight: run 'Ambush at the mill road'" and there is nothing to press. The route is ＋ Add → "Load Encounter…" → ⚔️ Load → 🎲 Roll Init → 🎮 Live → + Party → + Foes (combat): six clicks across two other panels (`adaeze_10_hud_add_dialog.png`, `adaeze_11b_hud_live_tab.png`). The encounter's own read-aloud, "the goblins come over the wall", appears nowhere in the HUD (`adaeze_14b_hud_people_1280.png`). Measured: sample button to goblin tokens on the projector, 27.7 s, about 20 s of it the projector catching up. Knowing the clicks, sign-in to goblins is under 35 s; not knowing them, it is a guide read.

The projector is bright, labelled and legible at 1280×720 in a lit room — better than my Roll20 nights (`adaeze_12b_projector_goblins_1280.png`). But the map is a sunny village square with bunting; the script describes a narrow road, a stone wall, reeds and black pond water. The kids will notice.

## Eight kids joining

I typed `OWL7` into the small "JOIN CODE" box on Characters; it saved on blur with no confirmation (`adaeze_15_dm_characters_join_code.png`). The API refused the roster without it or with a wrong code (403), and accepted lower case.

Eight fresh phone contexts: four tapped a pregen, two built through the creator, two through the join API. Code-to-roster 130–157 ms; tap-to-sheet 360–420 ms; the creator end to end 7–9 s; eight sheets reloading at once 1.2–3.2 s each. Damage from me landed on four phones in 292–496 ms, a condition in 522 ms, End Turn cleared the banner in 308 ms (`adaeze_41_phone_condition_prone.png`). The whole club would be in within two minutes. The sheet is high-contrast with an unmissable "IT'S YOUR TURN" banner (`adaeze_18_phone_sheet_pregen.png`); the remote window shows the order and party HP (`adaeze_31_phone_table_window.png`).

The creator (`adaeze_19` to `adaeze_26`) says why Next is greyed, plainly ("Pick 3 more skills from your class list."). Words a thirteen-year-old will ask me about: **Species, Acolyte, Versatile, Origin feat, Savage Attacker, Magic Initiate, Prestidigitation, Sleight of Hand, Intimidation, Persuasion, Arcana, Standard array, Point buy**, the class line "d10 · STR/DEX · saves STR, CON · caster" (no key), "From my book…", "the forge paints from this", and on the sheet **PROF, PASS. PERC, INIT, Hit Die, Heroic Inspiration, Start concentration**. None of it is wrong; there is no tap-for-a-definition.

Leaks: with the code, any kid can tap any other kid's card and is on their sheet (`adaeze_28_leak_kid1_opens_kid2.png`). Without the code, a fresh phone with a sheet link opens the sheet; only the join page asks (`adaeze_29_leak_stranger_opens_sheet.png`). `GET /api/play/<pc>` with no header returns 49 fields including `player_name`, `backstory` and `notes`. The creator requires "Your name (the player)", and that name sits on the roster for everyone with the link (`adaeze_17_phone_join_roster.png`). The terms say "Player links carry no personal data." For my club that is not true.

## Safety and data

Without a header: `/api/campaigns` 401; `/api/play/join/<campaign>` 403 without the code, 404 for a guessed UUID; `/api/play/<pc>` 200; `/api/table/<session>` 200 with tokens, initiative and party HP — and 200 with an empty projection for a guessed UUID and for the deleted session, never 404; `/sessions/<id>/runbook` and `/combat` 401. DM notes, secrets and the runbook never crossed to a player route. Delete: 204 in 396 ms, and every sheet, the join page and the Arena were 404 afterwards.

Hosts a kid's phone contacts: `quest-lab-tau.vercel.app`, `questlab-api-9yhe.onrender.com`, `fonts.googleapis.com`, `fonts.gstatic.com`; projector and DM add `lemsan3qq1nll8xj.public.blob.vercel-storage.com` for map images. No analytics. Google Fonts is the only third party seeing the kids' devices; self-host three fonts and it is clean.

AI on the kids' side: the sheet has no AI buttons, but 🛡 YOUR CHARACTER opens a page whose biggest control is a gold "🔥 Forge my look" with a free-text box (`adaeze_34_phone_character_forge_page.png`). Per `api/deps.py::gate_ai_for_pc` it is billed to the campaign owner; here a child could spend my allowance with no DM switch. I did not press it. DM-side AI never got in my way.

## The Practice Arena for teens

Yes, between sessions, with one fix. The lobby copy fits them ("Learn the turn: one action, one bonus action, and when to Dodge"), foes that fit your level come first, and every roll is written out as "d20 [19]+5 = 24 vs AC 15" so a kid can check the maths (`adaeze_35_arena_foes.png`). Zero HP reads "💀 You're down … You drop to 0 HP. At a real table your friends have three failed death saves to reach you — and the foe has to choose to keep hitting. Try again with a plan." Kind, and the rule taught at the right moment (`adaeze_36_arena_goblin_end.png`).

The fix: the sample pregens have no weapons, spells or features (`/play/<pc>/gear`, `/spells`, `/features` all `[]`). Bram, the 16-STR fighter, has "Unarmed Strike +5 · 4 bludgeoning" and lost to one goblin in two rounds; Lira the wizard has two slots and nothing to cast (`adaeze_39_arena_wizard_goblin_end.png`). Half my kids will pick a pregen, and those kids cannot fight.

## Bugs

1. **Sample pregens have no gear, spells or features.** Repro: sample night → Bram's Arena, or `GET /api/play/<pc>/gear`. Expected: a class kit and spells. Actual: `[]`, Unarmed Strike only. `services/onboarding_service.py::_PREGENS` uses `character_service.create_character`, never the builder. `adaeze_36_arena_goblin_end.png`.
2. **The script cannot start its own fight.** Scene 2 says "run 'Ambush at the mill road'"; that is six clicks in ＋ Add and 🎮 Live, and the encounter's read-aloud appears nowhere in the HUD. Expected: a "Run this fight" button on the scene. `frontend/src/pages/SessionHud.tsx` (~L2071–2210). `adaeze_10_hud_add_dialog.png`.
3. **Projector lags the DM by ~20 s.** Repro: `/table/<sid>` open; press + Foes, or `PATCH /sessions/<sid>/table` a title. Expected: under a second, like the phone. Actual: nothing within 15–20 s on two attempts, visible by 21 s. `frontend/src/pages/TableView.tsx` L63; `integrations/event_bus.py::publish_table_updated`. `adaeze_12b_projector_goblins_1280.png`.
4. **"Join" button on the code page is dark-on-dark.** `frontend/src/pages/JoinView.tsx` reuses `.qj-card` for the submit with no text colour. `adaeze_16_phone_join_code.png`.
5. **Player names are personal data; the terms say there are none.** `#pname` is required in `CharacterCreator.tsx`; `player_service.join_roster` and `GET /play/<pc>` return it to anyone with the link. `TermsPage.tsx`. `adaeze_17_phone_join_roster.png`.
6. **Roster → any sheet; sheet links ignore the code.** By design, but for minors the pick should claim the sheet to that phone and `/play/<pc>` should honour the code. `adaeze_28_leak_kid1_opens_kid2.png`.
7. **Sample map contradicts the script.** `onboarding_service.py::_STARTER_MAP_URL`. `adaeze_09_projector_map_1280.png`.
8. **`/api/table/<uuid>` is 200 for any UUID, deleted sessions included.** Should be 404. `api/routers/table.py::get_table_projection`.
9. **No DM switch for player-side AI.** `frontend/src/pages/CharacterView.tsx`, `api/deps.py::gate_ai_for_pc`. `adaeze_34_phone_character_forge_page.png`.

## Scores (1–5)

- **Onboarding 4** — sign-in to a scripted HUD in under four seconds and a tour that says "none of it needs AI"; the join code is missing from the tour.
- **Table experience 3** — legible projector and 0.3–0.5 s phones, minus a 20 s projector lag and six unexplained clicks between script and fight.
- **Player experience 3** — eight kids in under two minutes and a clear sheet, minus toothless pregens, an invisible Join button and names on the roster.
- **Prep 3** — the runbook is real; the encounter's text is buried and the map is wrong.
- **Value 4** — everything I need is free and works without AI.

*Would you use it for your next session?* **Maybe** — yes the week bugs 1 and 2 are fixed; until then the pregen kids cannot swing a sword.

*Would you pay?* $5 Hearth: **no** — the library cannot, and nothing I need is behind it. $12 Lantern: **no** — no AI art in a youth club. $25 Table: **no**.

**The ONE thing:** make the sample night work for a kid who taps a pregen — pregens with a kit and spells, and a "Run this fight" button on scene two that stages the ambush on the projector.

## Verdict

This is the first table tool I could put in front of my club: no accounts, nothing on the kids' phones but a link, a delete that really deletes, and a projector view that reads from the back of the room. The script would carry a Thursday. What stops me tonight is small and specific: the four pregens cannot attack, the script hands me a fight it cannot start, and the projector takes twenty seconds to catch up with my laptop while the phones take half a second. Fix those, tell the truth about player names in the terms, and I would run "The Millpond Bells" next Thursday and say so to the other branches.
