# QuestLab — persona test: Marcus (46, 15-year DM, fortnightly in-person table, TV flat on the table)

Tested 2026-09-05 on the live app, personal-mode sign-in, one throwaway campaign ("Persona test — Marcus") run through a whole loop: cold start, setup, two phone joins, a fight from the HUD with the TV and a phone open side by side, then deletion. Screenshots are in `personas/shots/` (filenames cited inline). Zero AI image generations; one AI text generation (a session brief).

---

## 1. First five minutes

**What I understood in 60 seconds.** The landing page (`01_landing_top.png`, `01b_landing_full.png`) says the right things in the right order for me: board on the TV, sheet on every phone, dice you shake, "free, forever, for the table", AI is an optional patron thing from $5. The "A night, start to finish" 1-2-3 at the bottom is exactly how I'd explain it to my players. The screenshot of the TV view with the ink map and standees told me more than the copy did. I knew what it was and what it cost before I scrolled once. That's rare.

**What confused me.**
- The sign-in box says "No password, no verification; your email stays on this device" — fine, I like that — but the guide's step 1 says "Sign in. Continue with Discord (or Patreon)" (`02b_guide_full.png`). Two different stories on two pages I read in the first three minutes. Which is it?
- After signing in (`03_signin_box.png` → `04_dashboard_first.png`) the sidebar calls the product "AI Campaign Planner". That is not what the landing page sold me, and for a bloke who doesn't want AI at his table it's an eyebrow-raiser. It also dumped me on a dashboard with six campaigns I don't own (this is the owner's account, so fair enough, but it made the "your first campaign" moment noisy).
- No tour fired on first sign-in. There's a "Tour" button in the sidebar; it's a decent 10-step walkthrough of the mental model (`08_tour_0.png`) but step 3, 6 and 7 keep steering me at AI ("The AI uses your tone…", "Claude will pick monsters…"). I skimmed those.
- The two "Watch it done" videos on the guide show black boxes until you press play (`02c_guide_watch.png`); I nearly assumed they were broken.

**Would I keep going?** Yes. The guide's "What you need: a laptop for you, players' phones, no app, no accounts, optional TV" is my exact setup, and the "In person" card says real dice are welcome. Enough to give it an evening.

---

## 2. Setup friction log

Scripted times are what the browser took; my human estimate in brackets is what I'd actually spend with a mouse and a cup of tea.

| Step | Time | What happened / snags |
|---|---|---|
| Sign in | 5 s | Email box, Enter, done. No verification. Landing → dashboard at `/`. |
| New campaign | ~7 s [1 min] | `10_new_campaign_form.png` — name, setting, tone. Three fields. Opens straight onto Sessions. Good. |
| Arc + session | 6 s [1 min] | "+ New arc" → "+ Session" (`16_session_created.png`). The arc/session split is one more concept than my binder has, but the page explains it in one line. |
| Upload a map | image visible in ~2 s [3 min incl. grid] | `18_map_uploading.png` → `19_map_uploaded.png`. Fast. **But** it lands "gridless" with an empty "Grid size" box (`19`, sidebar text "2304×1536 · gridless"). The walkthrough video says "the grid is set from the image"; it wasn't. I had to know my map is 96 px a square. Most DMs with a bought map pack don't know that number; the guide's tip ("most 4K packs are 140–160 px") is buried. Typed 96, drew one fog rectangle with the Rectangle tool, "Save map" gave no confirmation toast but it did save (`37_map_grid_set.png`, `38_map_fog_drawn.png`; verified via API: grid 96, one region). |
| Open the HUD, QR on the TV | 5 s | Sessions → HUD (`21_hud_fresh.png`). "QR → projector" one click (`22_hud_qr_on.png`). The TV shows a big clean code (`23_tv_qr.png`). This is the best moment of setup. |
| Player 1 (phone, fighter) | 19 s scripted [3–4 min for a real player] | `24_p0_join.png` "Who are you?" → New character → 8-step wizard (`25`–`32_p0_*.png`). Rules are enforced properly: Soldier already grants Athletics and Intimidation, so those chips are greyed and you pick three others. Snag: on the Skills & gear step the Next button just sits disabled with no "pick 2 more" counter when your picks don't count (`31_p0_next.png`); a player will stall there. The sheet it produces is right: Lv3 Champion, Tough feat, chain mail + shield → 34 HP, AC 18, passive 12 (`33_p0_sheet.png`). I checked the maths. |
| Player 2 (phone, cleric) | 21 s scripted [4–5 min] | Acolyte correctly refuses +1 CON (INT/WIS/CHA only), fixes Magic Initiate as the origin feat, limits clerics to 2 skills, and the spells step shows cantrips 3-of-3 and prepared 5-of-6 with the counts (`31b_p1_step7_done.png`). Dwarf Toughness added (24 HP at L3, CON +1). `33_p1_sheet.png`. |
| Roster on a second scan | — | `34_join_roster_after.png` — both characters listed with player names; tap to open. My simulated second phone initially got bounced straight to the first player's sheet because I reused the same browser profile — that's the "it remembers you" feature working, not a bug. |

Total honest setup for me: about 10 minutes for campaign, session, map with grid and fog, QR on the TV. Players add themselves. That beats my "couple of minutes with tokens" bar only if the grid number is known; otherwise it's a fiddle.

Oddity: partway through, two characters I never made appeared in my campaign — "Devika Thornfield" (player "Marcus") and "Brother Oren" (player "Lena") (`35_dm_characters.png`, `50_hud_with_party.png`). This is a shared test account with other testers on it, so I don't call it a bug, but note that with "Players can create their own characters" ticked, anyone with the campaign link can put a PC in your party. No join code, no DM approval.

---

## 3. Running the fight

**What worked, and some of it is genuinely good.**
- **Stage a map:** Maps tab → click the thumbnail; the TV cuts to a title card then the map (`51_hud_map_staged.png`, `80_tv_map_no_qr.png`).
- **Initiative for real dice:** the strip has an editable "init" box per combatant. I typed 22 for Tomas and the order re-sorted immediately (`86_hud_init_typed.png`, verified via API). "Roll Init" also rolls for everyone if you want it. This is the single feature that keeps my dice on the table.
- **Damage and conditions:** the party card's −/+ and "Click to edit HP" (typed 19) landed on the player's phone within ~2 s as "19/34", and Prone showed as a red banner across the top of their sheet (`83_hud_tomas_damaged.png`, `84_phone_tomas_damaged.png`). The combat strip shows a "Prone ✕" chip (`63_hud_damage_cond.png`).
- **End Turn:** moves the highlight; TV shows "⚔ Merideth Fell's turn" at the bottom (`80`).
- **Dice from the phone:** tray with d4–d100 and a modifier, "Shake your phone to roll" (`68_phone_dice_tray.png`). On the TV a chunky red d20 tumbles onto the map, lands, and a "D20 4" plaque appears; the phone says "4 — it landed on the table ✨" (`88_tv_dice_mid.png`, `89_tv_dice_landed.png`, `90_phone_after_roll.png`). This is the bit that made me grin.
- **Fog of war:** a "Fog" checkbox on the Live tab blacks the map out (`96_tv_fog_on.png`); tapping "🌫 Region 1" reveals the region I drew (`97_tv_fog_revealed.png`). The flat 2D projector view does it with a soft edge (`98_tv_2d_fog_revealed.png`). This is the fog I've wanted since I bought the TV.
- **Notes dock (N) and DM Screen:** both quick and unobtrusive (`72_hud_notes_dock.png`, `73_hud_dm_screen.png`). The DM Screen's 2024 rules tabs are what I keep in the binder.
- **Party cards** show AC, passive perception, spell slots, Channel Divinity, Second Wind pips (`50`). That is my whole sticky-note column gone.

**What broke or nearly broke me.**
- **The QR never gets out of the way.** I put the QR on the TV to let players scan, then staged the map, added foes, rolled initiative, dropped a Prone and threw a die — and the TV showed the QR code over a dimmed map the whole time (`53_tv_map_staged.png`, `61_tv_tokens.png`, `65_tv_prone.png`, `70_tv_dice_landed.png`). Nothing told me to turn it off; the "QR on table ✓" button in the party header is the toggle. Staging a map or starting combat should retire it.
- **HP clicks get dropped.** Five −1 HP clicks in quick succession registered as 1 (first run) and 2 (retest, ~120 ms apart); three clicks a second apart registered as 3. At a real table I'd hammer that button. Typed HP is reliable; I'd use that.
- **"+ Foes (combat)" did nothing the first time.** After Roll Init I hit + Party and + Foes (combat) on the Live tab; the party landed, the three bandits didn't (table had 4 tokens, all PCs — `59_hud_live_tokens.png`). A minute later the same button added all three (`81_hud_live_after_foes.png`).
- **Adding foes is by hand.** ＋ Add gives "Add from roster…" (encounters you prepped) or Name/HP/AC/Init boxes (`54_hud_add_dialog.png`). There is no "type wolf, get a wolf" on the HUD; the SRD picker lives in the Encounters page you prep beforehand. Mid-session improvisation means typing stat lines.
- **The Live board is small.** At 1600×900 the map is a letterboxed strip roughly 360×200 px in the middle of the HUD with pea-sized letter tokens (`59`, `60_hud_token_dragged.png`). "Focus map" helps, but dragging a token on the default view is fiddly and my first drag moved the wrong PC because the first draggable token happened to be someone else.
- **Grid mismatch on the 3D TV:** my map has squares; the 3D board defaults to a hex overlay (`80`, `74_dm_3d_board.png` shows Hex selected). The 2D view draws squares correctly.
- **Prone on the 3D TV** is the token turned 45° into a diamond (`85_tv_tomas_prone.png`, `89`). Subtle; the landing page says "prone tokens lie down". It's a rotate.

**The TV view at 1600×900, honestly.** The 3D view (`80_tv_map_no_qr.png`, `89_tv_dice_landed.png`) is handsome: the ink map on a grey table, coloured standees, whose-turn text, a physically rolling die. The names on the standees are ~10 px tall and unreadable from a chair, but the letters and colours carry. For a TV lying **flat** on the table, though, a perspective render is the wrong idea — every player looks at it from a different side. The flat 2D view (`94_tv_2d.png`, `98`) with big circle tokens and name plates is the one I'd actually use, and it's not the one the HUD's "Table" button points at. Both are worth putting on my table; the 2D one is the wet-erase mat replacement.

**The phone sheet, honestly.** It's a proper 2024 sheet (`33_p0_sheet.png`, `33b_p0_sheet_full.png`): HP/AC/speed/init at the top, damage/heal input, concentration, saves, skills with the right bonuses, features with use pips, hit dice, exhaustion, currency, and the dice FAB. The player never needs an account, a link is the key, and it remembers them. Downsides: every PC gets the same blue wizard emoji (fighter, cleric, rogue — all wizards; `34_join_roster_after.png`, `35`), and the phone is now a screen my players will stare at. That's the trade I was afraid of; at least the die goes onto the shared TV and not the phone.

**Magic:** die tumbling onto the TV; fog reveal; damage landing on the phone before I've finished saying the number; typing my players' real initiative rolls into the strip.
**Homework:** grid pixel numbers, prepping encounters to get stat blocks, remembering to turn the QR off, remembering Focus map.

---

## 4. Against my current setup (binder + wet-erase mat + TV with an image viewer)

**Where QuestLab wins**
- Fog of war on the TV that I control by tapping a region. My image viewer cannot do this; my mat can't either.
- Tokens that move without me leaning over the table, and HP/conditions the players can see on the board and their phones.
- One screen for party status, initiative and notes. My binder needs three tabs and a Post-it.
- No accounts, no app, no subscription for players. Real dice welcome (typed initiative, typed HP).
- Price: the whole table layer is free. That is inside my "$10–15, not beyond" line by definition.

**Where it loses**
- The laptop. It wants a DM laptop with the HUD on it and a browser tab on the TV. That is the "DM console" I was trying not to have on my table. The HUD is good enough to justify it, but it's still there.
- Phones. My players will now have their phones out all night, by design. I ran 15 years without that.
- Speed of improvisation. "Three wolves come out of the trees" is 20 seconds with my binder and three dry-erase marks; here it's three Name/HP/AC/Init entries or a pre-prepped encounter.
- Trust. Dropped HP clicks, a foe button that didn't fire the first time, and a campaign that wouldn't delete (below) are the sort of thing that makes me keep the binder open beside it for a few sessions.

**Dealbreakers?** None outright. The near-dealbreaker was the QR sitting over the map all fight; if I hadn't found the toggle I'd have unplugged the TV and gone back to the mat.

---

## 5. Bugs

1. **DELETE campaign → 500 (and a partial cascade).** Repro: create campaign → arc → session → open HUD → stage a map, add foes, Roll Init (PUT combat state), generate a brief, PATCH table state → `DELETE /api/campaigns/{id}` → HTTP 500 "Internal Server Error". After the 500 the campaign's characters were gone but the campaign, adventure, session and map remained. Workaround that worked: `DELETE /sessions/{id}/combat` → `DELETE /sessions/{id}` → `DELETE /adventures/{id}` → then the campaign delete returns 204. Not screenshotted (API only); reproduced twice.
2. **Rapid −1 HP clicks are lost.** Party card −1 HP: 5 clicks at ~350 ms → HP dropped 1 (`63_hud_damage_cond.png`, Brother Oren 20/21); 5 clicks at ~120 ms → dropped 2 (API: 31 → 29); 3 clicks at 1 s → dropped 3. Looks like a last-write-wins on the whole HP value rather than a delta.
3. **"+ Foes (combat)" on the HUD Live tab did nothing on first click** right after Roll Init (table tokens stayed at 4 PCs, `59_hud_live_tokens.png`); the same click a minute later added all 3 foes (`81_hud_live_after_foes.png`).
4. **QR overlay persists over staged map / combat / dice** (`53`, `61`, `65`, `70_tv_dice_landed.png`). Toggle exists ("QR on table ✓") but nothing auto-retires it or hints at it.
5. **Uploaded map is gridless with an empty grid field** (`19_map_uploaded.png`) despite the walkthrough saying the grid is set from the image; 3D TV then draws a hex overlay on a square map (`80_tv_map_no_qr.png`).
6. **Guide contradicts the sign-in page** ("Continue with Discord (or Patreon)" vs. passwordless email box) (`02b_guide_full.png`, `03_signin_box.png`).
7. **No first-run tour** on first sign-in (`04_dashboard_first.png`); sidebar label "AI Campaign Planner" contradicts the "free table tool" positioning.
8. **Character wizard: Next disabled with no counter** when background-granted skills eat your picks (`31_p0_next.png`).
9. **Guide videos show black posters** until played (`02c_guide_watch.png`).
10. **Same wizard emoji for every PC** regardless of class (`34_join_roster_after.png`, `35_dm_characters.png`).
11. **Map editor "Save map" gives no confirmation** (`38_map_fog_drawn.png` vs `39_map_saved.png` are identical); it did save.
12. **Prone renders as a 45° diamond on the 3D table** (`85_tv_tomas_prone.png`) — easy to miss from across a room.

Not bugs but worth knowing: the join page is public per campaign with no code, so anyone with the link can add a PC (two turned up in mine from other testers on this account); `/sessions/{id}/table` is a 404 (`93_table_page.png`) — my guess at a URL, the HUD's "Table" button is a button, ignore.

---

## 6. Scores (1–5)

- **Onboarding: 3.** Landing page and guide are clear; the dashboard, the missing tour, the "AI Campaign Planner" label and the Discord/email contradiction cost it.
- **Table experience: 4.** Fog, tokens, turn marker, the die on the TV — this is what I bought the TV for. Minus one for the QR-over-everything, the dropped HP clicks, the flaky foes button and the tiny Live board.
- **Player experience: 4.** Scan, build a real 2024 character in a few minutes, phone becomes the sheet, damage arrives before I finish the sentence, shake to roll onto the TV. Minus one for identical avatars, the wizard's silent disabled Next, and phones-out-all-night by design.
- **Prep: 3.** Campaign/arc/session/map/fog in ten minutes is fine. Grid pixel numbers and hand-typed foes are homework. The AI brief I generated (53 s, `personas/brief.json`) was honestly usable — a cold open, a danger dial, a one-page fallback with bandit stats and a "DC 12 Str save or prone in the current" — but I wrote the same thing on an index card in less time and it's mine.
- **Value: 4.** Everything I'd use is free. That is the right price for me.

**Would you run your next session on it?** *Maybe.* I'd run the next fight on it, with the binder open beside the laptop and the 2D view on the TV. If the HP clicks and the foes button behave for two sessions and the QR learns to step aside, it becomes yes.

**Would you pay $5 / $12 / $25 a month for the AI tier?** No, no, and no — not because $5 is unfair (it isn't) but because the thing I'd pay for is the table layer and that's free. If the table layer ever went behind $5 I'd pay it. I won't pay for generated NPCs and I don't want generated art at my table.

**The ONE thing that would make me switch:** make the HUD bulletproof at the table — every HP tap lands, foes land on the board the first time, and the QR retires itself the moment a map goes up. Trust is the whole game when five people are waiting on you.

---

## 7. Verdict

It's the first piece of TV-table software that assumed I have real dice, a binder and no interest in a subscription, and it put fog of war and a rolling d20 on my TV in an evening. It needs to stop dropping my clicks and get its QR code off my map before I'd trust it with a Friday night.
