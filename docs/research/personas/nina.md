# Persona test, run 2 — Nina Castellanos (24, nurse on shifts, two sessions of D&D, never read the Player's Handbook)

Test window: Saturday 2026-09-05, 19:55–20:12 local, on a phone (headless Chrome, 390×844 @2x; a 360×740 re-look) with a 1440×900 tab as my DM's TV. My DM was me with a second email through the API: campaign `Persona2 — Nina`, sign-up on, join code `THURS`, an arc, a session, a battle map from a public photo, a Wolf fight. I built one character on the phone: Mercy Halloran, level 1 Human Paladin. AI budget used: zero. Deleted at the end (204; join link and sheet 404 after). Screenshots: `nina_NN_*.png`.

## Who I am and what I need

I've played twice at a friend's table and liked it enough to say yes to a third. I want a Paladin because I want to be the one who keeps people up — that's my day job. I don't own the book, and the last time I asked what a bonus action was the whole table explained at once, so I've practised by describing fights to a chatbot. I do everything on my phone. My DM sent a link and "make your character before Thursday", and I need to turn up with a character that works without asking what my own buttons do.

## First five minutes

Landing: 1.15 s on the phone (`nina_01`). The sign-in box says **DM EMAIL**; I'm not a DM, but it's the only box. Continue → dashboard in 94 ms. A tour auto-opened: eight steps for the DM, one line about me (`nina_04`–`nina_06`). Dashboard: "Run the sample night", "+ Manage campaigns"; Campaigns: "No campaigns yet" (`nina_81`, `nina_82`). The guide (870 ms, `nina_07`) is for DMs; its two player paragraphs are buried in step 3. Nothing tells a player that the DM's link is the whole product for them.

## Joining and building (phone)

Join link: 0.9 s, then "This table asks for a join code. Your DM has it." (`nina_09`). `thursday` → "That code didn't match." (`nina_10`); `thurs` worked. One card: "✨ New character" (`nina_11`).

Eight screens. Scripted, link → sheet was **19.3 s and 21 taps**; reading, a few minutes.

- **Name**: two boxes, a level dropdown ("Ask your DM"). I left 1. The footer says why Next is grey — "Give your character a name." — the best thing in the creator (`nina_12`).
- **Species**: "Medium · 30 ft." means nothing. Human, because I knew the word; its traits told me nothing (`nina_15`).
- **Class**: "d10 · STR/CHA · saves WIS, CHA · caster" (`nina_16`). Nothing says "heals".
- **Background**: the one screen that talks like a person — "You served in a temple…" (`nina_19`). Next stayed grey; footer: "Choose which ability gets the +2 (below)." I tapped +2 CHA, +1 WIS. At 390 px that hint wraps into five lines.
- **Abilities**: "Standard array" was on, the page said "Paladin likes STR or CHA", then gave me STR 15 and **CHA 8** (`nina_21`). I trusted it. Bug 1.
- **Skills & gear**: "0 of 3 picked… Acolyte already gives Insight and Religion (greyed)" (`nina_22`). Then "Humans pick an Origin feat": ten chips, descriptions only as hover tooltips. Healer, by name. Gear pre-picked.
- **Spells**: "0 OF 2", thirteen names, no descriptions (`nina_25`). Cure Wounds and Bless. Bug 2.
- **Review**: "How you look (optional — the forge paints from this)". What's the forge? Create → sheet in 353 ms (`nina_28`).

A friend's phone on the link sees my card: 🛡️ emoji, "Mercy Halloran", "Nina" (`nina_32`; same at 360 px, `nina_33`). My own phone jumps straight to my sheet from then on.

## My sheet on the phone

I understand HP 11/11, AC 18, Speed, "− Damage / + Heal" with a number box, and saves and skills as names with numbers (`nina_28`). I don't understand "INIT +2", "PROF +2", "PASS. PERC 10", "SPELLCASTING CHA · Save DC 10 · Attack +2", "○ Inspiration", "Start concentration", "Lay on Hands — long". The "?" buttons help where they exist.

- **Dice** (`nina_48`): 🎲 opens "Throw a die onto the table", d4–d100, "Shake your phone to roll the d20!", Roll. Phone: "19 — it landed on the table ✨"; the TV showed a tumbling red d20 and "Mercy Halloran rolls d20 … 19" **479 ms** after my tap (`nina_49`, `nina_50`). That's the moment I'd show someone.
- **Death saves** (`nina_68`): 11 damage → 0/11 in 362 ms; a gold "💀 DYING" box, three green and three red circles, "?", "Apply death save", "🎲 Digital". Two rolls, two successes; healing cleared them. The "?" taught me what a death save is.
- **Rest buttons**: none. A hit-dice flow hides under collapsed "🎲 Resources" — "Roll 1d10 + CON +1 · Digital · Heal — Apply & spend 1 HD" (`nina_83`, `nina_84`). A long rest is something the DM does to me.
- **Whose turn**: nothing while the Wolf was up (`nina_47`). The collapsed "🧭 Your Turn — Walkthrough" is good and nobody will find it.

## The Practice Arena

Opened in 240 ms (`nina_34`): "Nothing here touches your character", "Surprise me", twenty foes that fit my level, "show 48" more.

1. **Surprise me** → Commoner: one javelin, one round (`nina_37`). Log: "d20 [17]+4 = 21 vs AC 10 · 1d6+2 → [6]+2 = 8".
2. **Wolf**, my pick: five rounds, won, took 4 (`nina_40`). I pressed Lay on Hands at full HP: "+0 HP. You're at 11/11." It let me waste my only use and said nothing.
3. **Bandit** (CR ⅛, a mis-pick) downed me in five rounds (`nina_44`); **Ogre** (CR 2) in two, 24 taken (`nina_77`). No warning it was out of my league. At 1/11 a second tip came: "Very low? Dodge…"

It taught me what a round looks like (Action dot, Bonus dot, End turn) and that the numbers are honest — die, bonus and the AC to beat on every line, which the chatbot never showed and sometimes got wrong. It didn't teach what a bonus action *is* (one tip for four fights: "One action, one bonus action, one move per turn. The buttons grey out as you spend them."), or that my two spells have no button. Greyed buttons carry their reason as a hover tooltip; on a phone you get grey. The log reads well. Real sheet after four fights: 11/11, checked twice.

## The remote window

🗺 TABLE opened the map in 248 ms (`nina_57`). A panel covers most of the phone: INITIATIVE, "Round 1", "▶ Wolf — foe" (no HP, correctly), "Mercy Halloran · you 11/11" with a green bar, ROLLS ("Rolls land here as they happen" — my earlier 19 wasn't there), footer "Drag your own token to move. Only yours moves." I dragged my token: the DM's projection moved **650 ms** after release; a GET agreed. Dragging the Wolf did nothing anywhere; only the footer says why. When my DM ended the Wolf's turn, "YOUR TURN — Mercy Halloran" filled my screen **667 ms** later and ▶ moved to me (`nina_62`, `nina_63`). Same layout at 360×740 (`nina_64`).

## Bugs

1. **Standard array ignores class unless re-tapped.** Paladin → Acolyte → Abilities: expected STR 15, CHA 14; got CHA 8, Review silent (`nina_21`, `nina_27`). `frontend/src/pages/CharacterCreator.tsx`: default `scores` at line 124 is class-blind; `arrayForClass` (line 94) only runs from the chip's `onClick` at line 408.
2. **Level-1 Paladin prepares two spells and has zero slots.** Creator "0 OF 2"; sheet lists Bless and Cure Wounds, no slots; `GET /play/{pc}/spell-slots` → `{"levels": {}}` (`nina_25`, `nina_29`). `services/character_service.py`, `_HALF_CASTER_SLOTS[0] = {}` (2014) under a 2024 creator. The Arena never offers Cure Wounds.
3. **Lay on Hands is an action and spends for +0.** 2024 makes it a Bonus Action; at full HP it logs "+0 HP" and burns the use (`nina_40`). `services/arena_service.py:60`.
4. **Greyed Arena buttons and Origin-feat chips explain themselves only via `title`**, invisible on touch (`Arena.tsx` 388/405/415; `CharacterCreator.tsx` 434).
5. **The sheet says nothing about whose turn it is when it isn't mine** (`nina_47`).
6. **No "above your level" mark** on the long foe list (`nina_41`, `nina_77`).
7. **Remote ROLLS panel has no history** (`nina_57`).

## Scores (1–5)

- Onboarding: **3** — code, grey-Next footer and Background cards are right; the array trap and spells-without-slots send a first-timer out with a broken healer.
- Table experience: **4** — d20 to TV 479 ms, drag 650 ms, my turn 667 ms, all measured.
- Player experience: **3** — sheet, dice and dying box are good; too many unexplained words, no rest button, silent until it's my turn.
- Prep: **3** — for a player, prep is the Arena: it drilled the turn, not my class.
- Value: **4** — free for players, and my phone genuinely became my sheet.

*Would you use it for your next session?* **Yes** — if my DM runs it: no cost to me, and phone-sheet-plus-TV beats the paper I had.

*Would you pay?* $5 Hearth — **no** (players don't need AI). $12 Lantern — **no**. $25 Table — **no**, that's the DM's call.

**The ONE thing:** make the build honest for a beginner — class-aware scores by default and only spells I can actually cast — so the Arena can then teach me what my own Paladin does.

## Verdict

The parts that matter on the night work and they're fast: I tapped Roll and a die tumbled across my DM's TV half a second later; my token moved when I dragged it and nobody else's did; "YOUR TURN" hit my phone before he'd finished saying it. What let me down was the fifteen minutes before. The creator let me build a Paladin with Charisma 8 and two spells I can't cast, and the Arena coached me with one sentence for four fights and let me waste my only heal at full health. Against the chatbot: this never lies about the dice, but it never answers a question either. I'll turn up Thursday with Mercy; I'll still have to ask someone what a bonus action is.
