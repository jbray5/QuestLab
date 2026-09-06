# Persona test — Tom (hybrid table, busy DM)

Tested 2026-09-05, 15:48–16:26 (38 min wall clock, ~3 over budget; two automation stalls cost most of that). One campaign created ("Persona test — Tom"), one Session Pack generated (the only AI spend; no brief, runbook or NPC generate used, no images). Campaign deleted at the end — but see Bugs #1, the delete button itself failed twice.

Screenshots are in `personas/shots/tom_*.png`.

---

## 1. First five minutes

The landing page speaks my language more than I expected. Three bullets — "Minutes to the first roll", "Nothing to refresh", "One screen to run from" — are the three things I complain about on forums, in that order. "In person, online, or both" is right there in the hero. The 3D board preview under the fold actually moves. And "Maps drawn by code in an ink style. No AI art." is a line I'd read out loud to the two illustrators at my table. (tom_01_welcome_top.png, tom_02_welcome_mid.png)

Sign-in is an email box, no password. It says the email "stays on this device". Fine for me, slightly alarming as a security story, but it got me in in five seconds and dropped me on a dashboard with a "Create a sample campaign" button. (tom_08_after_signin.png)

The guide is honest and short. It has a "Hybrid" section — "TV for the room, link for the remote players. Same board, same second-by-second sync." — which is the exact promise I need. It has a "Two screens, one cockpit" section that describes my setup (HUD on three-quarters of a monitor, Discord on the rest, "Pop out" notes). Nobody else's docs mention that a DM has Discord open.

Nits in the first five minutes:
- The guide's step 1 says "Sign in. Continue with Discord (or Patreon)." The landing page has no such thing; it's an email box. One of those is lying. (tom_05_guide_top.png vs tom_01)
- The two walkthrough videos are black rectangles with no poster frame. I nearly scrolled past them. (tom_06_guide_watch.png)
- The pricing tiers are in the guide, not on the landing page. "From $5 a month" on the landing; the thing I'd actually want (Session Packs) turns out to be $12. More on that below.

Verdict on the pitch: yes, it speaks to a hybrid, time-starved DM. It's the first VTT copy I've read that doesn't assume everybody's online.

## 2. The prep window

Timer started 15:49:21 with an empty account. I drove most of it by script, so read my minutes as "a fast human" not "Tom with a beer".

| Clock | Minute | What happened |
|---|---|---|
| 15:49:21 | 0:00 | Campaign, arc ("The Tithe Road"), session created. 4 s over the API; a human clicks through it in ~2 min. |
| 15:50–15:52 | 1–3 | Phone join flow for the remote player's fighter. First attempt died on step 6 of 8: Next was greyed out with no message because I'd picked 1 skill instead of 3 and no origin feat. Second attempt: 19 s of tapping, 8 steps, HP/AC/saves all worked out right (34 HP, AC 18 for a L3 Champion with Tough, chain mail + shield). (tom_10_join_phone.png, tom_14a_cc_skills_done.png, tom_15_sheet_phone.png) |
| 15:52–15:53 | 3–4 | Cleric and wizard via the same join API. The validator rejected my bad standard array ("must use exactly 15, 14, 13, 12, 10, 8") — good. The cleric picked the "Chain shirt, shield, mace" kit the app itself offered and got back "Not in the catalog yet: Chain Shirt, Shield" — bad (Bugs #3). |
| 15:54:38 | 5:17 | On the session's prep page. It has one textarea, "Tonight's premise", and two buttons: "🎒 Generate Session Pack" and "✨ Runbook only". Typed one paragraph. (tom_21_premise_typed.png) |
| 15:54:53 → 15:56:19 | 5:32 → 6:58 | **Session Pack: 86.1 seconds.** Spinner says "Building the…". Then the page fills in with a full runbook. |
| 15:56–15:58 | 7–9 | Read everything it made (below). No map came with it — "stage_map: null" on all three scenes, 0 battle maps in the campaign — so I uploaded one of the ink maps and set the grid: 2 s over the API, maybe a minute in the UI. |
| 15:58:47 | 9:26 | Done. |

Nine and a half minutes scripted. By hand, with typing and reading, I'd say 15–20 minutes to a runnable night. That fits my window. That's the headline.

### The Session Pack — what it made

My premise: a ferry-guild hires the party to find a missing toll-keeper (Hessa Cleft) on a drowned causeway; stilt-village folk are paying "the tithe" to something in the water; I asked for one real fight, one NPC worth talking to, a guild tie-in, three named L3 PCs, and "one player is remote, so keep it to one location."

It created, and wired into the HUD: 3 NPCs on the roster, 1 encounter ("The Tithe-Takers", labelled Moderate), a 3-scene runbook with read-aloud text, per-NPC dialog lines and secrets, a round-by-round encounter flow, loot, XP, closing hooks. The HUD's People tab, the ＋ Add "Load Encounter" dropdown, and the N-dock Script tab all had it without me touching anything. (tom_23_pack_done.png, tom_32_hud_people.png, tom_35_hud_dock_script.png)

**The good — I would run this, and I'd read these lines aloud:**

> Mira Fenwick: "You take from that bowl, you'd best put back double. It counts. It remembers."
> "I don't need you to be brave. I need you to be quiet, and gone by dark."

> Hessa's chalk on the tollhouse wall: "THE GUILD SOLD THE ROAD. ASK NEREA WHAT SHE PAID."
> Ledger margin, last entry: "No collections. By order. I do not recognize this order."

> Encounter terrain: "The causeway is a stone spine roughly 10 ft wide and 60 ft long; anything off it is deep, murky water (difficult, and a Medium creature is submerged to the chest, disadvantage on ranged attacks out of water). Boundary-posts provide half cover."

> DM notes: "If the party bunches on the high dry stone, the fight is winnable; if they scatter into the water, it gets deadly fast."

It used my actual party: "If Wren casts detect magic…", "Ansel's Turn Undead (Channel Divinity) can break the assault — reward it", "target Dagny or Ansel". It put DCs on things (DC 12 Insight, DC 14 Investigation under the floorboards). Odd Tam, the tithe-boy with a cast eye who "always looks", is a better NPC than I'd have written at 11pm. The closing hooks tie back to the guild exactly as asked. The voice notes ("Low, flat marsh-drawl; ends sentences like she's already tired of them") are the kind of thing I'd never write down and would use every time.

Would I show the NPC text to my table? The dialog, yes. It's not generic slop; it's specific to the premise, and the villagers sound like people.

**The bad — the things I'd have to catch before Saturday:**

1. **The villain doesn't exist.** "Nerea" is named in every scene, the closing hooks, two NPC secrets and the strongbox letter, and is described once as "an elemental/undead-tainted power in the fen". She is not on the NPC roster, has no description, no stat block, no note. If a player asks "who's Nerea?" I'm improvising. For a pack that "wires everything in", the antagonist is a hole.
2. **It used a monster from my other campaign.** The four "Tide-Taken" are a custom monster whose source reads "The Severance (Lacedon reskin)" — pulled from a different campaign on the same account — and they carry an AI-generated portrait and standee. If I'd put foes on the board with standees, AI art would have been on my TV in front of two illustrators without my knowing. Also: the runbook has them "attempt grapples" and "drag PCs into the water" for four rounds; their stat block has Claw (paralysis) and Icy Bite and no grapple at all. The tactics and the monster don't match.
3. **"Moderate" is optimistic.** Five CR 1 undead (1,000 XP) against three level-3 characters is between Moderate (675) and High (1,200) on the 2024 budget, and two of the three are melee. Ghoul paralysis plus two grapplers pulling people underwater is a TPK setup at a three-player table. I'd drop a Tide-Taken.
4. **No map.** The pitch and my premise both imply one; every scene says stage_map: null. I had to bring my own. The runbook doesn't even say "any road-with-water map will do".
5. **It ignored "one location".** Three scenes, three places (village, causeway, tollhouse). They're along one road, so I'll live, but it didn't hear the remote-player constraint at all; the word "remote" appears nowhere in the output.
6. Small stuff that reads like a first draft: the NPC is literally named "Hessa Cleft (absent)" on the roster; the encounter flow reads "Round 1: Round 1: …" on every line; the four loot items are all tagged "(catalog)" though "A kept knot" and "An old ferry-lantern (wickless)" are obviously not catalog items, and none of them were added to a loot table (loot_table_id: null).

Net: usable, genuinely good in places, but not "run it blind". Budget ten minutes to fix the villain, swap the monster, and trim the encounter. That still lands the night inside 30 minutes.

## 3. Game night, hybrid

Setup: HUD at 1280×800 (my Discord-split width), a "remote player" as an unauthenticated 1280×720 window on /table/{session}/3d, and the fighter's phone sheet at 390×844. Two rounds. (Full disclosure: my first two automated runs stalled — three heavy pages in one headless browser, and my harness wiped the DM identity from shared browser storage. Those were my bugs, not the app's; the numbers below are from clean runs.)

**Sync — this is the part that works.**
- Staged the map from the HUD Maps tab: the remote window went from "The table is being set…" to the map with a title card ("The Drowned Causeway") in 1.3 s. No refresh. (tom_71_tv_spread.png)
- Tokens appeared on the remote board 20 ms after the server had them.
- Loaded the pack's encounter from ＋ Add → "The Tithe-Takers (Moderate)" → Load: eight combatants in the strip, each with HP/AC from the stat block. Roll Init sorted them and started combat. (tom_72_hud_round2.png)
- Hit the fighter for 9 in the combat strip: **the phone showed 25/34 in 515 ms.** (tom_73_phone_after_strip.png, tom_74_hud_after_strip.png)
- End Turn: the HUD moved its ▶ marker; when it became the fighter's turn, the phone put up a full-width gold banner **"⚔ IT'S YOUR TURN! ROUND 1"** within a second. That is exactly what my remote player needs, and it's the thing Roll20 has never done for him. (tom_57_phone_dagny_turn.png)

**Where it fell short.**
- **Conditions don't reach the remote board or the phone.** "+ cond" in the strip opens a proper 14-condition menu, "Grappled ✕" appears as a chip in the HUD, the server has it on the combatant — and the remote 3D board shows nothing on the token (its condition list stayed empty) and the phone sheet has no "Grappled" anywhere. The landing page says "conditions show up on the board". In my run they showed up on my screen only. Caveat: my tokens were placed over the API; the HUD's own "+ Party" may link them differently. (tom_78_hud_condition.png vs tom_76_tv_condition.png)
- **Whose turn, on the TV.** I could not see a turn marker on the remote board after End Turn in my screenshots (tom_79_tv_after_endturn.png). I may have broken it myself by writing the combat state over the API before the HUD took over, so I'm flagging it, not calling it. The HUD and phone both showed the turn clearly.
- **Dice.** A d20 rolled through the player roll endpoint came back "15" but nothing landed on the remote board in my frames. The phone's shake-to-roll may use a different path; unverified.

**Where my eyes went.** The combat strip across the top of the HUD is the thing I watched; it has the ▶ marker, HP bars and the End Turn button in one row. At 1280 wide, though, only two or three of eight combatants are visible without horizontal scrolling, and the party column shows two of three PCs without vertical scrolling. The board preview under the Maps/Live/People tabs is about 60 px tall — a strip of map. So I'd look at: strip (top) → party card (left, scroll) → the TV on the wall for the board → Discord for the remote guy. That's still three places. Better than Roll20 (where it's five), not yet "one screen". The N-key notes dock with the runbook script is good and floats over everything; that's the one piece that did stay in one place. (tom_30_hud_default.png, tom_35_hud_dock_script.png)

**The remote player's experience, honestly:** he sees the same map I see, the same tokens moving, a title card when the scene changes, and his phone tells him when it's his turn and what his HP is. That's more than "mostly ignored". He doesn't see conditions and (maybe) doesn't see whose turn it is on the board itself. He still needs Discord for voice; the app doesn't pretend otherwise.

## 4. Against Roll20 Plus + Discord + a TV image viewer

**Wins**
- Prep from a paragraph to a loaded encounter, a cast with secrets, and a script in the HUD — 86 seconds plus a fix-up pass. Roll20 has nothing here; I'd be in a notebook and a monster book.
- Players build characters on their phones in 8 taps and the sheet is live all night. No accounts, no "did everyone claim their token".
- The remote player gets the board and his turn called. On Roll20 my remote guy gets a browser tab he stops looking at.
- The TV gets a real, moving, 3D board with title cards, not a JPEG in a viewer.
- The free tier is the whole table. Roll20 Plus is a monthly bill for the table itself.
- Dynamic lighting hell doesn't exist here; there's a "darkness" dial and fog regions.

**Losses**
- Conditions on the shared board (and phone) didn't work in my test. On Roll20, a status icon on a token is table stakes.
- No map comes with the pack, and no map library beyond what I upload. Roll20 has a marketplace; I'd bring my Czepeku folder to both.
- The HUD is crowded at Discord-split width; Roll20 is worse but at least it's one window.
- No shared dice log I could find on the remote view; the remote player's rolls are a phone-shake feature I couldn't verify.
- Custom-monster leakage across campaigns is the kind of thing that erodes trust in the "everything wired in" promise.
- Delete campaign is broken (Bugs #1). That's not a feature loss; it's a "what else is broken" flag.

**Dealbreakers?** None for the free table. For the paid prep: the pack lives in the $12 tier bundled with art I'd never turn on. That's the cost-creep pattern that made me quit two subscriptions.

**Against "winging it with the book":** the pack is better than my 11pm notes and worse than my Saturday-afternoon notes. Winging it costs me nothing and gives the remote guy nothing. This gives him a board and a turn banner. That alone is worth the $0.

## 5. Bugs

1. **DELETE /api/campaigns/{id} returns 500.** Repro: new campaign → arc → session → generate Session Pack → DELETE the campaign. 500 Internal Server Error, twice. Succeeded only after I deleted the session, adventure, encounter, NPCs and battle map individually. A DM who tries a pack then wants to throw the campaign away can't.
2. **Session Pack pulls custom monsters from other campaigns, with their AI art.** Repro: account with a custom monster in campaign A; generate a pack in campaign B whose premise fits it. The encounter roster referenced monster 35103640… ("Tide-Taken", source "The Severance (Lacedon reskin)") with image_url and figure_url set. No warning in the pack response (warnings: []).
3. **Join options offer a kit the builder can't apply.** GET /play/join/{id}/options lists Cleric kit "Chain shirt, shield, mace"; POST with that kit returns warnings: ["Not in the catalog yet… Chain Shirt, Shield"] yet computes AC 14 as if worn, and the sheet's inventory lacks the armor. Player sees AC 14 with nothing to explain it.
4. **Combat-strip conditions don't propagate to the board token or the player's phone.** Repro: HUD → strip row → "+ cond" → Grappled. HUD shows the chip; GET /sessions/{id}/table shows the PC token's conditions still []; the remote 3D board shows no marker; /play/{pc} shows no condition. (tom_78_hud_condition.png, tom_76_tv_condition.png, tom_77_phone_condition.png)
5. **Character creator, step 6 (Skills & gear): Next is silently disabled.** With fewer than 3 skills or no origin feat chosen, the Next button greys out with no message. My first run sat there. (tom_14a_cc_skills_done.png shows the completed state; the failed state had one skill selected and a dim Next.)
6. **Guide contradicts the landing page on sign-in.** Guide step 1: "Continue with Discord (or Patreon)"; landing: email box. (tom_05_guide_top.png, tom_01_welcome_top.png)
7. **Guide videos have no poster frame.** Two black boxes with a play control. (tom_06_guide_watch.png)
8. **Pack text defects.** NPC named "Hessa Cleft (absent)"; encounter flow lines start "Round 1: Round 1:"; loot items labelled "(catalog)" that aren't; loot not attached to any loot table; runbook XP (300+100) doesn't match the encounter's 1,000.
9. **The named antagonist is not created.** "Nerea" referenced in 3 scenes, 2 NPC secrets and the closing hooks; no NPC, no notes.
10. **HUD at 1280×800 hides the third PC and most of the initiative strip** without scrolling; the board preview is a 60 px sliver. (tom_30_hud_default.png, tom_72_hud_round2.png)
11. Unverified, flagging only: no visible turn marker on the remote 3D board after End Turn (tom_79_tv_after_endturn.png); no die landed on the remote board after a player roll via the API (tom_61_tv_dice_landed.png). Both may be my harness.

## 6. Scores

- **Onboarding: 4/5.** Email in, sample campaign offered, guide that mentions Discord-split and hybrid. Loses one for the guide/landing sign-in mismatch and the black video boxes.
- **Table experience (DM): 3/5.** Load-encounter, Roll Init, damage, End Turn all work and are fast. Crowded at my window width, conditions don't leave my screen, and I'm still looking at three places.
- **Player experience (remote + phone): 4/5.** Board follows live, title cards, HP in half a second, "IT'S YOUR TURN" banner. Loses one for conditions and the unverified board turn marker.
- **Prep: 3/5.** 86 seconds to a night I'd actually run — with the antagonist missing, a wrong monster, a hot difficulty and no map. Good bones, needs a fix-up pass every time.
- **Value: 3/5.** The table is free and that's real. The pack — the thing a busy DM wants — is behind the $12 art tier.

**Would you run Saturday on it?** Maybe — yes for the table (free, works, remote guy gets a board and his turn), not on the pack alone without ten minutes of fixing.

**Would I pay $5 / $12 / $25 for the AI tier?** $5, yes, tonight, if Session Packs were in it. $12, no — that tier is "everything plus art", and the art is the one thing I can't use at my table; I'd be paying for portraits to get a runbook. $25, no. The pack sits in the $12 Lantern tier and that's not fair to a prep-only DM: it's a text feature priced as an art feature. Roll20 Plus is about seven to ten bucks; a $5 pack tier beats it, a $12 one doesn't.

**The ONE thing that would make me switch:** Session Packs in the $5 tier (text only, no art), with a "what I invented" list at the top — antagonist, custom monsters, difficulty — so I can trust it inside a 30-minute window.

## 7. Verdict

The table is the real thing: my remote friend finally sees the board I see and his phone tells him it's his turn, and none of that costs me a dime. The prep is 80 percent of a night in 86 seconds, but it's priced with the art I'll never show my table and it forgot to create its own villain — fix the tier and I'm in.
