# Priya — fully-online DM, three years on Roll20 Plus, tried Foundry and bounced

Tested 2026-09-05 against https://quest-lab-tau.vercel.app in personal mode. Campaign "Persona test — Priya" (created, used, deleted). Screenshots are in `personas/priya/shots/`. Numbers below are things I measured, not vibes.

---

## 1. First five minutes

**What I understood in the first 60 seconds.** The landing page (01_welcome_top.png) says "A shared board on the TV. A living sheet on every phone. Dice you shake." The hero art is a 3D table with standees. The three bullets are about a QR code on a TV, damage landing on phones, and a DM cockpit. The line "In person, online, or both" is there, but it is one clause in a sentence, and everything visual is about a room with a TV in it. My group has no TV; we have four laptops and a Discord call. I had to scroll to the guide to find the paragraph that is actually for me: "🎧 Online — Share the projector link in your video call... Every player opens the same link on their own screen — it updates live." That paragraph is the pitch for my group and it is buried in section 6 of a 15-minute guide.

**What confused me.**
- The guide says "Sign in. Continue with Discord (or Patreon)" (02b_guide_watch.png) but the landing page gives me a bare email box, no password (01_welcome_top.png). I typed my email and I was in. Great — but which one is true? And "your email stays on this device" made me wonder whether my campaigns exist anywhere else if I switch laptops.
- The two walkthrough videos on /guide render as black rectangles until you press play (02_guide_top.png). I assumed they were broken.
- The dashboard header says "AI Campaign Planner" under the logo (03_dashboard_first.png); the landing page said "table tool". Small, but it is the first thing I read after signing in and it made me brace for an upsell.
- No tour fired on the dashboard for me, although there is a "Tour" button in the sidebar. I did not need one, but the landing page promised "minutes to the first roll" and the dashboard just shows campaign cards.

**Would I continue?** Yes, because the page loaded in 1.1 s, sign-in took one keystroke, and "no accounts for players" is stated in the FAQ in plain words. But the pitch is written for a DM with a living room, and I would have bounced from the landing page alone if a friend had not told me it works online.

**What's missing from the pitch for me.** The word "Discord" anywhere near the top. A screenshot of what a remote player's laptop shows. A sentence that says "your players open one link, no download, no account, on a phone or laptop." That sentence exists — in the FAQ at the bottom of the guide.

---

## 2. Setup friction log

| Step | Time | What happened |
|---|---|---|
| Landing → guide → sign in → dashboard | 2 min | Welcome 1.1 s, guide 0.9 s. Email box, Enter, done. |
| Create campaign (name / setting / tone) | 1 min | Three fields (06_new_campaign_form.png). Fine. Lands on an empty Sessions page that says "No arcs yet" (07_campaign_sessions_empty.png). |
| New arc → new session | 1 min | "Arc" is their word for an adventure; "Tier 1 · Lv 1–4" got attached automatically (09_sessions_after.png). The session row has HUD / PREP / PARTY / ADVANCE / DELETE. Clear enough. |
| Upload a map | 1 min | 1.1 MB PNG uploaded in ~2 s. **Snag:** the guide says "the grid is set from the image"; my map came in as *gridless* (12_battlemaps_library.png shows "2304×1536 · gridless") and I had to open the editor and type 96. |
| Paint fog regions | 2 min | Rectangle tool on the map editor worked first try; three named regions (13_fog_regions_drawn.png, 14_fog_saved.png). This is prep-time fog only — there is no brush or freehand reveal during play, and the Fog checkbox does not even appear on the HUD unless the map has regions. |
| Player 1 builds a Halfling Rogue on a phone via the join link | 3 min | Join page loads in ~1 s, "Who are you? — New character" (20_dev_join.png). 8-step wizard. **Snag:** on the Skills step the Next button was just greyed out with no message (24_dev_skills.png). The cause: I had picked Stealth and Sleight of Hand, which Criminal already grants, so only 2 of my 4 picks counted. A player on a phone would sit there tapping Next. |
| Player 2 builds a Human Life Cleric | 4 min | Same silent-disabled-Next problem twice more: Acolyte only offers INT/WIS/CHA bonuses (my +1 CON was ignored with no message), and Human requires an origin-feat pick before Next lights up. Spell picking is nice (25b_oren_spells_picked.png). Sheet is ready 0.2–0.5 s after "Create & open my sheet" (27_dev_sheet_top.png). |
| Open the table link as a remote player (not signed in) | 1 min | /table/{session} loaded in 0.9–1.1 s and showed "No map on the table" until I staged one. Sensible. |

Total prep for a first session, including two characters built by "players": about 15 minutes. That is faster than a Roll20 game setup by a wide margin, but only because the map came from my drive already made — there is no map library, which is fine and correctly stated.

---

## 3. Running the fight remotely

Setup: HUD in one signed-in window (1440×900), the unsigned `/table/{session}` page in a second window (my remote player's laptop), Devika's `/play/{pc}` sheet in a phone viewport, and later the `/table/{session}/3d` page. I patched `EventSource` in the player pages to timestamp every push.

**Sync latency I measured (DM click → push arrives on the remote page → the page's data refetch completes):**

| Action on the HUD | Push to remote 2D table | Data refreshed by |
|---|---|---|
| Stage a map (Maps tab) | 160 ms / 295 ms (two runs) | 372 / 548 ms |
| Fog ON | 167–362 ms | 413–471 ms |
| Reveal a region ("Entry hall") | 383 ms | 492 ms |
| + Party (drop PC tokens) | 386 ms | 540 ms |
| Roll Init | 150 ms | 261 ms |
| End Turn ×3 | 374–463 ms | 535–621 ms |
| End Turn → 3D table page | 164 ms | 287 ms |
| Damage −3 on Devika's card → **her phone** | 439 ms (`pc.combat.updated`) | — |
| Heal +1 → her phone | 463 ms | — |
| Prone on Devika's card → her phone | 574 ms; "CONDITIONS · Prone" banner appears | — |
| Prone on Devika's card → **remote 2D table** | **no push within 10 s**; token showed no condition | — |
| Phone d20 (tap 🎲, d20, Roll) → table | 282–358 ms (`table.roll`) | die tumbles on the 2D map |

So the headline claim — "damage you apply lands on their phones in a second" — is true, with room to spare, and with no refresh. The remote map, fog reveal, initiative and whose-turn all land under half a second. That is better than Roll20 on a good day and it is on a free tier.

**What worked / felt like magic.**
- Fog on the remote table is genuinely pretty: one lit room, the rest black, the active PC's token has a glow (42_table_turn_glow.png). The 3D view shows the same state plus a "Devika Thornfield's turn" caption (54_table_3d.png), loads in ~1 s, and ran at ~144 fps on my capture rig.
- The phone sheet got a big gold "IT'S YOUR TURN! Round 1" banner the instant End Turn reached Devika (44_phone_after_damage.png). My players lose track of initiative constantly on Roll20; this alone would fix that.
- A player's d20 thrown from the phone appears as a rendered die on everyone's table with "Devika Thornfield rolls d20" and the result card "D20 2" (50_table_dice_tumble.png). Latency 0.3 s.
- Staging a map plays a title card over the map on the remote table ("You have arrived — ink dungeon", 33_table_map_reveal_card.png). Cheap theatre, and I would use it.

**What broke / what felt like homework.**
- **Conditions do not reach the remote table.** Prone hit the phone in 0.57 s but the 2D table page never got a push (10 s wait) and its token showed nothing. The landing page says "conditions show up on the board". For my group the "board" is that link.
- **The die result vanishes in about three seconds** (51_table_dice_landed.png is empty 3.6 s after the roll). There is no roll log anywhere a player can look. Half of what my players do in Roll20 chat is scroll back to see what they rolled. On top of that, the phone's dice tray is a bare d4–d20 picker: the sheet's skill and save numbers are display-only, so "roll Perception" means reading +2 off the sheet and adding it in your head.
- **The remote table shows no HP, no initiative order, no names beyond token labels.** It is a TV projection, deliberately (the code comment says "No HP, initiative, or DM notes ever reach this component"). Fine for a TV, wrong for four laptops: my players want the initiative strip and party HP next to the map, the way every VTT does it. They would have to keep the table link and their phone sheet open at once.
- **Party tokens dropped in the dark.** "+ Party" put both PCs in a fogged corridor, not the revealed room (42_table_turn_glow.png); I had to move them.
- **Moving tokens from the HUD at 1440×900 is cramped.** The Live board is a ~170 px-tall letterbox strip with the map squeezed into the middle (40_hud_combat_started.png); my party tokens sat on its bottom edge and my drag did not register. There is a "Focus map" toggle, which I should have used, but a laptop DM with Discord on the other half of the screen will hit this immediately.
- **Fog is prep-only.** No "reveal what they can see" brush mid-fight. If they go somewhere I did not paint, the whole map is either black or revealed. Roll20 dynamic lighting is fiddly, but it exists.
- Adding foes is one-at-a-time by hand (＋ Add: Name / HP / AC / Init) unless you built an encounter in prep. I did not test the encounter builder.
- Pressing **N** for the notes dock, with the HUD's notes field apparently focused, typed a literal "n" into tonight's notes and saved it (53_hud_notes_dock.png). Minor.

**2D vs 3D for a laptop-bound remote player.** The 2D page is the one I would send: it fills the window, tokens are readable, fog is crisp, and it loaded in ~1 s. The 3D page is lovely but the camera is low, labels are small, and half the screen is grey table felt (54_table_3d.png); it reads as "the TV view" rather than "my window". On a phone the 2D table is a small letterboxed strip in the middle of black (56_table_phone.png) — usable for a glance, not for a fight.

---

## 4. Against Roll20 / Foundry / Owlbear

**Where QuestLab wins.**
- Zero player accounts, zero install, one link that loads in ~1 s. Roll20 makes my players log in and wait for a 40 MB page; Foundry needed me to host.
- Sync under half a second for everything I timed. Roll20 map loads mid-scene are the thing I complain about most, and this simply does not have that problem at this map size.
- The phone sheet is real: spells, slots, hit dice, exhaustion, currency, concentration, death saves, all self-service, and it stays in sync with my HUD. That is D&D Beyond + Beyond20 collapsed into one link with no extension.
- Initiative and whose-turn pushed to the players' own devices with a banner. Nothing in my current stack does that.
- Free for all of it. My Roll20 Plus bill is ~$7/month plus the marketplace maps I keep buying.

**Where it loses.**
- **No chat / roll log.** This is the dealbreaker-shaped hole. Roll20's chat is where rolls, whispers and "wait what did he say" live. Owlbear at least has a roll log.
- **No sheet-driven rolls.** Beyond20 lets a player click "Perception" and the modified roll lands in chat. Here they tap d20 and add. Rolls also do not show a modifier or a label from the sheet.
- **Fog is pre-painted regions only**, no live brush, no lighting. Owlbear's fog brush is simpler than Roll20's and better than this for improvisation.
- **The remote table hides everything except tokens and the map.** Roll20's initiative tracker and Owlbear's simple stat bubbles are visible to players. Conditions not syncing to the remote table makes this worse.
- **Measurement, rulers, AoE templates, drawing tools: none** that I found on the player side. Players cannot move their own tokens from the table link either (it is view-only), which means every "I move 30 ft" goes through me. Owlbear lets players move their own tokens; Roll20 too.
- **No map library or marketplace** (correctly stated as a policy). I bring my own maps; fine for me, a wall for a new DM.

**Dealbreakers for a fully-online group, ranked:** (1) players cannot move their own tokens or see a roll log; (2) no roll from the sheet's own numbers; (3) conditions/HP invisible on the shared link; (4) fog cannot be revealed freehand.

---

## 5. Bugs

1. **DELETE /api/campaigns/{id} returns 500 while a session in it has an active combat.** Repro: create campaign → adventure → session; on the HUD click Roll Init (combat starts); DELETE the campaign → `500 Internal Server Error`, campaign still present. `DELETE /api/sessions/{id}/combat` (204) then DELETE campaign → 204. A DM who deletes a campaign from the UI after a fight will hit this.
2. **Conditions set from the HUD party card do not push to the remote 2D table.** Repro: open `/table/{session}` unsigned with party tokens on the map; on the HUD click "+ cond" → Prone on a PC. Phone sheet receives `pc.combat.updated` in ~0.5 s and shows the banner (47_phone_condition.png); the table page receives no SSE event within 10 s and its token has no condition marker.
3. **Uploaded map arrives gridless** although the guide says the grid is set from the image. Repro: Battle Maps → Import maps → ink_dungeon.png (2304×1536, 96 px squares). Result: "gridless" (12_battlemaps_library.png). Must type the grid by hand (13_fog_regions_drawn.png).
4. **Character creator: Next is disabled with no explanation** on Skills (24_dev_skills.png), on Background when the ability bonus is not one the background allows, and on Skills for Human until an origin feat is chosen. Each needs one line of "pick 2 more" text.
5. **Guide contradicts the sign-in screen**: "Continue with Discord (or Patreon)" (02b_guide_watch.png) vs. the email box (01_welcome_top.png).
6. **Roll result on the shared table disappears after ~3 s with no log** (50_table_dice_tumble.png vs 51_table_dice_landed.png).
7. **Pressing N wrote "n" into the session notes** and autosaved it (53_hud_notes_dock.png). The notes field appears to hold focus after board interactions.
8. **Guide videos show black posters** until played (02_guide_top.png). Cosmetic.
9. **"+ Party" places PC tokens in fogged space** rather than a revealed region (42_table_turn_glow.png). Cosmetic-to-annoying.
10. **Unresolved, probably my rig:** my headless Chrome capture (both GPU/ANGLE and software GL) intermittently hung on screenshots of the 2D table and once of the phone sheet while the page's JS stayed responsive. I could not pin it on the app, but the fog mask is an `feGaussianBlur` over the full 2304×1536 image, which is a known slow path in Chrome; worth one check on a real low-end laptop with fog on.

Not a bug, but a policy note: the join page lists every character and player name to anyone holding the campaign link (second visit in 20_dev_join.png shows "Devika Thornfield — Marcus"), and any holder can open any sheet. Same trade-off as Owlbear; my group would accept it, a stranger-table would not.

---

## 6. Scores (1–5)

- **Onboarding: 3.** One-keystroke sign-in and a 15-minute setup, but the pitch is written for a living room and the creator strands players on a greyed-out Next.
- **Table experience: 3.** Sub-half-second sync and lovely fog/turn glow, dragged down by no roll log, no player-moved tokens, conditions not reaching the link, and a cramped Live pane at laptop size.
- **Player experience: 4.** The phone sheet is the best part of the product. Loses a point for dice that do not know the sheet's numbers.
- **Prep: 2.** Upload, grid, regions, foes-by-hand. Adequate, not a reason to switch, and I did not touch the AI prep because it is not what I am short of.
- **Value: 4.** Free for everything I would use. Honest pricing page; the paid tier is AI and art, which I do not need.

**Would you move your weekly game to it?** *Maybe.* I would run one session on it next to Discord tomorrow, because the sync and the phone sheets are real. I would not cancel Roll20 until my players can move their own tokens and see a roll log, because those two things are what my players actually touch.

**Would you pay $5 / $12 / $25 a month for the AI tier?** $5: not for AI — I would pay $5 to keep the table free and get a roll log. $12 for art: no. $25: no.

**The ONE thing that would make me switch:** turn the shared table link into a remote-player window — initiative order, party HP, a scrolling roll log, and let each player drag their own token — instead of a TV projection.

---

## 7. Verdict

It already does the part Roll20 makes me wait for — the map, fog and turn order arrive on my players' screens in under half a second, and their sheets live on a link with no accounts. But it was built for a room with a TV, and until the shared link shows my remote players what a table shows people sitting at one, I'm keeping the subscription I complain about.

---

*Test hygiene note for the owner: the shared scratchpad's `ids.json` was overwritten by a sibling persona run mid-test, so two of my characters were briefly created in "Persona test — Marcus"; I deleted those two (and only those two) via DELETE /characters/{id} and recreated them in my own campaign. No other campaign was modified. Two text generations budget: zero used. Image generation: none. "Persona test — Priya" was deleted at the end (GET now 404).*
