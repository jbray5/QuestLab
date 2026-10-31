# Lena, run 3 (2026-10-31): the phone-only DM

Screenshots are in
`F:\Temp\claude\c--Users-justi-OneDrive-Projects-questlab\f74a91d3-757b-451c-8465-a81ce92909b9\scratchpad\personas3\lena\shots\`
(written below as `shots\<name>.png`). Everything ran in phone contexts: 390×844 for me and
430×932 for my player, `is_mobile` and `has_touch`, with taps. The local build was
`localhost:5173`. One caveat: headless Chrome can't raise a real on-screen keyboard. Where I
talk about the keyboard covering things, I measured where the field sits against where an
iPhone keyboard would be (its top edge is around y≈508 on an 844-tall screen), and I checked
the code. I didn't watch it happen.

## 1. Who I am
I'm Lena, 31, a nurse on rotating shifts. I run a fortnightly game for four friends at my
flat. I don't own a laptop, so I prep on the bus and run the night with my phone propped
against the DM screen. Plenty of "mobile" apps have turned out to be desktop pages squeezed
small, and I've been burned by them.

## 3. First five minutes
- The invite link worked, and the page knew my name: "You're invited to the QuestLab beta,
  Lena." But that line sits below about a screen and a half of marketing. The form starts
  at y≈1016 on an 844 screen (`shots\01_welcome.png`). On the bus I'd have thought the link
  was just an advert. The invite code was pre-filled, which was nice.
- Signing up took one tap after three fields, and it dropped me on the dashboard with the
  "Welcome to QuestLab, 0 of 5 done" checklist. The checklist is good: plain steps, and
  every one is a button.
- The tour popped up over the checklist straight away (`shots\03_dashboard.png`). It's a
  proper bottom card with big Skip and Next buttons. "STEP 1 / 8" is in letter-spaced
  capitals, which is the only shouting on the page.
- Making a campaign, then an arc, then a session took three short forms. All of them were
  full-width 44 px fields with no sideways scrolling. Good.

## 4a. Prep on the bus (the weak spot)
- The prep page says: "Start with a blank page and fill it in as you prep." I tapped
  **Start a blank runbook** and got a read-only "Scene 1" card with an empty Read aloud box
  (`shots\13_runbook_blank.png`). Nothing on it can be tapped: no edit button, no text box, no
  "add scene", no rename. I tapped the title and the box and nothing happened.
- I went looking for it in the menu. On the prep page the menu has no campaign section at
  all, so no Characters, no World & tools, no Notebook (`shots\15_menu_world_tools.png`).
  The campaign Notebook ("Pages") is a separate thing, and it doesn't list this runbook.
- I did find editing, inside the **HUD → Script** bottom sheet. It has a 26×26 pencil next to
  "(empty — click the pencil to add)" (`shots\18_script_sheet.png`). Tapping the pencil
  opens a textarea with Save and Cancel. It saved, and both my read-aloud and my scene notes
  stuck (`shots\22_script_after_edit.png`). It still can't rename "Scene 1" or add a
  Scene 2. "← Previous scene" is live even though there's only one scene.
- So I *can* write one scene's read-aloud from my phone, but only by opening the live HUD
  and finding a pencil the size of a fingernail. For someone who preps on the bus, that's
  the opposite of what I need.
- The DM notes box on prep is fine: big, autosaves, and says "Saved".

## 4b. Building the party on my phone
- **The guided wizard is genuinely phone-native.** It has a sticky Back/Next bar, 175 px
  option cards, chips for skills and abilities, and nothing smaller than 44 px. It explains
  every choice in plain words ("Pick 2: 0 of 2 picked. Acolyte already gives Insight and
  Religion").
- **Level 3 Cleric** (Maren Hollis, Dwarf, Life Domain, Acolyte). The subclass list
  appeared under the class once level 3 was set. The background +2/+1 picker greys out the
  ability that already has the +2. The review step showed the hit point maths line by line
  (27 HP, AC 16). Lovely (`shots\wiz_c1_07_review.png`).
  - The spells step let me press Next with **0 of 3 cantrips and 0 of 6 prepared spells**,
    with no warning (`shots\wiz_c1_06_spells.png`). Maren arrived at the table with no
    spells, and her phone said "Nothing on your sheet uses a bonus action yet. That's
    normal." For a cleric, that isn't normal.
- **Level 4 Fighter** (Tobin Reed, Goliath, Champion, Soldier), done at 430 px. The extra
  "Improvements · step 7 of 9" step works well. You tap Ability Score Improvement, choose
  "+2 to one" and see "Strength 17 → 19", and anything that would go over 20 is greyed
  out. Feats you don't qualify for are tucked behind a toggle
  (`shots\wiz_c2_06_improvements.png`). This is what I'd hoped for.
  - Only one subclass per class is offered (Life Domain, Champion) plus "From my book…".
    That's fine, and honest.
- **Enter an existing sheet** sits under the "…" button ("More for the party") and is the
  old desktop form, squeezed small (`shots\27_existing_filled.png`). It has two-up 156 px
  fields and says "Race" where the wizard says "Species". The labels aren't attached to the
  inputs, so tapping a label does nothing and a screen reader would hear nothing. The
  "Players can create their own characters" checkbox above it is 13×13. It did save
  ("Old Pell"), **but Old Pell never appeared in the HUD party or the fight.** The HUD
  says "Party · 2 PCs" even though the campaign has three.

## 4c. Running the night from my phone (the strong spot)
- The HUD stacks into a single column: tool row, party cards, Combat, then Maps/Script.
  The fight lives under the party, about a screen down (`shots\29_hud_with_party.png`).
- **Add** opens a bottom sheet called "Add to the fight". It's a manual form: name, side,
  HP, AC and initiative. It stays open so you can add several foes, which I liked. There's
  no monster search in it on the phone.
- **Start the fight** rolled initiative and sorted everyone. **End turn →** is a 232 px
  orange bar right under the round counter, with **Undo turn** beside it, which is exactly
  where my thumb is (`shots\32_fight_started.png`). The whose-turn card is lit, and the
  round counter went to Round 2 correctly. Undo stepped back one turn.
- **Damage and healing with the amount control.** It's a − / amount / + row, all 44 px.
  Typing 7 then tapping − took Drowned One A from 22 to 15. Tobin went −9 then +4, from
  36 to 27 to 31. Maren went −6 to 21. Every result was right, and Maren's phone showed
  21/27 within a couple of seconds (`shots\54_dm_after_damage.png`).
- **Conditions.** "+ Condition" opens an inline grid of big chips
  (`shots\59_condition_picker.png`). It's a popover, not a sheet, but the chips are a good
  size. Frightened went onto Maren's card and showed on her phone.
- **The menus are real bottom sheets.** More combat actions, Rests, Reference, Loot, Cast,
  Player display and the Dice tray all slid up from the bottom edge
  (`shots\46_menu_Rests.png`, `shots\46_menu_Loot.png` and the others). All of them closed
  when I tapped the dimmed area above. None got stuck.
- **The dice button** opens a "Private — only you see these rolls" tray. The dice buttons
  are 83×52. d20 rolled a 3 and showed it big (`shots\48_dice_rolled.png`).
- **The dice button never moves, and it sits on top of things.** It covers the Initiative
  "Reset" button on prep (`shots\12_prep.png`, where you can only read "Re") and the
  "Remove Tobin Reed" × on the HUD (`shots\32_fight_started.png`).
- Small "click" leftovers: the slot pips say "L1 slot — available (click to spend)", and
  the Script sheet says "click the pencil".

## 4d. Two phones at once
- Maren's link opened on the second phone with no account. I picked a help level, then
  "Take me to Maren". The Now screen is the best thing in the app
  (`shots\53_player_now.png`): "Your turn · Round 2", then 1 Move 30 ft, 2 Action (Mace,
  Roll), 3 Bonus action, with a bottom tab bar (Now, Character, Spells, Bag, Journal) of
  84×54 targets and zero tiny targets.
- It followed my DM phone live. HP dropped as I hit her, and Frightened appeared. When I
  pressed Undo turn, her phone switched to "Tobin Reed is up · You're next" with the turn
  order (`shots\58_player_after_undo.png`).
- The player can't end their own turn. Only I can. That's fine for my table, but it means
  "running a turn from both phones" really means they roll and I press End turn.
- I left "Played by" empty when I made Maren, so her phone said **"Welcome to the table,
  Not assigned yet."** and her header reads "Cleric 3 · Not assigned yet"
  (`shots\40_player_now.png`, `shots\53_player_now.png`).

## 4e. Feedback
- Menu → **Send feedback** is a bottom sheet with Loved it, Confusing, Broken and Idea, a
  textarea and "Send to Justin" (`shots\51_feedback_filled.png`). I sent a real note about
  the runbook and the share popover, and got "Thank you. It went straight to Justin"
  (`shots\52_feedback_sent.png`).
- The textarea sits at y 575–713 and Send at y 731, which is under where the keyboard goes.

## 5. Bugs (ranked by how much they'd hurt at a real table)

1. **You can't write the runbook on prep. You can only half-write it in the HUD.**
   Repro: Sessions → your session → Prep → "Start a blank runbook". You get a read-only
   Scene 1 with no edit, add-scene or rename controls. The only editor is HUD → Script →
   the 26×26 pencil ("click the pencil to add"), and even there you can't add a second
   scene or rename one.
   `shots\13_runbook_blank.png`, `shots\18_script_sheet.png`
2. **A character made with "Enter an existing sheet" doesn't join the party or the fight.**
   Repro: Characters → "…" → Enter an existing sheet → fill it in (Old Pell, Rogue 3) →
   Create. Then open the session HUD: it shows "Party · 2 PCs" and only the two wizard-made
   characters, and Start the fight leaves Old Pell out. The API lists three PCs.
   `shots\27_existing_filled.png`, `shots\29_hud_with_party.png`
3. **Typing in bottom sheets puts the field and its button where the phone keyboard sits.**
   This is a risk; I couldn't raise a real keyboard to watch it. Examples:
   - HUD → Add: Name and HP sit at y 671–785, with Add at 791 (`shots\30_hud_add_sheet.png`).
   - Script pencil: the textarea sits at y 489–584, with Save at 598
     (`shots\21_script_editing_0.png`).
   - Send feedback: the textarea sits at y 575–713, with Send at 731
     (`shots\51_feedback_filled.png`).

   On an iPhone the keyboard covers roughly y > 508. Nothing in `frontend/src` reads
   `visualViewport`, so these sheets won't move up for the keyboard.
4. **The Share player link popover opens off the bottom of the screen and won't go away.**
   Repro: Characters → "Share player link" on the first card. The popover opens below the
   fold (`shots\28_share_link.png`). Escape and tapping elsewhere don't close it, and it sits
   on top of the next card's Share player link button, so I couldn't share my second
   player's link.
5. **The wizard lets a spellcaster finish with no spells.** Repro: Add character →
   Cleric 3 → on Spells, pick nothing → Next → Create. There's no warning. The player's
   phone then shows no spells and no bonus action. `shots\wiz_c1_06_spells.png`
6. **"Not assigned yet" is used as the player's name.** Repro: create a character with
   "Who plays this character" left empty, then open their /play link. You get "Welcome to
   the table, Not assigned yet." and a header reading "Cleric 3 · Not assigned yet".
   `shots\40_player_now.png`
7. **The floating dice button covers right-edge controls**: Initiative "Reset" on prep and
   the "Remove Tobin Reed" × in the HUD tracker. `shots\12_prep.png`,
   `shots\32_fight_started.png`
8. **The invite greeting is below the fold.** Repro: open `/welcome?invite=…` on a phone.
   "You're invited… Lena" and the form start around y≈1016. `shots\01_welcome.png`
9. **Tiny targets and desktop copy:**
   - Targets: the "Players can create their own characters" checkbox is 13×13; "add one"
     is 51×21; "Add the party's characters" is 165×18; "the 15-minute guide" is 128×18;
     the Script pencils are 26×26; "More combat actions" is 32 px wide.
   - Copy: "click the pencil" and "click to spend" on a touch screen.
   - The existing-sheet form says "Race" and its inputs have no attached labels.
   - The session list says "Session 1" but the session page says "Session I".
   - The menu on the prep and HUD pages has no campaign links.
10. *(Probably only a test artifact.)* In a fresh browser that has my token but no
    `dm_email` saved, the menu says "Signed in as dm@questlab.local", from the dev
    `VITE_DM_EMAIL` fallback. Right after a real signup it showed my own email.

## 6. Scores (1–5)
| | Score | Why |
|---|---|---|
| Onboarding | 4 | The invite, signup and checklist are smooth. The greeting is hidden below a long landing page. |
| Table | 4 | The HUD combat is truly built for a phone: thumb-height End turn and Undo, real bottom sheets, correct HP maths. Points off for the dice button covering things and the keyboard risk. |
| Players | 4 | The Now screen is excellent and stays in sync live. Points off for "Not assigned yet" as a name and the spell-less cleric. |
| Prep | 2 | The runbook I'm told to fill in on prep can't be edited there. One scene, no add or rename, and editing hides behind a 26 px pencil in the HUD. |
| Looks | 4 | Calm, dark and readable, with nothing overflowing sideways anywhere I went. |
| Value | 3 | I'd run a fight off this tomorrow. I couldn't prep a night on it. |

- **Next session:** yes, for running the fights. I'd still prep in my notes app.
- **Would I pay $4/month:** maybe. Yes once I can write a whole runbook on the bus.
- **"I'd send this to another DM":** maybe. I'd send it to a DM who preps on paper and
  wants a phone tracker and player sheets. I wouldn't send it to a phone-only DM like me
  until prep works.

## 7. The ONE thing
Let me write the runbook on prep, on my phone. That means adding and renaming scenes, with
Read aloud and notes as real text boxes I tap into, which stay above the keyboard while I
type.

## 8. Verdict
This is the first "mobile" DM tool I've tried where running the table on my phone isn't a
squeezed desktop. The HUD fight, the bottom-sheet menus, the dice tray, the guided character
wizard and especially the player's Now screen were all built for a thumb, and my player's
phone kept up with every hit and condition I called. Prep is where it falls apart. I'm told
to fill in my runbook as I prep, then handed a page I can't type into, and the only way in
is a tiny pencil in the live HUD that can't add a second scene. Add the existing-sheet
character who silently misses the fight, and the share popover that won't close, and I'd
still need my notes app on the bus. Fix prep and I'd use it every other week.
