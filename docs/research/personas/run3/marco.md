# Marco: run 3 field test (2026-10-31)

Screenshots are in
`F:\Temp\claude\c--Users-justi-OneDrive-Projects-questlab\f74a91d3-757b-451c-8465-a81ce92909b9\scratchpad\personas3\marco\shots\`
(shortened to `shots\` below). I tested the local build at 1440×900, with a 390 px phone context
for the player side.

## Who I am
I'm 38 and have been a DM for nine years. I run two groups: one in person, one online over Discord
with Owlbear Rodeo for the map. Everyone in both groups uses D&D Beyond, and I still use a paper
screen. Justin texted me an invite and I gave QuestLab my twenty minutes, plus a bit more because it
earned it.

## First five minutes
- **The invite works.** The invite link greeted me by name ("You're invited to the QuestLab beta,
  Marco") with the code already filled in. The "Your name" box was still empty, which was a little
  odd after it had just used my name. (`shots\01_welcome.png`)
- **Sign-up to dashboard took about 20 seconds.** I landed on a "Welcome to QuestLab" checklist (0 of 5)
  with an 8-step tour over it. The tour is short and plain, says "no generative AI" up front, and
  doesn't nag. (`shots\02_after_signup.png`, `shots\m_tour.png`)
- **"Run the sample night" is the best button in the app.** One click put me in a running HUD for
  "The Millpond Bells": four level-1 PCs, a three-scene script with read-aloud text, NPC cards
  (Aldous, Tansy) and a map already live. Inside a minute I could see what the product is.
  (`shots\04_sample_landing.png`)
- **The HUD is busy at 1440 px.** The app sidebar stays open while I run a session, the middle
  column is cramped ("1 on tonight's s…" gets cut off), and the initiative order is collapsed by
  default. Once I found the chevron, the order strip was good. (`shots\m_07.png`)
- **Sync to the phones is the real thing.** I took 5 off Bram on the HUD and his phone said 9 / 14
  about a second later. I ended a turn and his phone changed from "1 turn before yours" to "You're
  next." Nothing I've used does this without someone typing it in twice. (`shots\m_07phone.png`)

## Setting up my in-person group
- **Campaign.** "Persona3 — Marco Thursday Table" took four fields and one click. It drops you on
  Sessions with "Run a quick session" or "New arc", which is clear.
- **Join link.** The Characters page says "Share your join link so players build their own", but
  there is no join link on that page. The page's "More" menu only has "Enter an existing sheet…" and
  "Level up the party…". I found the link in the HUD instead ("Join QR → TV" and the copy button).
  (`shots\09b_characters_empty.png`)
- **Player joining on a phone.** `/join/<campaign>` shows "Who are you?" with the characters and
  "New character". Tapping my pre-built character claimed it with no name prompt. The phone then
  said **"Welcome to the table, Not assigned yet."**, and the DM's party card still says "Not
  assigned yet", so I can't tell who picked up which sheet. (`shots\17a_join_claim.png`)
- **The phone companion is the best part of the app.** Help levels (Teach me / Remind me / Just the
  numbers), whose turn it is with a "Now" pill, "Your reaction is ready" with the Opportunity Attack
  text, and one-tap skill checks. The spell tab spends slots. A player who has only used D&D Beyond
  would get it right away. (`shots\16b_corwin_now.png`, `shots\16c_corwin_spells.png`)

## Level-5 character in the guided builder vs D&D Beyond
I built **Ser Corwin Vale, a Dwarf Paladin 5 with the Soldier background**: standard array, +2 STR
and +1 CON from the background, and +1 STR / +1 CHA at level 4. I prepared 6 spells.

**What it got right, matching D&D Beyond (2024):**

| Thing | QuestLab | DDB |
|---|---|---|
| HP | 49 (12 + 4×8 + 5 from Dwarven Toughness, with the math shown) | 49 |
| AC | 18 (chain 16 + shield 2) | 18 |
| Proficiency | +3 | +3 |
| Saves | WIS +3, CHA +5 | same |
| Skills | Athletics +7, Insight +3, Intimidation +5, Persuasion +5 | same |
| Spell slots | 4 / 2 | 4 / 2 |
| Prepared | 6, up to 2nd level | 6 |
| Spell DC / attack | 13 / +5 | 13 / +5 |
| Longsword | +7, 1d8+4, mastery **Sap** | same |
| Javelin | +7, 1d6+4, mastery **Slow** | same |
| Dwarf traits | Darkvision 120, Resilience, Toughness, Stonecunning (tremorsense) | same |
| Cure Wounds | 2d8+2 | same |
| Lesser Restoration / Magic Weapon | Bonus Action | same |

The builder itself is good. The level-5 class preview listed every feature, including Extra Attack,
Faithful Steed and "next at 6: Aura of Protection". The ASI step suggests sensible feats for a
Paladin and hides the ones I don't qualify for.

**Where it breaks:**
- **The finished sheet has no class features at all.** The Features section reads "No features
  learned yet. … No more catalog features available." That means no Lay on Hands pool (25), no
  Divine Smite, no Extra Attack, no Channel Divinity, no Faithful Steed and no Weapon Mastery. The
  phone doesn't show them either. On D&D Beyond my player would have a Lay on Hands tracker and
  Channel Divinity uses on the first screen. (`shots\w15_open_sheet.png`, `shots\16c_corwin_spells.png`)
- **Always-prepared spells are treated as ordinary picks.** Divine Smite and Find Steed sit in the
  normal list, and picking them uses up my 6. In 2024 they're always prepared and free. Neither one
  appeared on the sheet because I didn't spend picks on them. (`shots\w13_spells.png`)
- **Fighting Style (level 2) and Weapon Mastery choices are never asked for.** The review says they
  "go on the sheet", but the sheet has nowhere to put them.
- **Subclass can be left blank at level 5 with no warning.** I skipped it, and the review just says
  "Paladin 5". DDB stops you. With no Oath, there are no oath spells either.
- **Smaller gaps:** only 4 backgrounds and no Compelled Duel, Thunderous Smite or Wrathful Smite (I
  assume SRD limits). The kit is simplified (one javelin instead of six, no holy symbol or pack).
  Channel Divinity says "a few uses" when it's 2. Savage Attacker only appears in the notes text.

Verdict on the builder: the numbers are right and the features are missing. A Paladin who can't
see Smite or Lay on Hands on the phone will open D&D Beyond instead, and then the companion phone
(QuestLab's best part) never gets used.

## Session prep
- **Arc and session.** New arc "The Drowned Bell" picked up the party's tier ("Tier 2 · levels
  5–10"), which was a nice touch. Add session → Prep was quick.
- **The blank runbook is too thin to prep in.** I got a single "Scene 1" with an empty "Read aloud"
  bar. Clicking the bar didn't give me a cursor. I couldn't see an "Add scene" button, a scene-title
  edit or a "your notes" field like the sample has. When I typed, the letter **n** in my
  read-aloud text triggered the Notes hotkey and opened the DM notes drawer. That drawer then
  followed me to the Battle maps page. (`shots\21_prep_runbook.png`, `shots\24_after_upload.png`)
- **The prep Initiative panel only takes a typed name, DEX and HP.** It has no monster picker. The
  stat blocks must live in Encounters, which I didn't reach in my time.
- The sample night's runbook is exactly what I'd want to write myself, so the blank one feels like a
  regression from what the app just showed me.

## The online group: battle map, TV and remote tokens, vs Owlbear Rodeo
- **Upload.** I imported a 1400×1000 PNG with a 70 px grid. A plain browser confirm about map
  rights comes first, which is fine. The map record was created, but **the image shows as Chrome's
  broken-image icon, blown up**, in the map editor, the HUD's Live preview, the TV view and the
  player's phone. The file exists at `localhost:8000/uploads/…png` (200, image/png), but the page
  asks `localhost:5173/uploads/…`, and the dev server returns the app's HTML. **This may only
  affect the local build**, so please confirm on prod. (`shots\28a_map_uploaded.png`,
  `shots\m_tv.png`, `shots\m_phonemap.png`)
- **The grid guess was 100 px** for my 70 px grid.
- **The map editor asks for an "Obsidian note: vault-relative path inside Hollowmere".** That's
  Justin's own campaign vault showing up in my product. (`shots\28a_map_uploaded.png`)
- **Staging.** Maps → "From the library" → add to tonight's shelf → click the map → Live → "+ Party"
  put my token down. The "Player display" menu offers Projector / TV (recommended), a 3D board for
  screen share, "3D set dressing" and a pop-up controls window. That's a lot of choices for "show
  the map".
- **Remote player moving their own token: yes, it works.** The phone's "Open the table map" opens
  `/table/<session>?pc=<key>`, which says "Drag your own token to move. Only yours moves." A touch
  drag moved Corwin's token on the phone, and the TV's token position changed too. A mouse drag in
  the phone view didn't move it, but phones use touch, so that's fine.
- **On a portrait phone the map is a band across the middle third**, with big black areas above and
  below. The "THE TABLE / ROLLS" panel covers it until you tap "Map ▸".
- **Leftover emoji and all-caps:** the Live toolbar has 👁 Reveal, 🌙, 🎬 and ◎ Ping, and the
  player table view has "THE TABLE", "ROLLS" and a 📱 button. (`shots\30a_live_with_party.png`,
  `shots\31a_phone_table.png`)

**Honest comparison with Owlbear Rodeo.** For the map itself, Owlbear wins today. You drop an image
and it's there with a grid you drag to fit. Players move tokens and there's a ruler; it's simple and
it never breaks. QuestLab's map is a means to an end: fog regions, tokens and a TV view, driven from
the same HUD as initiative and HP. What Owlbear can't do is know whose turn it is, put damage on a
player's sheet, or spend a spell slot on their phone. For my online group I'd keep Owlbear for the
map and try QuestLab next to it for turn order and sheets. That only works if their sheets are as
complete as D&D Beyond's (see above).

## Bugs
Ranked by how much each would hurt at a real table.

1. **Characters from the guided builder have no class features** (no Lay on Hands, Smite, Extra
   Attack, Channel Divinity, Weapon Mastery or Faithful Steed).
   - Steps: Characters → Add character → Paladin 5, finish → Open sheet. Features says "No features
     learned yet"; the phone has none either.
   - Screenshots: `shots\w15_open_sheet.png`, `shots\16c_corwin_spells.png`
2. **Always-prepared spells count as picks.**
   - Steps: Paladin 5, Spells step. Divine Smite and Find Steed are ordinary checkboxes inside the
     "0 of 6"; if you don't pick them, they're not on the sheet.
   - Screenshot: `shots\w13_spells.png`
3. **Uploaded map shows as a broken-image icon everywhere (maybe local only).**
   - Steps: Battle maps → Import maps → PNG → OK. The editor, Live preview, `/table/<id>` and the
     phone map all show the broken-image glyph. The image is served at :8000/uploads but requested
     from :5173/uploads.
   - Screenshots: `shots\28a_map_uploaded.png`, `shots\m_tv.png`, `shots\m_phonemap.png`
4. **Joining via the link greets the player as "Not assigned yet" and never asks their name.**
   - Steps: phone → `/join/<campaign>` → tap a character. The greeting reads "Welcome to the table,
     Not assigned yet." and the DM's card stays "Not assigned yet".
   - Screenshot: `shots\17a_join_claim.png`
5. **The phone shows the first word of the name: "Ser" for "Ser Corwin Vale".**
   - Where: the header on Now and Spells, and the "Take me to Ser" button. Any name with a title
     (Ser, Sister, Lord) breaks.
   - Screenshot: `shots\16b_corwin_now.png`
6. **You can't type into the blank runbook, and typing fires hotkeys.**
   - Steps: Prep → "Start a blank runbook" → click "Read aloud" → type a sentence with an "n" in it.
     No text goes in, and the DM notes drawer opens and stays open across pages. There's also no
     visible "add scene".
   - Screenshots: `shots\21_prep_runbook.png`, `shots\24_after_upload.png`
7. **No join link on the Characters page**, even though the page tells you to share it. It's only in
   the HUD.
   - Screenshot: `shots\09b_characters_empty.png`
8. **The "Share player link" popover doesn't close on Escape.** Its overlay blocks "Start the fight"
   until you click somewhere else.
   - Screenshot: `shots\05a_share_link.png`
9. **The map editor shows the "Obsidian note … inside Hollowmere" field** to a beta user.
   - Screenshot: `shots\28a_map_uploaded.png`
10. **Grid auto-guess of 100 px** for a 70 px grid map.
    - Screenshot: `shots\28a_map_uploaded.png`
11. **Emoji and all-caps left on the Live toolbar and the player table view.**
    - Screenshots: `shots\30a_live_with_party.png`, `shots\31a_phone_table.png`
12. **Small things:**
    - The HUD's minus button tooltip says "Apply 1 damage" with 5 in the box (it does apply 5).
    - Corwin's HUD Cast row showed only Cure Wounds and Lesser Restoration, not Bless, Command,
      Heroism or Magic Weapon. Maybe that's on purpose? (`shots\28b_library.png`)
    - Local build only: the TanStack devtools logo covers the dice-tray button, and tour step 6
      spotlights the devtools logo.
    - Test artifact: when the `questlab-auth` store is missing, the sidebar's "Signed in as"
      falls back to `dm@questlab.local`.

## Scores 1–5
- **Onboarding: 4.** The invite greeting, checklist and one-click sample night are excellent. The
  join link's location and the empty name box cost a point.
- **Table: 4.** The HUD-to-phone sync is the real deal. The layout is crowded at 1440 with the
  sidebar open, and initiative is hidden by default.
- **Players: 4.** The phone companion is the best thing here. It loses a point for the "Not assigned
  yet" greeting, the "Ser" header and the missing features.
- **Prep: 2.** The sample runbook is great, but I couldn't build my own beyond a title.
- **Looks: 4.** Calm and readable, and the Alegreya headings feel like a book. There are leftover
  emoji and all-caps on the map side.
- **Value: 3.** I'd use it for in-person turn order and sheets if the sheets were complete. For
  maps, Owlbear does it today.

- **Next session:** maybe. I'd run my in-person group's next fight with it if I can bring their
  D&D Beyond characters over complete.
- **Pay $4/month:** maybe. I'd pay for the phone companion plus HUD once a level-5 sheet is
  table-ready. I wouldn't pay for the maps.
- **"I'd send this to another DM":** maybe. I'd send the sample night today as a "look at this",
  but not as a "switch to this". The DMs in my chat would build a level-5 character first, the same
  way I did, and hit the empty Features list.

## What I'd tell my DM group chat
Today's draft, if I posted:

> "Friend of mine is building QuestLab, a free DM screen and initiative tracker for 2024 rules,
> with no AI anywhere. Hit 'Run the sample night' and open one of the player links on your phone.
> The HUD-to-phone sync is legit: you deal damage and it's on their phone in a second, and every
> phone knows whose turn it is. The guided character builder does the math right (HP, AC, saves,
> slots, weapon masteries all matched DDB for my level 5 paladin), BUT the sheet comes out with no
> class features yet, so no Lay on Hands, Smite or Extra Attack. Fine for a level-1 one-shot. Not
> ready to replace DDB for a running campaign. Maps are basic next to Owlbear."

What would stop me posting it at all: if someone in the chat built a level 3+ character first, hit
"No features learned yet", and decided I'd wasted their evening. I'd post it only with the "try the
sample night first" framing.

## The ONE thing
**A character from the guided builder has to come out complete for its level.** That means its
class features, with their uses tracked on the phone (Lay on Hands pool, Channel Divinity uses,
Smite, Extra Attack), and always-prepared spells added for free. If my players can't get there,
the answer is a D&D Beyond import. Do that and my answer becomes "yes, next session" for the
in-person group.

## Verdict
QuestLab gets one thing right that nothing in my kit does: the DM's screen and every player's phone
share one live state. Damage, turn order and spell slots move between them in about a second, and
the player phone is good enough for a brand-new player. The sample night sells that in two minutes.
Prep and character creation don't hold up yet:
- The level-5 builder gets every number right, then hands me a sheet with no class features.
- The blank runbook wouldn't take text.
- On the local build, my uploaded map showed as a broken image.

For my in-person table it's one fix away from a real trial. For my online table, Owlbear keeps the
map and QuestLab would at most run beside it. I'm keeping an eye on it, and I'll post it to the
group chat with honest caveats once a level-5 Paladin can Smite from his phone.
