# The Persona Field Test, run 3 (2026-10-31)

Six constructed testers ran on the local build, each with their own invite and their own account, in
the week the friends beta was built. Four came back from
[run 2](persona-field-test-2026-09-run2.md): Nina (new player), Sam (low-vision, keyboard only),
Adaeze (library teen club) and Bea (actual-play streamer). Two are new: Lena (a DM who does
everything on a phone) and Marco (D&D Beyond and Owlbear user, one in-person group and one online
group). Each one read the reports from earlier runs, checked what shipped, and wrote a report in
their own voice: [personas/run3/](personas/run3/).

The two regressions they found were fixed the same day in `5a9f352`:
- The phone stayed on "No fight right now" during the player's turn.
- The HUD's Table roll returned a 500.

Everything else they asked for is the
[Plan 128 fix wave](../../plans/00128-persona-run3-fixes.md).

## The read
- **The wizard and the phone sold the table.** Every tester built a character in the guided
  wizard and said the numbers were right. Marco checked a level-5 Paladin against D&D Beyond and
  HP, AC, saves, slots and weapon masteries all matched. Nina called the help-level question "the
  kindest thing an app has asked me". Adaeze said the phone's Now screen "will teach my kids more
  than I do".
- **The sheet it produces is incomplete.** A level-5 builder character had "No features learned
  yet": no Lay on Hands, Smite, Extra Attack or Channel Divinity. Bea's Bard finished with no
  spells, and her level-5 Fighter had no subclass. Marco's whole verdict hangs on this: "Fine for
  a level-1 one-shot. Not ready to replace DDB for a running campaign."
- **Prep is now the weakest score (2.8).** Removing AI generation left the runbook with no editor
  on the prep page. Lena: "I'd run a fight off this tomorrow. I couldn't prep a night on it."
- **The room's screen is the second gap.** The recommended Projector / TV view is black without a
  map, which is how most in-person tables and Adaeze's club play. On a stream, the landed die can
  show the wrong face to the camera.
- **The no-AI stance holds up under a hostile look.** Bea hunted page by page and found nothing
  generated. She called the game-icons.net crests and their credit line "the best thing in this
  build". The disclosure works ("saying it first turns a gotcha into a shrug"), with two edits
  (see Decisions).

## Scores (1–5)
| Persona | Onboarding | Table | Players | Prep | Looks | Value | Next session | $4/mo | Send to a DM |
|---|---|---|---|---|---|---|---|---|---|
| Nina (new player) | 4 (3) | 3 (4) | 3 (3) | 3 (3) | 4 | 4 (4) | yes | (player) | maybe |
| Sam (low vision) | 4 (3) | 4 (3) | 3 (4) | 4 (2) | 4 | 4 (3) | **yes** (was maybe) | yes | yes |
| Adaeze (library teens) | 4 (4) | 3 (3) | 4 (3) | 3 (3) | 4 | 5 (4) | **yes** (was maybe) | no (library) | yes |
| Bea (streamer) | 4 (4) | 3 (4) | 4 (4) | 3 (3) | 4 | 4 (4) | maybe | yes | yes |
| Lena (phone-only DM, new) | 4 | 4 | 4 | 2 | 4 | 3 | yes, fights only | maybe | maybe |
| Marco (DDB + Owlbear, new) | 4 | 4 | 4 | 2 | 4 | 3 | maybe | maybe | maybe |
| **Average** | **4.0** | **3.5** | **3.7** | **2.8** | **4.0** | **3.8** | 4 yes · 2 maybe | 2 yes · 2 maybe · 1 no | 3 yes · 3 maybe |

Run 2 scores for the returning four are in parentheses. Run 2 had no Looks column and asked
about $5 / $12 / $25 tiers.

Notes on the scores:
- Nina's and Bea's lower Table scores came from the two regressions fixed in `5a9f352`.
- Sam's lower Players score is the phone no longer announcing the turn (Plan 128 group B).

## What run 2 asked for, confirmed fixed by the people who asked
- Sam:
  - E ends the turn;
  - muted text at 7.5:1;
  - a labelled wizard that says why Next is disabled;
  - Escape closes things.
- Adaeze:
  - built characters carry real weapons and spells;
  - one-click "Start the fight";
  - Terms that say no cookies, no tracking and no AI;
  - the forge button is gone.
- Bea:
  - the procedural ink map replaces the AI sample map;
  - the landing has no raster art;
  - every generate button is gone;
  - the roll caption sits on a plate;
  - the last-roll chip survives a refresh.
- Nina: a creator that builds a working Paladin, with class-aware scores, real slots and feat text.

## The ONE things
| Persona | Their one thing | Where it's fixed (Plan 128) |
|---|---|---|
| Nina | The phone switches to "Your turn" or "Wolf is up" by itself | `5a9f352` |
| Sam | Say the turn out loud: a live region on the HUD and on the phone | B (phone), D1 (HUD) |
| Adaeze | Projector / TV shows a big turn order with no map, and the join QR before the fight | D2 |
| Bea | The landed die shows its result to the camera; crests on TV tokens | D2 |
| Lena | Write the runbook on the prep page, on a phone | D1 |
| Marco | Builder characters come out complete for their level, with features and uses on the phone | C1 (choices), C2 (features) |

## Other findings, grouped as they were fixed
- **A, shared accessibility (Sam, Lena):**
  - sheets, drawers and the tour take focus and give it back;
  - the closed nav drawer stops catching Tab;
  - a skip link;
  - a visible focus ring on text fields;
  - bottom sheets stay above the iPhone keyboard.
- **B, the phone, links and Terms (Nina, Adaeze, Marco):**
  - conditions at the top of Now and on the Character tab;
  - full names in the header;
  - no "Not assigned yet" greeting;
  - players can send feedback;
  - honest wording about notes;
  - a reset link no longer strands the kid it belongs to;
  - Terms covers player names, retention and under-16s;
  - the join link's code is pre-filled;
  - healing spells read as healing.
- **C1, the wizard's rules (Bea, Marco, Adaeze, Nina):**
  - subclass required at its level;
  - full cantrip and spell counts;
  - always-prepared spells come free;
  - Magic Initiate picks;
  - Fighting Style, Weapon Mastery, Expertise and Orders;
  - spell descriptions in the picker;
  - a shorter Human skills screen.
- **C2, features (Marco, Nina):**
  - the feature catalog seeds what's missing, not only into an empty table;
  - every class and subclass feature appears on the sheet and the phone;
  - Lay on Hands is on the phone;
  - Divine Smite appears only when the character has it.
- **D1, prep, the HUD and sharing (Lena, Marco, Adaeze, Sam):**
  - a runbook editor on prep;
  - characters entered from an existing sheet join the HUD party;
  - the share-link sheet works on phones;
  - the join link shows on Characters;
  - the dice button no longer covers controls;
  - the Obsidian field is hidden unless set up;
  - HUD controls have names.
- **D2, the TV (Adaeze, Bea, Marco):**
  - the no-map turn-order view;
  - crests on tokens;
  - larger name plates that the banner doesn't cover;
  - the die's face;
  - no emoji or all caps.
- **Landing (Bea):**
  - "Join the beta" in the header and "The beta is coming" in the card disagreed. The card now
    says invites go out as places open.

## Decisions for Justin
1. **The sample adventure's prose was drafted with AI coding tools.** Bea predicts a hostile chat
   asks "did a person write this?" The landing promises "No AI-written story". Either:
   - rewrite or edit the sample text yourself so the promise holds; or
   - narrow the promise to "nothing in the app writes your story" and say plainly how the sample
     was made.
2. **Bea's edits to the disclosure:**
   - drop "as most developers do now";
   - add one line on who made the words and pictures. That line depends on decision 1.
3. **Marco's fallback is a D&D Beyond import.** It's out of scope for the beta, but it's the ask
   that would move the DDB users. Note it for the roadmap's "easy to adopt" phase.
4. **Maps on the public pitch:**
   - Marco judged them "basic next to Owlbear"; Bea liked the procedural ink map.
   - The turn-order TV view (D2) gives in-person tables a reason to use the TV without maps.
