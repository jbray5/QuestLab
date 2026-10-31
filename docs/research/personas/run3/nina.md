# Persona test, run 3: Nina Castellanos (returning)

Tested Saturday 2026-10-31 against the local build (web :5173, API :8000). I used a phone (headless Chrome, 390×844 @2x, touch) for everything I'd do myself, and a 1280×800 laptop for my DM, Rowan (`persona3-ninasdm@questlab.test`), to start a fight on the HUD. Table: `Persona3 — Nina's table`, join code OTTER, session "First night". I built one character, Mercy Halloran, a level 1 Human Paladin with the Acolyte background. Screenshots are in `F:\Temp\claude\c--Users-justi-OneDrive-Projects-questlab\f74a91d3-757b-451c-8465-a81ce92909b9\scratchpad\personas3\nina\` as `nina_NN_*.png`, and that folder also holds the scripts.

## 1. Who I am

I'm 24 and a nurse on shifts. I've played twice at a friend's table and I've never owned the book. I want a Paladin because keeping people up is my day job. I do everything on my phone, and every word I don't know costs me a little confidence.

## 2. Since last time

**Better, and it shows:**
- **The build is honest now.** Last time "Standard array" gave my Paladin Charisma 8. This time it put 15 in Strength and 14 in Charisma by itself, and Acolyte's +2 made Charisma 16 (`nina_10`). The Review lists **"Spell slots 1st: 2"** (`nina_15`), and my Spells tab has two slot dots I can tap (`nina_19`). Both of last run's top bugs are fixed.
- Origin feats now show their description on the card ("Healer: Use a Healer's Kit to heal, and reroll 1s on healing dice"), so I don't need hover tooltips (`nina_11`).
- **I finally know what a bonus action is.** Journal → "How a turn works" says it in one line: "A bonus action only if something on your sheet gives you one. The Now screen shows yours." (`nina_21`)
- The emoji, the "DM EMAIL" box and "the forge paints from this" are all gone. The Review simply says "How you look (optional)".
- A tapped spell opens its full text: "You bless up to three creatures within range… adds 1d4" (`nina_26`).

**Worse:**
- **"YOUR TURN" no longer reaches my phone.** In September it filled my screen 667 ms after the DM ended the Wolf's turn. Today my phone said "No fight right now" for 40 seconds after Rowan pressed Start the fight, even though it was my turn (bug 1).
- **Lay on Hands is gone.** Last time it at least sat under Resources. Now the creator promises "A healing pool of 5 hit points per Paladin level", and after that it appears nowhere on my phone (bug 3).

## 3. First five minutes

- The join link opened in 1.4 s on "Who are you?" and asked for the code, even though the link my DM sent ended in `?code=OTTER` (`nina_01`). I typed OTTER and got one card: "New character · Build one here, about five minutes" (`nina_02`).
- Step 1 of 8 has a clear grey-Next reason: "Give your character a name." The level box says "Ask your DM what level the table starts at. Most start at 1 or 3." Good. Then it adds "Level 1: proficiency bonus +2". On the first screen of the whole thing, I don't know that word yet.
- After Create I land on a page that greets me by name: "Welcome to the table, Nina." It shows Mercy with a shield crest and asks "How much help would you like?" The choices are **Teach me** ("New to D&D, or new-ish. Plain words, and ideas for what to do on your turn"), Remind me and Just the numbers (`nina_16`). That's exactly the question I wanted someone to ask me. I picked Teach me.

## 4. Building my Paladin: words that lost me, rules that helped

**Words that lost me** (in order): "proficiency bonus" (step 1). "Medium · speed 30 ft" (species). "Hit die d10" on every class card. "Saving throws". "Weapon Mastery: use the mastery property (Cleave, Topple, Vex...)". "spell slots; cantrips cost nothing". "Long Rest" with a capital L. "Origin feat". On the Spells tab: "Concentration" and "Needs V, S, M". In my bag: "mastery: Sap" and "mastery: Slow". On my sheet: "DC 13" and "Passive Perception".

**Rules it helped me with:**
- Class cards say **"Best with Strength or Charisma"** in words. Tapping Paladin explains Lay on Hands as "A healing pool of 5 hit points per Paladin level, spent by touch". That's the line that told me I'd picked right (`nina_07`).
- The background step says "The background can only raise Intelligence, Wisdom, Charisma. A Paladin leans on Strength or Charisma." So I put +2 on Charisma without guessing (`nina_09`).
- Ability scores: "10 or 11 is +0, and every 2 points above adds +1". The first time anyone has explained a modifier to me.
- Skills: "Acolyte already gives Insight and Religion" are greyed out, and the counter tells me how many I have left.
- The Review shows its maths: "d10 at its most (10) + Constitution +1 = 11" and "Chain Mail 16 + shield 2 = 18" (`nina_15`).

**Where it still let me down:**
- **Spells are still bare names** in the creator: thirteen chips and no descriptions (`nina_13`). I chose Cure Wounds and Bless because I recognised the words. The text only exists later, on the sheet.
- The creator says "Prepared spells can be changed any time from the sheet." The sheet says "Prepared 2 · change after a long rest." Which one is true?
- The Review lists my feats as "Magic Initiate, Healer". Magic Initiate comes from Acolyte and gives "Two cantrips and one 1st-level spell", but nothing ever asked me to pick them, and none appear on my sheet.

## 5. Living with the phone companion

- **Now** (`nina_17`): "No fight right now. When the DM asks for a check, tap it below and roll; it shows on the TV." Six checks to tap, then Roll initiative and Open the table map. Calm and obvious.
- **Rolling with the table's dice:** tapping Perception opens a sheet that says "+2 is your Wisdom +0 plus +2 because you're trained in Perception." It has a Disadvantage / Normal / Advantage switch with one line of explanation (`nina_22`). I rolled 4 + 2 = 6 and it said "Tell the DM your total" (`nina_23`). Later, Persuasion 17 + 5 = 22 showed on Rowan's HUD as "Mercy Halloran rolled 22 (Persuasion…" **292 ms** after my tap (`nina_48`).
- **Rolling a real die:** the same sheet asks "Rolled a real d20?". I typed 14, tapped Use mine, and got "You rolled 14 +2 = 16" (`nina_24`, `nina_25`). Exactly how I'd play with my own dice.
- **Character** (`nina_18`): every number has a plain caption: AC 18 "How hard you are to hit", Speed "How far you move on a turn", "Your best ability: Charisma +3, Presence: persuading, lying, performing, leading". Took damage / Healed / Temp come with "Type the number the DM says, then tap." There are **no class features** on it: no Lay on Hands, nothing about being a Paladin besides the word.
- **Spells** (`nina_19`, `nina_27`): "Your spells hit with +5, and targets resist them with a save against 13." That's the first time "spell DC" has made sense to me. I cast Cure Wounds, the slot dot went dark, and it said "Cure Wounds cast with a 1st-level slot." The HUD's slot dots followed. But it didn't roll my 2d8+3 or ask who I healed. For a healer, that's where it should help most.
- **Bag** (`nina_20`): Shield, Chain Mail, Javelin and Longsword are equipped, plus "10 copper make a silver; 10 silver make a gold." I have 0 gold.
- **Journal** (`nina_21`, `nina_28`): there's a private notes box ("Your DM's screens don't show these"); my note survived a reload. "How a turn works" and "Rules people ask about" (advantage, critical hit, saving throw, reactions, cover, concentration) are the cheat sheet I wanted in September. There's also "Keep the screen on during the session".

## 6. The fight, from both sides

As Rowan on the laptop I added a Wolf and pressed **Start the fight**. The HUD put "Their turn" on Mercy, Round 1. I ran it twice; in the second run a listener on my phone confirmed the "your turn" message arrived.

| What Rowan did | What my phone did | Time |
|---|---|---|
| Start the fight (my turn first) | Kept saying "No fight right now". The "your turn" message arrived about 1 s after the click, but the screen ignored it | never in 40 s (`nina_33`, `nina_41`) |
| End turn → Wolf, End turn → me (round 2) | Nothing | never in 30 s each (`nina_34`, `nina_44`) |
| Gave Mercy **Frightened** | Jumped to "**Your turn** · Round 2", Move / Action / Bonus action, and "Frightened: Disadvantage on checks and attacks while you can see what scares you; you can't move closer to it." | 115 ms (`nina_35`) |
| 6 damage | 11/11 → **5 / 11** | 565 ms (`nina_36`) |
| End combat (first run) | Switched to "**The fight is on** · Round 2", Mercy 10 / Wolf 6, "Your reaction is ready". Wrong: the fight was over | right away (`nina_38`) |

The turn screen itself is the thing I asked for last time: "You can move, take one action and one bonus action, in any order" in three numbered boxes. But on it:
- Cure Wounds reads "**2d8+3 force**", as if my heal hurts someone.
- The Bonus action box offers **Divine Smite**, which I didn't prepare. The creator said "Paladin's Smite" comes at level 2.
- **Lay on Hands**, a bonus action in the 2024 rules and the reason I'm a Paladin, isn't there.
- Javelin appears twice with the same numbers.
- The Frightened box is the very last thing, under two tips, about three screens down on my phone. I'd never scroll to it mid-fight.

**After the fight:** yes, the condition stays. After End combat, and again after reloading the page, my Now screen still showed "Frightened" with its plain-words line, and HP stayed 5/11 (`nina_45`, `nina_46`). The HUD kept the Frightened chip too (`nina_47`). It isn't on my Character tab, only at the bottom of Now.

**Send feedback:** players don't have the button. My phone has no menu, and Journal doesn't mention feedback. As Rowan, I used Send feedback on the HUD (category "Broken") to report the turn notice, the "force" heal and the missing Lay on Hands. Reply: "Thank you. It went straight to Justin, with the page you were on. Every note gets read." (`nina_50`).
*Test note:* my first scripted attempt typed that text into the HUD's "Tonight's notes" box, which saves as you type. That was my script's mistake. I cleared the session notes through the API straight away.

## 7. Bugs (worst first)

1. **The phone doesn't follow the fight. Start the fight and End turn never reach the screen.**
   - Repro:
     1. Open a player's `/play/{key}` on a phone (Now tab).
     2. As the DM, add a foe and press Start the fight on the HUD.
     3. The phone stays on "No fight right now" (40 s observed) even when it's that player's turn. End turn also changes nothing.
     4. Any change to the character's record (such as adding a condition) suddenly shows "Your turn".
   - Screenshots: `nina_33`, `nina_34`, `nina_41`, `nina_44`, then `nina_35`.
   - Cause as far as I can see:
     - `frontend/src/pages/player/NowTab.tsx:47` chooses the fight or calm screen from `combat?.in_combat`.
     - The `pc.turn.changed` handler in `frontend/src/pages/player/PlayerApp.tsx:82-97` only patches `play-turn-state` and never refreshes the combat data.
     - The server does send the message (`services/session_service.py:_emit_turn_change`), and my phone received `pc.turn.changed {"active": true, "round": 1}`.
   - The phone probably even buzzes, while the screen says there's no fight.
2. **After End combat the phone can show a fight that's over.**
   - What I saw: "The fight is on · Round 2" with the old Mercy 10 / Wolf 6 order and "Your reaction is ready", until a reload (`nina_38`).
   - Cause: the same one as bug 1, the other way round.
3. **Lay on Hands doesn't exist on the sheet.** The creator promises "A healing pool of 5 hit points per Paladin level" (`nina_07`). Character, Spells and the turn screen never show it (`nina_18`, `nina_35`), and `GET /api/play/{key}` has no Lay on Hands anywhere. A healer Paladin can't heal with her class feature.
4. **Cure Wounds is labelled "2d8+3 force" on the turn screen** (`nina_35`). Casting it from Spells spends the slot but doesn't roll the healing or ask who it was for (`nina_27`).
5. **Divine Smite is offered as my bonus action at level 1** although I didn't prepare it (`nina_35`).
6. **The condition sits at the bottom of the turn screen**, below Move, Action, Bonus action and two tips, and it isn't on the Character tab (`nina_35`, `nina_40`).
7. **Magic Initiate from Acolyte is listed but its two cantrips and one spell are never chosen** (`nina_15`).
8. **The creator's spell list has names only, and it contradicts the sheet** about when prepared spells can change (`nina_13` vs `nina_19`).
9. **The join page ignores `?code=OTTER` in the link** and asks me to type it (`nina_01`). Small, but my DM pasted it that way.

The floating devtools button that covers the Journal tab in my screenshots only exists in the local dev build, so it isn't a bug.

## 8. Scores (1–5)

- **Onboarding: 4.** The creator now builds a Paladin that works: class-aware scores, real slots, and feat descriptions you can read. It also has a help-level question I loved. It loses a point for bare spell names and the jargon on steps 1 and 3.
- **Table: 3.**
  - Good: rolls to the HUD in 292 ms, damage in 565 ms, conditions in 115 ms.
  - Bad: the moment that matters most, whose turn it is, never arrives on its own.
- **Players: 3.** Calm mode is the best character sheet I've used: plain captions, real-die entry, and private notes. Fight mode is broken, and my healer has no healing button.
- **Prep: 3.** For a player, prep is the Journal's turn guide and rules cheat sheet, which is good. I didn't revisit the Arena this run.
- **Looks: 4.** It's quiet, dark and readable at 390 px, the serif names feel like a game, and there's no clutter. The condition box is buried.
- **Value: 4.** It's free for me, and my phone really is my sheet now.

**Next session: yes.** **Would I pay $4/month: no.** I'm a player; that's Rowan's call, and he'd pay for the HUD, not me. **"I'd send this to another DM": maybe.** The build and the calm-mode phone are worth showing off, but I wouldn't recommend it until "Your turn" shows up on its own.

## 9. The ONE thing

When the DM presses Start the fight or End turn, my phone has to switch by itself to "Your turn" or "Wolf is up", and back to "No fight right now" when it's over. Last run it did this in under a second.

## 10. Verdict

Two months ago the creator handed me a broken healer. This time it built Mercy properly: Charisma 16, two spell slots, and every number on the Review showing its working. Then a welcome screen asked how much help I wanted, which is the kindest thing an app has asked me. The phone sheet talks like a person ("How hard you are to hit", "targets resist them with a save against 13"), takes my real dice, keeps my notes private, and finally tells me what a bonus action is. Then Rowan started the fight and my phone said "No fight right now" while it was my turn. It only woke up when he scared me. And the one thing a Paladin nurse wants, Lay on Hands, isn't anywhere on it, while my Cure Wounds claims to do force damage. I'll be there Thursday with Mercy. I'll keep my eyes on the TV for my turn, and do my healing with my fingers.
