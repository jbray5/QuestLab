# Persona test, run 2 — Jess Alvarado (brand-new DM, first game for three friends next week)

Tested 2026-09-05, 20:51–21:16 local, on a true first-run account (`persona2-jess@questlab.test`, zero campaigns). Headless Chrome: laptop 1366×768, friends' phones 390×844 @2x (one browser context each), projector 1280×720. I signed in through the email box, took the tour, pressed 🎲 Run the sample night, set a join code, had a Wizard, a Cleric and a Rogue built on phones, ran the ambush from the HUD with a phone and the projector open, wrote notes, pasted URLs into a fresh tab, made one campaign of my own and spent one AI generation on a brief (1 of 3 text, 0 images, 0 packs). Both campaigns deleted from the red Delete at the end. Screenshots are `jess_NN_*.png`.

## Since run 1

Last time: onboarding 2, the tour spotlit an empty box, the sample was a fight not a night, Next was dead with no reason, my wizard got STR 15. My ONE thing was a "Run tonight" page with read-aloud text and the exact buttons.

**Fixed.** The sample lands in the HUD with the 🎬 Script drawer open on "The miller's plea" — read-aloud in a gold box, DM notes, three scenes with minutes (`jess_05_hud_landing_1366.png`, `jess_06_script_scene1..3.png`). Two NPCs with lines I can actually say. The tour is eight steps; step 2 spotlights the real sample button (`jess_03_tour_02.png`). The creator says why Next is dead at every step ("Pick 3 from the Wizard list — 0 of 3 picked… Human adds one more", "Humans pick an Origin feat", `jess_19_phone_wiz_s6_skills_empty.png`), and background skills are greyed. Red Delete removed a campaign with a running combat in 3.5 s, no 500 (`jess_71_campaigns_after_delete.png`). Pasted `/campaigns/<id>/sessions` shows the campaign sidebar (`jess_50_fresh_tab_sessions.png`); `/campaigns/<id>/encounters` resolves (`jess_51_campaign_encounters_route.png`). Session title no longer doubled. Guide sign-in copy matches the email box. Foes land on the board first time. Prone reached a phone in 774 ms.

**Still bites.** The strong-man wizard: my friend picked Wizard, Sage, +2 INT, and never touched the already-lit "Standard array" chip — she got STR 15 / INT 14 (`jess_18_phone_wiz_s5_untapped.png`), Review blessed it (`jess_21_phone_wiz_s8_review.png`), her sheet says Spell attack +4, DC 12. The Cleric came out STR 15 / WIS 12 the same way; re-tapping the chip fixes both. The goblin's turn is still silent: expand the collapsed combat strip, scroll a carousel that shows two and a half of twelve cards, press 📖, and only then "Scimitar. +4 to hit, 1d6+2" (`jess_36_hud_goblin_stat_block.png`). HP taps drop: three in one go took 1 HP, three at 350 ms took 2. Phones say nothing when it isn't your turn. Pregens have no gear, spells or features (API 0/0/0); Lira has two spell slots and nothing to cast (`jess_11b_phone_wizard_pregen_mid.png`).

**Regressed / new.** My three friends built characters through the join link and **did not appear in the HUD party** — the sample session's attending list is the four pregens. In run 1 (hand-made campaign, no attending list) they appeared by themselves. Their tokens aren't on the board either: "Your token isn't on the map yet — ask your DM to place the party" (`jess_31_phone_remote_window_before.png`).

## First five minutes

`/welcome` 1.1 s; email, Enter, dashboard 2.5 s (`jess_01_welcome_1366.png`). Tour auto-launched. Step 1 "Ninety seconds… None of it needs AI" — good. Step 3 spotlights the sidebar and describes Sessions/Characters/Battle Maps/NPCs that aren't in it yet (`jess_03_tour_03.png`). Step 5 (join link) has no spotlight. Words I still guessed: arc, HUD, pregens, runbook. Dashboard: the sample button is still the grey one, the red one still "+ Manage Campaigns" (`jess_04_dashboard_after_tour.png`). Sample click → HUD 416 ms. Sign-in to goblins on the projector: 29.7 s at script pace, 7 clicks (scene tab, ＋ Add, pick encounter, ⚔️ Load, 🎲 Roll Init, 🎮 Live, + Foes).

## The new first run

Could I run the three scenes from the drawer right now? Yes. Scene 1 is a conversation with lines; scene 2 says "run 'Ambush at the mill road'" and gives a Perception DC; scene 3 a DC and a hook for next time. That's the page I asked for. Two gaps: the drawer covers the map and party, so I toggle it constantly; and the script never says *how* to load the encounter — ＋ Add → "Load Encounter…" → ⚔️ Load is three clicks I found by poking (`jess_07_hud_add_panel.png`). After Roll Init the projector still showed only the pregens (`jess_10_projector_1280.png`) until 🎮 Live → + Foes (`jess_35_projector_goblins_1280.png`).

## Friends make characters

Join code: typed MILL1 on Characters, Enter, saved (`jess_12b_dm_characters_code_set.png`); the page shows the code but no link to copy. Phones: "This table asks for a join code. Your DM has it." (`jess_13_phone_wiz_join_code.png`); wrong code → "That code didn't match" (`jess_13b_phone_wiz_wrong_code.png`); right code → roster with New character first (`jess_14_phone_wiz_roster.png`). Builds: 8 steps, sheet in 300–450 ms. Class cards still read "d6 · INT · saves INT, WIS · caster" (`jess_16_phone_wiz_s3_class.png`); my friends need "Wizard: fragile, big spells." Spells are 45 names with no text (`jess_20_phone_wiz_s7_spells.png`). Starting gear is a card with the items listed — good. The Skills hint is the best copy in the app. The array trap is the one thing that will put a bad character at my table.

## Running the sample fight

HUD with seven PCs after I fixed attending: `jess_32_hud_fight_state_1366.png`. Live-tab board 736×278 px at 1366×768 — a third of the screen, up from run 1's sliver; the projector is still where I look. Roll Init: one button, twelve in order. Damage: HUD − → phone 7/8 in 1.3 s (`jess_37_phone_wiz_after_damage.png`). Prone: chip on the HUD, red CONDITIONS banner on the phone, survives End Turn. The phone shows gold "IT'S YOUR TURN! ROUND 1" on your turn (`jess_42_phone_wiz_turn_banner.png`) and nothing otherwise (`jess_43_phone_wiz_not_his_turn.png`). Killing a goblin from its row: seven taps on −. N opens notes; "saved ✓" and the API has the text (`jess_45_hud_notes_dock.png`). DM Screen covers prone, not "attack roll".

## After the night

I'd write "Wren rescued, Goblin 1 dead, owe Tansy a sling stone" in the notes dock; it saves to the session. There is no log beyond that — no roll history for me, no recap. Fresh-tab URLs work. My own campaign's brief (31 s) is genuinely for a beginner: a cold open to read aloud, "danger dial: cosy-spooky, not lethal… if a PC drops they wash up coughing", a one-index-card fallback, beats tagged rp/reveal with a DM line each. That's the $5 thing.

## Bugs

1. **Standard array ignores class unless the chip is re-tapped.** /join/<id>/new → Wizard → Sage → Abilities, don't tap → STR 15 INT 14; Review silent. `frontend/src/pages/CharacterCreator.tsx`: the class card's onClick resets kit/skills/spells but not `scores`; `arrayForClass` runs only from the chip's onClick; default `scores` is 15/14/13/12/10/8 in STR order. `jess_18_phone_wiz_s5_untapped.png`.
2. **Join-link characters don't show in the sample HUD.** `attending_pc_ids` is the four pregens (`services/onboarding_service.py` `seed_starter`). Expected: new characters attend by default, or the HUD says "3 not attending — add".
3. **Rapid HP taps drop.** 3 taps in one tick → −1; 3 taps at 350 ms → −2 (API `hp_current`). Party card − in `SessionHud.tsx`.
4. **Pregens have no gear, spells or features.** `/characters/{id}/inventory|spells|features` all `[]`; `_PREGENS` sets scores/HP/AC only. `jess_11b_phone_wizard_pregen_mid.png`.
5. **Loading an encounter puts foes in initiative, not on the board** until 🎮 Live → + Foes. `jess_10_projector_1280.png` vs `jess_35_projector_goblins_1280.png`.
6. **Guide names a button that doesn't exist:** "🎲 Create a sample campaign" vs "🎲 Run the sample night". `frontend/src/pages/GuidePage.tsx` line 75.
7. **Stat block reads "Passive_perception 9 ft."** `jess_36_hud_goblin_stat_block.png`.
8. **Tour step 3 describes nav that isn't there yet; step 5 has no target.** `frontend/src/components/tour/tour-steps.ts`. `jess_03_tour_03.png`.
9. **Initiative strip hides the foes at laptop width:** collapsed by default, then ~2.5 of 12 cards visible. `jess_32_hud_fight_state_1366.png`.
10. Minor: a fresh account sees 🛡 Admin in the sidebar; Characters shows the code but no copyable join link.

## Scores (1–5)

- Onboarding: **3** (was 2) — the sample is a night, the tour points at real things, Next says why; the wizard is still strong and the friends vanish from the HUD.
- Table experience: **3** — Roll Init, damage, Prone, End Turn reach phones inside 1.5 s; the goblin's turn is on me, and taps drop.
- Player experience: **3** — excellent hints; the array trap and no spell text hold it back.
- Prep: **3** (was 2) — the script drawer and the brief are what I needed; the pregens are half-built.
- Value: **4** — free, and the live bits are real.

*Would you use it for your next session?* **Yes** — the sample night with phones and projector, Starter Set closed; I'd set attending PCs and re-tap the array chip for everyone first.

*Would you pay?* $5 Hearth — **yes**, for the brief: the danger dial and fallback card are coaching I get nowhere else. $12 Lantern — no, art isn't my problem. $25 Table — no.

**The ONE thing:** the first character a friend builds comes out right and shows up — class-aware array on arrival (or a red "Wizard with STR 15?" on Review) and join-link characters attending the sample session automatically.

## Verdict

Last time the app assumed I knew what an arc was, what a goblin's AC was and why Next was dead. Two are fixed and the third is one 📖 away. The sample opens on a page I can read aloud, the projector shows the goblins, Prone lands on a phone before I finish saying it. What's left happens at my table, not in the demo: my friend's wizard will be a weightlifter, three friends won't be on the HUD, and I'll count taps to make sure damage stuck. Fix those and I run it next week without a book beside the laptop.
