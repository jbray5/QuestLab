# Jess — first-time DM, three weeks out, four friends, zero budget

Screenshots are in `personas/jess/` (filenames cited inline). Test account was justinray5@outlook.com, which already had campaigns, so two things differed from a real first visit: the new-DM tour didn't auto-launch (it only fires with zero campaigns) — I replayed it from the sidebar 🧭 Tour button — and "Create a sample campaign" refused because that account already has one, so I *viewed* the existing sample read-only and built my own campaign by hand ("Persona test — Jess"), which is what I'd have to do if the button failed me anyway. Everything I made was deleted at the end (see Bugs — that took three tries).

## 1. First five minutes

**Landing (01_landing_fold.png, 02_landing_full.png).** "Run the table you've been picturing." I understood: board on the TV, sheets on phones, dice you shake. The sign-in box says "no password, no verification" — I typed my email and was in. Good. Things I read and didn't get: "cockpit", "SRD 5.2.1 content under CC-BY 4.0", "AI prep for patrons" (patrons of what?). The "Free, forever, for the table" line is the one that kept me reading.

**Guide (03_guide_top.png, 05_guide_watch.png).** "What you need" is three bullets — laptop, players' phones, TV optional. That is literally the question I posted on Reddit and got forty answers to, so this page won me for a minute. Then it lost me:
- Step 1 says "Sign in. Continue with Discord (or Patreon)." The page I just came from had an email box. I assumed I'd signed in the wrong way.
- Words I had to guess: **HUD**, **arc**, **SRD catalog**, **pregens**, **runbook**, **session brief**, **standees**, **XP meter**, and later "the Forge". I know "initiative" from playing. I do not know what an arc is.
- Nothing in the guide is about *DMing*. It's about which buttons make the app go. My actual questions ("what do I say first?", "how do I know if the goblins are too hard?", "what does prone do?") aren't here — except the last one, which turns out to be answered by the DM Screen button inside the app, and the guide never says so.

**Tour (11_tour_01.png … 11_tour_10.png).** Ten steps. Step 1 opens with "the mental model — campaign → arc → session." Three new words in the first sentence. Step 2, "The sidebar is your map," spotlights an **empty black column** (11_tour_02.png) — there's nothing in it. Steps 4–8 keep pointing at that same sidebar while describing Sessions, Player Characters, NPCs, Encounters — none of which exist in the sidebar until you've opened a campaign. Step 6 (NPCs with AI portraits) and step 7 ("Claude will pick monsters") are about paid features. Step 8: "a three-pane cockpit: party tracker, scene navigator, combat." Step 10 finally says "Press 🎲 Create a sample campaign… to get a ready-made night" — that should be step 1. I'd have hit Skip by step 5.

**Dashboard (09_dashboard.png).** A grid of campaign cards, and at the very bottom a grey "🎲 Create a sample campaign" next to a red "+ Manage Campaigns". The button I need is the un-highlighted one.

Would I keep going? Yes — because it's free and because the guide promised "a ready-made adventure, four pregens, a map and an encounter you can run tonight." That sentence is doing all the work.

## 2. The sample campaign

Pressed the button. Got a red toast bottom-right, "You already have the sample campaign," and was dumped on the Campaigns list with no pointer to which card it was (13_after_sample_click.png). On a fresh account the code creates it and then… also drops you on the Campaigns list rather than into it.

What's inside (20_sample_sessions.png, 21_sample_characters.png, 23_sample_hud.png): campaign "Your First Campaign (sample)"; one arc "The Millpond Bells" with a two-sentence hook (bells under the millpond, miller's daughter missing); one session, titled "Session 1: Session 1 — The Millpond Bells"; four level-1 pregens (Fighter, Wizard, Rogue, Cleric, "Player 1–4"); one map already staged; one encounter, "Ambush at the mill road (Low)," 4 goblins and a wolf, sitting in the HUD's ＋ Add → Load Encounter dropdown (25_sample_hud_add_panel.png).

**Could I run that tonight?** The *fight*, yes: HUD → ＋ Add → Load → 🎲 Roll Init, and the goblins have stat blocks under the People tab. The *night*, no. There is no story past the hook. The Cast panel says "No NPCs in this campaign yet." There's no opening narration on screen, no "what the goblins want," no "what happens after the fight." The buttons that would hold that — Brief, Script, Full Runbook — are for AI-written content I don't have. So the sample is a fight with a title, not a night. I'd still be running the Starter Set book beside the laptop.

What's missing: one page, in the HUD, that says "Read this aloud. Then this happens. Then press ＋ Add → Load." Plus a couple of NPCs with a line each. The pregens are fine but my friends want to make their own, and (good) the Characters page has "Players can create their own characters" checked by default.

## 3. Players joining (phone, 390×844)

- **Join page** (p1_01_join.png): "Who are you? Tap your character… or make a new one." One dotted card, "New character." Clear. A third phone later sees both finished characters plus New (p3_join_picker_with_two.png) — anyone can tap anyone's sheet, which is fine in a living room.
- **1 of 8 Name** (p1_02b_step1_next_empty.png): placeholder "Bram Oakhelm," "What the table calls you," level dropdown with "Ask your DM what level the table starts at. Most start at 1 or 3." Nice. Next is greyed until both filled — no message, but obvious enough.
- **2 Species:** fine.
- **3 Class** (p1_05_class.png): twelve cards reading "d8 · WIS · saves WIS, CHA · caster." To my two never-played friends that's noise. One plain line per class ("Cleric: heals and fights") is what they'd need.
- **4 Background** (p2_06c_next_without_abil.png): **STALL.** Picked Soldier, tapped Next, nothing. The reason — you must pick "+2 and +1" ability chips — is below the fold, under the sticky Next bar. No message.
- **5 Abilities** (p1_07b_scores_array.png): **TRAP.** "Standard array" fills 15,14,13,12,10,8 straight down STR→CHA for everyone. The hint says "Wizard likes INT," but the wizard got STR 15 / INT 14, and the Review page (p1_10_review.png) showed "Wizard · STR 15" without a peep. A first-timer will never catch that. Point buy starts at all 8s with "0 of 27 points spent" (p2_07b_pointbuy.png) — standard, but a lot for a newbie.
- **6 Skills & gear** (p1_09_spells.png — the file is misnamed, it's the skills step; p2_09_spells_for_fighter.png): **THE STALL.** Text: "Pick 2 from the Wizard list; Sage already gives Arcana and History." Both of my test players tapped exactly the two skills the sentence names. They're already granted, so nothing registers, the Next button stays dead, and there is no "0 of 2 picked" counter and no message. The Human fighter also needs an origin feat ("Versatile — your origin feat") and nothing says it's required. Both characters got stuck on this screen until I worked out why. Contrast the very next step:
- **7 Spells** (p1_09b_spells_picked.png): "Cantrips — 0 of 3", "Prepared spells — 4 of 4," extra taps ignored. This is how step 6 should behave. But 45 spell names with zero descriptions — a first-timer picks by name vibes. Fighters get this step too (empty).
- **8 Review** (p1_10_review.png): clear. "How you look (optional — the Forge paints from this)" — what's the Forge?
- **Sheet** (p1_11_sheet_top.png): HP/AC/Speed/Init tiles, Damage/Heal, saving throws, a round dice button. Good. Same phone later → straight to the sheet (remembered). I never found the board on the phone, though the guide says "the board also lives on phones."

## 4. Running the fight (HUD at 1366×768)

- **Empty HUD** (39_my_hud_empty.png) has the two best sentences in the app: "No combat yet — ＋ Add loads an encounter or one foe; 🎲 Roll Init sets the order." and "No characters found. Add characters or set attending PCs on the session." That's the tone the whole thing needs.
- When my players finished their characters, they appeared in the HUD party on their own (40_hud_after_players_joined.png). I didn't have to do anything. Great.
- **Stage the map:** Maps tab → click the tile → the HUD flips to Live. But the live board is a strip about 40 px tall (61_hud_map_staged.png, 67_hud_live_tokens.png). I could see a sliver of trees. Focus/Unfocus didn't change it. On a laptop this is the biggest problem in the room: the thing I staged is the thing I can't see.
- **＋ Add** (62_add_panel_empty_campaign.png): with no encounter in my campaign there's no Load dropdown, just Name / HP 10 / AC 10 / Init 0. I had to *know* a goblin is 7 HP, AC 15. No monster search here. The proper path (Sessions → arc → 💀 Encounters → "+ New Encounter", 51_encounters_via_arc.png) is where the SRD catalog lives; in my run pressing "+ New Encounter" didn't visibly open anything — unverified whether that's the app or my automation.
- **Roll Init** (65_hud_after_roll_init.png): rolled for everyone, sorted, ▶ on the first. One button. This is what I wanted.
- **Damage:** − on the party card → phone read 5/8 within a second (68_phone_after_damage.png). **Condition:** + cond → Prone → HUD chip "Prone ✕," phone shows a red CONDITIONS Prone banner (70_phone_after_prone.png), and the token lies flat on the TV (76_tv_3d_fight.png).
- **Whose turn:** the phone shows a huge gold "IT'S YOUR TURN! ROUND 1" when it's yours (70_phone_after_prone.png) and nothing at all when it isn't (71_phone_end_turn_1.png). It doesn't say who is up or "you're next," so my players will still ask me.
- **End Turn** moves the ▶ (71_hud_end_turn_1.png). Then — nothing. When it's the goblin's turn the app is silent: hand-added foes have no stat block, no "+4 to hit, 1d6+2," no "roll a d20, beat their AC." The DM Screen (73_dm_screen.png: "Your Turn: move up to your speed, take ONE Action…") is genuinely the reference I need, but nothing on the HUD pointed me to it.
- **TV:** "📱 QR → projector" puts a huge "Scan to join the party" on the table view (75_tv_3d_with_qr.png). One button, worked first time. The 3D board (76) showed only my two PCs — "+ Foes (combat)" never put my goblins on it. A phone d20 landed on the TV as a faint "19" (79_tv_after_roll.png; phone said "19 — it landed on the table," 78_phone_rolled.png). The 2D view (81_table_2d.png) is clearer for tokens and HP bars.
- **N** opens the notes dock (72_hud_notes_dock.png). Fine.

What I had to already know: goblin stats, what "Init" is, that prone gives attackers advantage, attack roll vs AC, what an arc is, that "+ Foes" won't place foes I typed by hand, and how to make the board bigger (still don't).

## 5. Bugs (repro + screenshots)

1. **Deleting a campaign with an active combat returns 500.** New campaign → arc → session → HUD → ＋ Add a foe → 🎲 Roll Init → `DELETE /api/campaigns/{id}` → 500 Internal Server Error, twice. Succeeds only after `DELETE /api/sessions/{id}/combat`. A DM who ran one fight and hits the red Delete on /campaigns will get an error.
2. **Tour spotlight is empty / stale.** Step 2 highlights a blank black column (11_tour_02.png). Steps 4–8 describe campaign nav that doesn't exist yet. Steps 9–10 scroll the page and the sidebar leaves the viewport (11_tour_09.png).
3. **Campaign sub-nav vanishes on reload / direct link.** Open `/campaigns/{id}/sessions` by URL: sidebar shows only Dashboard / Campaigns / Compendium, breadcrumb "Dashboard / Sessions" (50_sessions_direct_url_sidebar.png); open the same page via the card and Sessions/Encounters/Characters/Battle Maps appear (51_encounters_via_arc.png). The guide's own "Something broke? Reload the page" makes the nav disappear.
4. **"Create a sample campaign" when one exists:** red toast "You already have the sample campaign." and lands on /campaigns (13_after_sample_click.png). It should just open it. On success it also navigates to the list, not into the sample.
5. **`/campaigns/{id}/encounters` → 404** "Return to the keep" (44_encounters_page.png); encounters actually live at `/adventures/{id}/encounters`.
6. **Sample session title doubled:** "Session 1: Session 1 — The Millpond Bells" (20_sample_sessions.png).
7. **Guide step 1 contradicts sign-in** ("Continue with Discord (or Patreon)" vs. the email box, 05_guide_watch.png vs 01_landing_fold.png).
8. **Creator: dead Next buttons with no reason.** Background bonus chips hidden below the sticky footer (p2_06c_next_without_abil.png); Skills step lets you tap already-granted skills, has no picked-counter, and the origin feat isn't announced as required (p1_09_spells.png, p2_09_spells_for_fighter.png).
9. **Standard array ignores class** (p1_07b_scores_array.png): wizard ends up STR 15, and Review doesn't flag it (p1_10_review.png).
10. **Hand-added foes never reach the board** via "+ Foes (combat)" (67_hud_live_tokens.png, 76_tv_3d_fight.png show only N and T).
11. **HUD live board ~40 px tall at 1366×768** (61_hud_map_staged.png).
12. **Uploaded map is "gridless"** (38_maps_after_upload.png) though the guide says "The grid is set from the image."

## 6. Scores (1–5)

- Onboarding: **2** — the guide's "What you need" is perfect; everything after it speaks in words I don't have, and the tour highlights an empty box.
- Table experience: **3** — Roll Init, HP-to-phone, Prone-to-phone, QR-on-TV all worked first try; the board is a sliver and nobody tells me what to do on the goblin's turn.
- Player experience: **3** — the sheet and dice are great; both of my players got stuck on the same Skills screen and one built a strong-man wizard by accident.
- Prep: **2** — the sample is a fight, not a night; my own campaign needed me to know monster stats.
- Value: **4** — it's free and the live bits are real.

**Would you use it for your first session?** Maybe. I'd use it for the phones, the QR, and the HP/turn sync, and run the actual story from the Starter Set book next to the laptop.

**Would you pay once hooked?** $5 — maybe, if it means NPCs and a session brief I can read aloud, because that's the thing I'm missing. $12 — no, art isn't my problem. $25 — no.

**The ONE thing that would make it feel safe for a first-timer:** the sample campaign opening straight into a "Run tonight" page in the HUD — read-this-aloud text, three beats, and the exact buttons to press for the fight — instead of dropping me on a list of cards and a cockpit with forty buttons.

## 7. Verdict

Once my friends' phones were synced and I pressed Roll Init and the first one lit up gold, I believed it — that part is better than anything I've seen at other people's tables. But the app keeps assuming I already know what an arc is, what a goblin's AC is, and why the Next button is dead, and I don't; the sample gave me a fight when what I needed was a night.
