# Persona test, run 3: Adaeze Okafor (youth-services librarian, Thursday teen D&D club)

Test window: 2026-10-31, local build (http://localhost:5173, API :8000). I signed up from my invite link as `persona3-adaeze@questlab.test` and made `Persona3 — Adaeze Thursday Club` with join code `OWL7`. Three teens joined from 390 px phone contexts: Kemi (13, Human Fighter 1), Zara (14, Halfling Wizard 1) and Tobi (15, Dwarf Cleric 4). I ran a quick session with two goblins, put the projector up at 1280×720, had a "friend" outside the club open Kemi's link, reset that link, read `/terms` and sent one feedback note. I used headless Chrome through Playwright and no AI. Screenshots are in `F:\Temp\claude\c--Users-justi-OneDrive-Projects-questlab\f74a91d3-757b-451c-8465-a81ce92909b9\scratchpad\personas3\adaeze\shots\`, and the step-by-step wizard logs (`wizard_*.txt`) are in the folder above it.

## 1. Who I am

I run a Thursday club for eight 13–16-year-olds on the library's projector and their own phones. The library's rules: no accounts for the kids, no personal data, nothing that costs money, and I must be able to explain all of it to a librarian. The room is bright and the projector is cheap, so contrast beats atmosphere.

## 2. Since last time (September)

**Better**
- **The Join button is fixed.** The code page now has a proper orange "Join the table" button (`10_kemi13_join_code_page.png`). This was my bug 4.
- **Characters can fight.** The guided builder gives starting gear: Kemi's phone shows "Flail +4 to hit · 1d8+2" and "Greatsword +4 to hit · 2d6+2" with Roll buttons, and Tobi's shows Mace, Bless and Sacred Flame (`34_phone_tobi_after_end.png`). My old bug 1 (characters with nothing to swing) is gone for anything built with the wizard. I did not re-run the sample-night pregens.
- **Starting a fight is one button.** "Run a quick session" put all three PCs into the order by itself, and "Start the fight" rolled initiative in one click. My old six-click route through Load Encounter, Live and + Party is gone.
- **Live updates are fast everywhere.** End turn reached both phones and the projector's turn-order panel in 0.33 s. Re-roll reached them in 0.32 s, and a later "Start the fight" in 0.29 s. My 20-second projector lag (bug 3) is fixed.
- **The AI is gone.** No "Forge my look" button on a child's phone (old bug 9). The Terms now have a plain section about AI that I can read aloud.
- **Fonts are self-hosted.** The Terms say so, and I found no Google Fonts or analytics hosts in `index.html` or the CSS. Last time Google Fonts was the only third party that saw the kids' devices.
- **Sheet links can't be guessed.** They are now random keys (`/play/a1BszEW6HZPeZKUU9Js2mg`), and the DM can reset them.

**Still the same or worse**
- **Every kid still has to type a name**, labelled "Your name (the player)". It still appears on the roster for anyone with the code, and the Terms still say "Player links carry no personal data" (old bug 5).
- **Anyone with the code can still tap any kid's card** and land on that kid's sheet (old bug 6). Unguessable keys don't help, because the roster hands the keys out.
- **New: the projector hides the turn order by default.** Without a battle map, the "Projector / TV" choice shows a black screen and a dim "No map on the table". Details below.

## 3. First five minutes

- **The invite link knew me.** It loaded in 2.4 s and said "You're invited to the QuestLab beta, Adaeze." The code was already filled in, with name, email and password fields below (`01_welcome_invite.png`). Creating the account took 1.56 s and landed me on the dashboard.
- **The dashboard was ready for me.** A "Welcome to QuestLab" checklist (0 of 5 done) and a tour that opens with "There is no generative AI in it" (`02_after_signup.png`).
- **Making the campaign was quick.** Manage campaigns → New campaign → name, setting, tone → Create took 1.23 s and opened Sessions.
- **The join code was easy.** On Characters I typed `OWL7` and pressed Enter, and the subtitle changed to "type OWL7, and build or pick their character" (`06_join_code_set.png`). I liked the new "Generate" button for when there is no code.
- **But the join link isn't there.** The page says "Share your join link so players build their own", and there is no link on it: no copy button, no QR (`06_join_code_set.png`). I found it later as "Join QR → TV" in the HUD and as a small phone icon in the projector's corner. A librarian setting up on Wednesday will look for it on Characters first.

## 4. Three teens join from their phones

**What the teens did**
- **Kemi:** join link → code page → typed `owl7` in lower case (accepted) → roster ("Nobody has joined this table yet") → New character, "Build one here, about five minutes". Eight steps: Name, Species, Class, Background, Ability scores, Skills and gear, Spells, Review. "Create and open my sheet" took 1.65 s.
- **Zara:** the same eight steps, typing just "Z" as her name. It was accepted, which is what I'll tell all the kids to do.
- **Tobi:** level 4 gave nine steps, with **Improvements** between Skills and Spells. Create took 1.82 s.

**Can a 13-year-old do it alone, in plain words?** Mostly, for a level 1 non-caster.
- **The steps explain themselves.** Each one says what the choice is for in one sentence: "Your species sets your size and speed…", "Your class is what you do in a fight and out of it."
- **Next says why it's greyed out:** "Pick 3 more skills. Greyed ones already come from the background."
- **The background cards read like a story:** "You served in a temple. Prayer, ritual, and the smell of incense are home."
- **Jargon is explained where it appears.** "Skills are what you're trained at: you add your proficiency bonus (+2 at level 1) to those checks." That is the explanation I give every week.
- **The help-level screen is perfect for my club.** The first phone screen says "Welcome to the table, Kemi." and offers Teach me, Remind me or Just the numbers (`13_kemi13_sheet_now.png`).
- **The turn screen teaches the turn.** "Your turn — You can move, take one action and one bonus action, in any order", then 1 Move, 2 Action — pick one, 3 Bonus action: "Nothing on your sheet uses a bonus action yet. That's normal." (`34_phone_tobi_after_end.png`). This is better than what I say out loud.

**Where they will call me over**
- **The Human's "Skills and gear" screen is about 2,000 px long on a phone** (`12_kemi13_05_Skills_and_gear.png`). It holds 19 skill chips split into "Fighter skills: pick 2" and "Human adds one more", then "Versatile: pick an Origin feat (required)" with ten feat cards, then three gear kits. Three separate decisions on one screen. Lines like "Luck Points equal to your proficiency bonus: advantage on a d20 Test" mean nothing at 13.
- **Background bonuses:** "+2 and +1" versus "+1 to all three" needs me.
- **Spells are a list of names with no description.** Bane, Thaumaturgy, Create or Destroy Water: 39 names for the Cleric (`12_tobi15_07_Spells.png`). Nothing a kid could pick from alone.
- **Level 4 Improvements:** "War Caster: Advantage on concentration saves, cast as an opportunity attack" is adult rules language. "Ability Score Improvement" then "pick the ability that gets +2" is clear, though.
- **Words still unexplained on the sheet and review:** Hit die, saving throws, Passive Perception, "DC 13 Dexterity · 1d8 radiant", "1d6-1 bludgeoning", Opportunity Attack.

**How long:** my estimate for a confident 13-year-old reading alone (the script itself took 16–73 s with retries):
- Level 1 Fighter: 8–12 minutes. The Human skills screen takes half of it.
- Level 1 Wizard: 10–15 minutes, mostly spent staring at spell names.
- Level 4 Cleric: 15–20 minutes, and he'll need me for the feat and the spells.

"About five minutes" is true for me, not for them. For club night I'd steer new kids to non-Human, level 1, non-casters.

**Rules gaps at level 4.** Tobi's Cleric 4 was created with **no subclass**. The chips were offered but never required, and the API returns `"subclass": null`. He also had **2 of 7 prepared spells**, and neither Next nor Review said anything (`12_tobi15_08_Review.png`). A 15-year-old who skips ahead gets a weaker character and nobody tells him.

## 5. A short fight on the HUD and the projector

- **Setting up was fast.** Sessions → "Run a quick session" opened the HUD in 1.66 s with "Party · 3 PCs" and "3 combatants ready, not started" (`22_hud_combatants_added.png`).
- **Goblins mean typing stats.** I added them through Add with name, side, Hit points, Armor class and Initiative. Defaults were 10/10/0, so I'd need to know a goblin's numbers or prep an encounter.
- **"Start the fight" is clear.** One button, then Round 1, five in order, "Their turn" on Brightblade, and an orange "End turn →" (`24_hud_fight_started.png`).

**The projector (Player display → Projector / TV, the recommended choice)**
- **It shows nothing useful without a map.** A near-black screen, a dim grey italic "No map on the table", and a small phone icon in the corner that opens the join QR (`25_projector_fight.png`, `30_projector_corner_button.png`).
- **No turn order, no round, nothing to read** for a theatre-of-mind club. In a bright library room it is a black rectangle.
- **The turn order only appears if I add `?panel=1` to the URL by hand** (`31_projector_panel1.png`, `33_projector_panel_after_end.png`). I only found that by reading the code. No menu item offers it.

**What the panel shows and hides**
- **Shows:** "Initiative · Round 1", each PC's name with HP numbers and bar, an arrow on whoever is up, foes as "Goblin · foe", and a Rolls log.
- **Hides:** foe HP and all DM notes. That is right for kids.
- **Too small and too narrow.** The text is about 15 px in a 300 px column on the right; from the back row it will be hard to read.
- **Labels break the redesign's rules.** "INITIATIVE" and "ROLLS" are all caps.
- **The footer is meant for a remote player, not a TV:** "Open this from your sheet's 🗺 Table link to move your token."

**Phones during the fight**
- **They follow the fight.** Each kid's Now tab showed "Pip Quickfoot is up · You're next", with the order and their own place marked "You".
- **One miss.** On the very first "Start the fight" of the fresh session, Kemi's already-open phone still said "No fight right now" more than 20 s later (`26_phone_kemi_fight.png`). A later End combat → Start the fight reached Tobi's open phone in 0.29 s, and I could not make it happen again.

## 6. The librarian reads Terms and Privacy

The page is 489 words and fits on one screen of reading (`51_terms.png`).

**"Cookies and storage": yes, mostly.**
- "QuestLab sets no cookies and runs no analytics, advertising or tracking scripts, so there is nothing to accept or reject."
- It then names everything the browser keeps: sign-in, campaign, help level, tour, last character.
- "Only your sign-in is ever sent back." Fonts come from QuestLab itself.
- I can read that to a librarian word for word, and it matches what I checked.

**"No generative AI, and how QuestLab is built": yes.** "Nothing you write or upload is sent to a model…" and the honest paragraph about AI coding assistants staying "in the workshop". That is exactly how I'd want it put to a parent.

**What the librarian will still ask**
- **"Player links carry no personal data" is not true for us.** The builder requires the player's name. With the code, the roster shows "Brightblade · Kemi, Pip Quickfoot · Z, Sister Ash · Tobi" to anyone. "My notes" are stored on the character, not the phone, so anyone holding the link can read them (next section).
- **Email accounts aren't covered.** "Accounts and privacy" only talks about signing in with Discord or Patreon, but I made an email-and-password account. What is kept for that?
- **The basics are missing:** no contact address, no data-retention line, nothing about players under 16, no named operator.
- **The Patreon line needs care.** "A Patreon membership supports the project and unlocks nothing you need to play" is fine, but a librarian will want to hear that the kids are never asked for money. Today they aren't.

## 7. A teen shares a link with a friend outside the club

**Kemi's sheet link on a stranger's phone**
- **The friend becomes Kemi.** Kemi's whole sheet opened, including "Your turn", the Roll buttons for Flail and Greatsword, and the Journal (`40_friend_opens_kemi_link.png`, `41_friend_journal.png`).
- **The "private" notes are not private.** "My notes" is labelled "Your DM's screens don't show these". The friend typed "lol this is Jordan, not Kemi" and it saved to Kemi's character: `GET /api/play/<key>` returned that text as `player_notes`.
- **The friend can also roll on Kemi's turn.**

**The join link without the code:** "This table asks for a join code. Your DM has it." Good (`42_friend_join_no_code.png`).

**The join link with the code** (kids will say it out loud): all three characters with the kids' names, any sheet one tap away, and "New character: Build one here", which would add a stranger to my campaign (`43_friend_join_with_code.png`).

**Resetting a link as DM**
- **The control is easy to find.** Characters → "Share player link" on the card opens a box with "Copy link · Open · Reset link" (`45_dm_share_dialog.png`).
- **The confirmation is excellent librarian language:** "Give Brightblade a new player link? The old link stops working right away. If a player left the party, change the campaign's join code too, so they can't pick the character again."
- **The reset itself works.** It took 1.55 s, gave a new key, and said "New link made. The old one no longer works — send this one to the player." (`46_dm_after_reset.png`).
- **The friend is locked out.** On reload: "We couldn't open this character. Ask your DM for a fresh link." (`47_friend_old_link_after_reset.png`).
- **But so is Kemi, with no way back.** Her open phone kept working until she reloaded. Then she got the same message, two red "Error: Character not found." toasts, and a "QuestLab home" link, which goes to a DM sign-in page (`49_kemi_after_reload.png`). The fix is right there: send her to the party page to tap her character again, which the app already does for old-style links.
- **The reset is half a fix.** As the dialog itself says, it only works if I also change the join code, and then I have to say the new code to seven other kids.

## Bugs (ranked by how much they'd hurt on a Thursday)

1. **The projector shows no turn order unless I type `?panel=1`.**
   - Repro: HUD → Player display → Projector / TV → `/table/<sid>` with no battle map → Start the fight.
   - Expected: a big turn order with the round number, and the join QR before the fight.
   - Actual: black screen with dim "No map on the table". The order only appears at `/table/<sid>?panel=1`, in a 300 px column with ~15 px text, all-caps labels and a footer aimed at remote players. No menu item offers it.
   - `frontend/src/pages/TableView.tsx` (`panelWanted`), `components/table/MapCanvas.tsx` L118, `SessionHud.tsx` Player display menu ~L1466.
   - Screenshots: `25_projector_fight.png`, `31_projector_panel1.png`, `33_projector_panel_after_end.png`.
2. **"Private" notes can be read and overwritten by anyone holding the sheet link.**
   - Repro: open `/play/<key>?tab=journal` in a fresh phone context, type in My notes, then `GET /api/play/<key>`.
   - Expected: notes that stay on the kid's phone, or a label that says who can see them.
   - Actual: the stranger's text saved as the kid's `player_notes`.
   - `pages/player/JournalTab.tsx` L71–113, `services/player_service.py::set_player_notes`.
   - Screenshot: `41_friend_journal.png`.
3. **Resetting a link strands the kid it belongs to.**
   - Repro: Characters → Share player link → Reset link → reload the kid's old link.
   - Actual: "We couldn't open this character. Ask your DM for a fresh link.", two "Error: Character not found." toasts, and a "QuestLab home" link to DM sign-in.
   - Expected: "Your DM gave this character a new link. Open your party's page and tap your character again", with a link to `/join/<campaign>`, as `components/PlayLinkGate.tsx` L98 already says for old-style links. Also, an already-open page keeps working until it reloads.
   - Screenshots: `48_kemi_open_phone_after_reset.png`, `49_kemi_after_reload.png`.
4. **Kids' names are required and shown to anyone with the code, while the Terms say there is no personal data.**
   - Repro: the wizard's first step needs "Your name (the player)" ("Add your own name too."); join with the code and every name is listed.
   - `CharacterWizard.tsx` L482 and `nextHint` "name"; `TermsPage.tsx` "Player links carry no personal data."
   - Screenshot: `43_friend_join_with_code.png`.
5. **Level 4+ builds can skip the subclass and most spells without a word.**
   - Repro: Cleric, level 4, leave the subclass chips alone, pick 2 prepared spells, Next, Create.
   - Expected: Next blocked, or Review saying "No subclass yet · 5 prepared spells left to pick".
   - Actual: `subclass: null`, 2 of 7 prepared, and silence.
   - `CharacterWizard.tsx` `nextHint` "class" and "spells".
   - Screenshots: `12_tobi15_02_Class.png`, `12_tobi15_07_Spells.png`, `12_tobi15_08_Review.png`.
6. **No join link on the Characters page.**
   - The page tells me to "Share your join link", but it is only in the HUD ("Join QR → TV") or behind the projector's phone icon.
   - Expected: the link and a Copy button next to the join code.
   - `pages/Characters.tsx` L244–300.
   - Screenshot: `06_join_code_set.png`.
7. **A phone that was already open missed the first "Start the fight" once.**
   - Fresh quick session; Kemi's phone opened and past the help screen before the start. It still said "No fight right now" more than 20 s after Start the fight.
   - I could not reproduce it: a later End combat → Start the fight reached an open phone in 0.29 s.
   - Screenshot: `26_phone_kemi_fight.png`.
8. **The spell step lists names only.**
   - No one-line blurb, unlike the feats and backgrounds, so a teen cannot choose alone.
   - Screenshot: `12_tobi15_07_Spells.png`.
9. **The phone header shows "Sister" for "Sister Ash".**
   - It shows only the first word of the character's name.
   - Screenshot: `34_phone_tobi_after_end.png`.

## Scores (1–5)

- **Onboarding 4.** The invite greeted me by name, the account took 1.6 s and the checklist is good. The join link is missing from Characters.
- **Table 3.** "Start the fight" is one click and every surface updates in a third of a second. The recommended projector view is black until I hand-edit the URL.
- **Players 4.** The phone's Now screen and help levels are the best thing I've seen for teens. The builder is heavy at the Human skills screen and at level 4, and the spells are bare names.
- **Prep 3.** Barely tested. The quick session loads the party itself, but a goblin means typing its HP and AC.
- **Looks 4.** Calm, legible phones. The projector is far too dark and too small for a lit room.
- **Value 5.** Free, no accounts for kids, no AI, nothing to buy.

- **Next session: yes.** With two workarounds: I'll bookmark `?panel=1` for the projector, and the kids type initials and leave My notes empty.
- **Would I pay $4/month: no.** The library cannot, and nothing I need is paid.
- **"I'd send this to another DM": yes.** I'd send it to the other branches' teen-club leads. No child accounts, a delete that deletes, honest Terms about AI and cookies, and a phone that teaches a 13-year-old how a turn works.

## The ONE thing

Make "Projector / TV" show a big turn order and round counter when there is no map, with the join QR on it before the fight starts. My club plays theatre of mind, and right now the most visible screen in the room is black.

## Verdict

Since September every one of my blockers has moved. Built characters have real weapons and spells. The fight starts with one button. The phones and the turn-order panel update in a third of a second. The forge button is gone, and the Terms now say plainly that there are no cookies, no tracking and no AI. The phone's "Your turn: move, one action, one bonus action" screen will teach my kids more than I do. What I'd still have to explain away to a librarian is narrower and specific. The recommended projector view is a black screen for a table without maps. "Private" notes travel with any shared link. A reset link strands the kid it belongs to. And the Terms still promise no personal data while the builder requires a name. I'll run it this Thursday with initials and a bookmarked `?panel=1`, and I'll tell the other branches to try it once the projector shows the turn order by itself.
