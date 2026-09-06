# Persona test, run 2 — Marcus Hale (in-person purist, 55" TV over the table, real dice, 20 years of DMing)

Tested 2026-09-05, 20:50–21:20 local, on the live app with my own persona email (a true first-run account). I built `Persona2 — Marcus`: one arc, one session, three level-3 PCs pushed in through the API (the sheets my players already have), a public 1400×1000 photo uploaded as a map through the UI, one fog region, three bandits typed into the HUD by hand, and a six-combatant fight run three rounds from the HUD. Then `🎲 Run the sample night` built its own campaign. Headless Chrome: HUD 1440×900, projector 1920×1080 (`/table/<id>` and `?panel=1`), phone 390×844 @2x. Timings are from the browser and the API. AI budget used: zero. Both campaigns deleted at the end (`campaigns left: []`).

One caveat: with fog on, headless Chrome could not rasterize the projector or the HUD's Live tab inside 45 s (screenshots and keyboard input hung; JS and the API kept answering), so fog-on evidence is DOM and API rather than pixels, and I turned fog off for the final board screenshots. The feathered mask in `components/table/MapCanvas.tsx` is where I'd look.

## Since run 1

**Fixed — each re-run the way I broke it last time.**
- **Campaign delete with a running fight.** Round 4, six combatants, six tokens: `DELETE /campaigns/{id}` → 204 in 181 ms; campaign, session, combat, table, maps and the PC's `/play` link all 404 after. Run 1's 500 is gone.
- **QR retires when a map is staged.** QR on the TV (`marcus_13_tv_qr.png`), click the thumbnail: 523 ms later the TV shows the map, square grid, no code (`marcus_15_tv_map_staged.png`); `join_qr_on` is false server-side.
- **+ Foes (combat) lands first time.** One click, 1.5 s, three bandit tokens.
- **Grid guessed on upload.** The 1400×1000 photo arrived with "100" in the grid box and the editor open (`marcus_08_map_uploaded.png`); a timed second upload took 1.2 s from file pick to editor.
- **"Map saved" toast** — 262 ms after the click (`marcus_11_map_saved_toast.png`).
- **Conditions and HP reach the TV.** Prone + HP 25 through the combatant endpoint the strip calls: the projector's initiative entry and token carry `prone` and `25/34` in 416 ms; a fresh TV page shows the squashed token and the panel says Prone (`marcus_24_tv_prone_and_damage.png`).
- **+ Party lands in the light.** Fog on, Region 1 revealed (436 ms to the TV, `marcus_17_tv_region_revealed.png`), all three PC tokens inside the polygon.
- **Square grid on the 3D TV** (`Table3DView.tsx:168`) and **Prone is a tip-over, not a diamond** (`marcus_38_tv_3d_prone.png`; `Board3D.tsx:597`).
- Class avatars; the tour fires on first sign-in and opens with "None of it needs AI"; the sidebar says "Table tool for D&D 5e".
- HP taps are debounced in code (`SessionHud.tsx`, `bump()`, 320 ms); I couldn't exercise it from the HUD tonight, so I'm not claiming it.

**Still bites.**
- The DM's 3D board (`/sessions/<id>/board`) still opens with **⬡ Hex** on my square 100 px map (`marcus_39_dm_board_grid_default.png`; `BoardView.tsx:136`). The TV got fixed; the DM side didn't.
- The guide's videos are **still black boxes** (`marcus_06_guide_watch.png`). The posters are real now and load at 1600×900, but the `<video>` reaches readyState 4 and Chrome shows the clip's first frame, which is black (`GuidePage.tsx:60`, `preload="metadata"`).
- The combat strip was **collapsed** with a fight running at 1440×900, so a condition via the strip is expand, "+ cond", pick.

**New.**
- **Foe tokens under unrevealed fog are drawn on the projector.** I pushed a bandit to x=85%, in the dark; the TV's DOM has all six tokens after the fog rect at opacity 1 (`MapCanvas.tsx`). Players would see the ambush.
- **The QR chip sits on top of the last-roll chip** (`marcus_30_tv_corner_crop.png`): same corner, z-index 60 over 25.
- `GET /campaigns/{id}/characters` → **500** after delete; `/table/{sid}` → 200 empty scene.

## First five minutes

Landing 1155 ms to network-idle (DOM ready 306 ms); email, Enter, dashboard in 82 ms (`marcus_03_dashboard_first.png`). The tour fired unasked: eight steps, step two is "Run the sample night first", none of it sells AI. Guide in 943 ms. One nit beyond the black videos: the guide says "Create a sample campaign" while the button says "Run the sample night".

## The TV as a player-facing screen

Staging a map is one click and half a second. Fog on → 514 ms; reveal → 436 ms; the party appears in the light. Three rounds from the HUD: 18 End Turn clicks, each on the server in about half a second. The projector's text at round 3 holds names and the 📱 chip and nothing else — no foe HP, no AC, no region names, no notes (`marcus_28_tv_round3_1080p.png`). Spine test passed, with the fog exception above.

What a room of five would notice: adjacent name plates overlap into "Merid…Pip U…Tomas Ironwright" (`marcus_31_tv_panel_1080p.png`); the letter tokens read fine from a chair. `?panel=1` adds a 300 px column with initiative, party HP bars, "foe" for monsters and the roll log in 17 px type. It's built for a phone (the footer says "Open this from your sheet's 🗺 Table link") and at 1080p from 2.5 m the names are borderline; I'd leave it off and let the phones carry it. A phone d20 reached the TV as a chip in 512 ms, and then the chip and the QR chip fought for the corner.

## Real dice at the table

Per monster turn with dice in hand: damage to a PC is click the number, type, Enter (3); a condition from the strip is expand-once, "+ cond", pick (2–3); End Turn is one click. **There is no End Turn hotkey**: Space, Enter, E, → and T do nothing; only N (notes) is bound (`components/dm/DmDock.tsx:109`). A typical bandit turn — roll, 7 to the fighter, cleric prone, end — is seven or eight clicks and roughly 15 s of screen on top of the dice, against zero on my mat. Latency isn't the problem; the mouse is. One key for End Turn would halve it.

## The sample night, as a veteran

One click → HUD in 353 ms, script readable at 3.4 s (`marcus_32_hud_sample_script.png`). Three timed scenes with read-aloud and DM notes, a cast rail with the NPCs' wants, a People tab with goblins, wolf and NPCs on cards (`marcus_34_hud_sample_people.png`). The NPC lines are better than most published one-shots — "The bells — you heard them too? Then I'm not mad." and "Wren can swim. Whatever's in that pond, she isn't drowned." — each with a voice and a secret. I'd run it for new players as written.

**The pregens are not playable.** All four have zero inventory, zero spells, zero features via the API and on the phone: the wizard shows slots 2/2 and no spells, the fighter's "pack is empty", nobody has a weapon or Second Wind (`marcus_36b_phone_pregen_wizard_full.png`, `marcus_37_phone_pregen_fighter_full.png`). `services/onboarding_service.py` builds them from scores, HP and AC only. New players would be back to pencil in a minute.

## Bugs

1. **Foe tokens visible under unrevealed fog on the projector.** Fog on, one region revealed, drag a monster into the dark, open `/table/<id>`. Expected hidden; actual drawn at full opacity. `frontend/src/components/table/MapCanvas.tsx` (tokens render after the fog `<rect>`).
2. **QR chip covers the last-roll chip.** Roll from a phone, look bottom-left. `marcus_30_tv_corner_crop.png`; `components/table/JoinQr.tsx` vs `index.css .ql-last-roll`.
3. **Sample pregens have no gear, spells or features.** `services/onboarding_service.py` `_PREGENS`.
4. **DM 3D board defaults to Hex on a square map.** `marcus_39_dm_board_grid_default.png`; `pages/BoardView.tsx:136`.
5. **Guide videos still black until played.** `marcus_06_guide_watch.png`; `pages/GuidePage.tsx:60`.
6. **No End Turn hotkey.** `components/dm/DmDock.tsx:109`.
7. **`GET /campaigns/{id}/characters` → 500 after delete**; `/table/{sid}` → 200 empty scene.
8. **Name plates overlap** for adjacent tokens. `marcus_31_tv_panel_1080p.png`.
9. **Combat strip collapsed by default** with combat running at 1440×900. `marcus_27_hud_round3.png`.
10. Guide says "Create a sample campaign"; the button says "Run the sample night".

## Scores (1–5)

- **Onboarding: 4.** Email, Enter, a tour about the table not the AI, a sample night one click away. The black videos cost it.
- **Table experience: 4.** Delete, QR, foes, grid, toast and conditions fixed and measured; the fog leak and the corner collision hold it off 5.
- **Player experience: 4.** Damage and conditions reach phone and TV in under a second; the projector shows exactly what players should see, except foes in the dark.
- **Prep: 3.** Map with grid and fog in two minutes now. Good sample runbook, empty sample characters.
- **Value: 4.** Everything I use is free and it got more trustworthy in a week.

**Would you use it for your next session?** *Yes* — the trust bugs I listed last time are fixed and measured. I'd keep foes out of the dark until the fog bug is fixed and run the flat 2D view on the TV.

**Would you pay?** $5 Hearth: *no* — I don't use text AI or packs. $12 Lantern: *no* — no generated art at my table. $25 Table: *no*. If the table layer ever moved behind $5, yes.

**The ONE thing:** hide tokens under unrevealed fog on the projector and give me one key for End Turn. Then the TV is a wet-erase mat that knows the rules and my mouse stays in the drawer.

## Verdict

Last time I said trust was the whole game. This week the campaign deletes, the code steps aside when the map goes up, foes land on the first click, the grid guesses itself, and a prone fighter lies down on both screens — I measured every one. What's left is one new leak (the ambush is visible on the TV), a corner where two chips fight, and a sample night whose script I'd run tonight with characters that can't cast or swing. Fix the fog, fill the pregens' packs, and I'd stop bringing the binder.
