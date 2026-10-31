# Persona test, run 3: Sam Whitaker (low-vision DM, keyboard only, NVDA, 200%, high contrast)

Tested 2026-10-31 on the local build (localhost:5173). Everything was done with Tab, Shift+Tab, Enter, Space, arrows, Escape and E, in headless Chrome driven by Playwright `keyboard.press`. Viewport: 640×400 CSS at `device_scale_factor=2` (a 1280×800 laptop at Windows 200%), with `forced_colors="active"` for high contrast and `color_scheme="dark"`. For the contrast score I repeated key screens with forced colours off. The phone was 390×844 @2×. To hear what NVDA would hear, I read Chrome's accessibility tree for the focused element over CDP (`Accessibility.getPartialAXTree`) at every stop, and ran axe-core 4.10.2 from cdnjs. Account: `persona3-sam@questlab.test`. I used the sample campaign and added one character, Marta Vey (level 5 Dwarf Fighter). Scripts, logs and screenshots are in `F:\Temp\claude\c--Users-justi-OneDrive-Projects-questlab\f74a91d3-757b-451c-8465-a81ce92909b9\scratchpad\personas3\sam\` (screenshots under `shots\`). The "Open Tanstack query devtools" button and the palm-tree bubble only exist in the dev build, so I ignored them.

## 1. Who I am

I'm 46, a paralegal, twelve years behind the screen. For the last four of them a retinal condition has taken my central vision. I run Windows at 200% with high contrast on, I tab through everything, and NVDA reads me anything longer than a sentence. A control I can't reach doesn't exist for me, and neither does one without a name.

## 2. Since last time

**Better, and it's a lot:**
- **E ends the turn** and Shift+E undoes it. That was my ONE thing. It works from anywhere outside a text box, and once the fight starts the combat bar sticks to the top, so "End turn →" stays on screen at 200% (s2b_after_E_forced). I stopped counting tabs.
- **Contrast is fixed.** `--muted` went from 4.26:1 to **7.56:1** on the background (7.15:1 on cards). axe found **zero** `color-contrast` failures on the six pages I scanned (Welcome, Dashboard, Characters, Wizard, HUD in combat, phone). In run 2 it found 67 nodes.
- **Character creation is the screen it should be.** "Add character" opens the guided wizard. Every field has a real label, every card and chip has `aria-pressed`, and the "why Next is disabled" hint is a `role="status"`. The ability score improvement step reads "Strength 17 → 19, pressed" after you pick it. The old 17-unlabelled-field form is now tucked away as "Enter an existing sheet".
- Chrome's accessibility tree showed **no unnamed controls** on any page (excluding the dev button). The roster select and the placeholder-only fields from run 2 are gone.
- Escape now closes the Script drawer and the tour. "Condition" exposes `aria-expanded`, and Tab goes straight into the condition list.

**Worse:**
- **The phone stopped saying "It's your turn."** In run 2 it announced "It's your turn! Round 2" within about a second. Now the big "Your turn" card appears but nothing is spoken (details in Bugs).
- "Run the sample night" now opens the HUD with the Script drawer already showing. At 200% it covers the whole HUD, and focus doesn't go into it.

**Still the same:** the tour never takes focus, there's no skip link, and focus is dropped after most actions.

## 3. First five minutes

The invite link greeted me by name: "You're invited to the QuestLab beta, Sam." It's a `role="status"`, so NVDA would read it, and the invite code was already filled in. Nothing had focus on load. The first Tab went to the site's top links and the eighth reached "Your name". Name, email and password are properly labelled and Enter submits. The account was created in 2.6 s.

Then focus fell to `<body>` on the dashboard while the eight-step tour opened over the bottom half of the screen. The tour's ✕/Skip/Next are the **last** stops on the page, 20 tabs in, behind 8 invisible menu links (s1_landing_after_tabs_forced). Escape got rid of it, which I'd have tried first anyway.

At 200% the type is big and calm. IBM Plex reads cleanly, and the orange "Run the sample night" button is the first thing my peripheral vision finds (s2_dashboard_normal).

## 4. Running the sample night (HUD, keyboard only)

- **Arrival.** Enter on "Run the sample night" took 4 s and landed on `/hud?script=1`. The Script drawer filled the screen (s2_after_sample_forced), but focus stayed on the page behind it. Its Close button is stop **88**, after every hidden HUD control. Escape closes it, and that's the only reason I got past it.
- **Start the fight** is stop 61 from the top: 10 menu stops, 7 header buttons, then four party cards of about 9 stops each. Enter rolled initiative, and focus moved sensibly onto "Re-roll init" (s2b_after_start_forced). **E** advanced Tessa → Lira → Aldous → Bram, each in under a second. "End turn →" is a real button with focus kept on it, and its title says "(E)". Nothing visible or `aria-keyshortcuts` tells you the key exists, though.
- **Nothing on the HUD says whose turn it is.** The active row has `aria-current` and a "Their turn" label, which survives high contrast as text. But the HUD's only live region is the rest toast. After E, NVDA says nothing at all, so I have to tab back into the tracker to find out who's up.
- **HP.** Each tracker row has a spinbutton named "Damage or healing amount for Tessa Quickfoot". I typed 5, pressed Shift+Tab to "−" and Enter, and she went from 10/10 to 5/10 (s2b_after_damage_forced). But the row's buttons are named just "−" and "+". On the party cards, the field is "Damage or healing amount" with no name of who, and the hit points button is named only "14". Pressing Enter on that opens an inline editor with **no name at all**.
- **Conditions.** "Condition" (expanded=true) → Tab → Blinded, Charmed… → Poisoned → Enter applied it (s2b_condition_open_forced). Then **focus dropped to `<body>`**, so my next Tab started at the top of the HUD again.
- **Share player link** opens a popover with the link. It's fine.

## 5. Making a character with the DM's wizard (level 5, with the improvement)

"Add character" is stop 19 on Characters, 13 of them invisible menu links. Character name had focus on arrival. Player name and "Starting level" are labelled, and ArrowDown ×4 set Level 5. Then: Dwarf, then Fighter and Champion (the subclass appears because of level 3+), then Soldier with +2 Strength and +1 Constitution. Standard array came pre-filled, Acrobatics and Insight for skills, then **Improvements, step 7 of 9**. "Level 4, Not chosen yet" is expanded, with "Ability Score Improvement" (pressed) → "+2 to one" → "Strength 17", which re-announces as "Strength 17 → 19, pressed". That gave "Done", then Spells (none for a Fighter), then Review, then "Create character". The result: Marta Vey, level 5 Dwarf Fighter, STR 19, HP 49, AC 16 (s3_after_create_forced). It was **all reachable by keyboard, all named and correct.** Two things made it slow:
- **Focus drops to `<body>` after Next** on every step whose Next starts disabled, which was 6 of 8. The only thing NVDA would say is the hint ("Pick a species."), which is genuinely helpful. But the next Tab starts back at the hamburger and the hidden menu: Dwarf was 20 tabs away, Fighter 23, the first skill 18. On steps where Next stays enabled, focus stays on Next and nothing announces that the step changed. The step's h2 should get focus.
- At 200%, the **sticky footer (hint + Back/Next) takes a quarter of the screen**, and the browser doesn't scroll the focused card clear of it. The focused ASI card, the Fighter card and the first four skill chips were all partly hidden behind it (s3c_asi_focus_covered_forced).

## 6. Feedback, contrast and type for low vision

**Send feedback** is the last item in the menu. I opened the menu (focus stays on the hamburger and the next Tab goes into the menu, which is fine), then Send feedback, then Enter. A proper `role="dialog"` with `aria-modal="true"` named "Send feedback" opened. But **focus stayed on the menu button underneath**, and Tab walked 11 dashboard controls behind the sheet before reaching its Close (s4_feedback_open_forced). The textarea is labelled "What would make your next session easier?" and the button says "Send to Justin". After sending, "Thank you. It went straight to Justin…" appears, but focus fell to `<body>` and nothing was announced (s4_feedback_sent_forced). My note was real: the E key is right, but the turn is silent, text fields lose the ring, and the closed menu's links eat my Tab key.

**Score: contrast 5/5, type 4/5, high contrast 4/5.**
- Text is 14.9:1, muted labels 7.56:1, orange accent text 8.7:1, and the primary button's dark ink on orange 6.9:1.
- Plex at 200% is large and open. Alegreya for names is readable at heading sizes. The italic placeholder is about 4.9:1. It's italic on purpose so it can't pass for a typed value, which I appreciate.
- There's no `forced-colors` CSS, but because the focus ring is an `outline` (not a box-shadow) it survives high contrast as a 2px system-colour ring on every button. Disabled buttons go to GrayText, which is correct.
- What's lost in high contrast: the HP bars disappear (the number stays), the orange "active turn" card is just a white border (the "Their turn" text stays), and the dimmed page behind a modal goes dark grey.
- The weak spot is **text fields**. `input:focus { outline: none }` with a 1px orange border and a 22%-opacity glow (`frontend/src/index.css:280-284`). In normal colours that's faint. In high contrast it's a 1px line (s1_form_filled_forced, s2b_hp_field_focus_forced). Every other control has the ring and text fields don't.

**Controls I couldn't reach:** none. Everything I needed was in the Tab order.
**Controls with no name, or a name that's only a symbol or number:**
- the party card's inline HP editor (no name)
- the tracker rows' "−" and "+"
- the party card HP buttons "14", "11", "8", "10"
- the party card field "Damage or healing amount" (doesn't say whose)
- the tour's close button, named "✕"
- 27 `aria-label`s on plain `<span>`s in the HUD ("Armor class 18", "Passive Perception 13"…), which axe flags as `aria-prohibited-attr` because screen readers ignore them.

## 7. Bugs (ranked by how much they'd hurt at a real table)

1. **Turn changes are silent on both the HUD and the phone** (the phone part is a regression from run 2).
   - Repro: run the sample night, Escape the script, Start the fight, press E.
   - Expected: something polite, like "Round 1, Lira Vell's turn".
   - Actual: every `aria-live` region stays empty on the HUD (s2b_after_E_forced). On the player's phone the "Your turn / Round 2" card renders (s5_phone_your_turn_normal) but nothing is announced. The phone's only live region (`Notices`, `frontend/src/pages/player/PlayerApp.tsx:235-238`) is only mounted when a server notice exists (`if (notices.length === 0) return null`), so it can't announce reliably, and "Your turn" (`NowTab.tsx:130`) is a plain span.
2. **Dialogs and drawers don't take focus, and focus is lost after actions.**
   - (a) The Send feedback sheet (`aria-modal="true"`) leaves focus behind it: 11 stops to its Close. After Send, focus goes to `<body>` and "Thank you" isn't announced (s4_feedback_open_forced, s4_feedback_sent_forced).
   - (b) The sample night opens the Script drawer over the HUD with focus outside it: Close is stop 88 (s2_after_sample_forced).
   - (c) The tour still never takes focus (s1_landing_after_tabs_forced).
   - (d) Applying a condition drops focus to `<body>`.
   - (e) The wizard's Next drops focus to `<body>` on 6 of 8 steps.
3. **The closed navigation drawer stays in the Tab order at 200%, Escape doesn't close it, and there's no skip link.**
   - Repro: at 640×400, Tab from the top of any page.
   - Actual: 8 invisible links on the dashboard and 13 inside a campaign (Dashboard … Send feedback) before any content. In the drawer, Escape leaves it open (s4_menu_open_forced).
4. **Text fields have no real focus ring:** `outline: none` with a 1px border change (`index.css:280-284`). In high contrast it's a 1px line (s2b_hp_field_focus_forced). It matters most on the HP field, where I type during every fight.
5. **HP controls are poorly named on the HUD.** The party card HP button is named "14", and Enter opens an inline spinbutton with no name. The tracker's "−"/"+" are named by symbol alone. The party card field "Damage or healing amount" doesn't say whose. There are also 27 prohibited `aria-label`s on spans.
6. **At 200% the sticky wizard footer and header hide the focused card** (WCAG 2.4.11). Repro: Add character, step 7, Tab to "Ability Score Improvement" (s3c_asi_focus_covered_forced). Adding `scroll-padding` would fix it.
7. **The phone uses the first word of the character's name.** "Take me to Brother" and a header reading "Brother" for Brother Aldous (`PlayerApp.tsx:220`; s4_phone_forced, s5_phone_your_turn_normal). The phone also has no headings at all (axe `page-has-heading-one`), so NVDA's H key finds nothing.
8. **The E shortcut is invisible.** It's only in `title`, with no `aria-keyshortcuts` and no hint on the button. I knew about it because I asked for it. Another DM won't.

## 8. Scores (1–5)

- **Onboarding: 4.** The invite greets me in a live region, the fields are labelled and Enter works. Focus is lost after signup and the tour doesn't take it.
- **Table: 4.** E is the change that matters, the combat bar stays on screen and conditions are reachable. The HUD never says whose turn it is, and HP controls are named "14" and "−".
- **Players: 3.** The phone's "Your turn" is huge and clear to look at, but it went silent, and there are no headings.
- **Prep: 4.** It was a 2. The wizard is labelled and checked, and the ASI step works by keyboard. Focus is dropped after Next and the footer covers the focused card at 200%.
- **Looks: 4.** Contrast is now excellent and the type is calm and big. Text fields lose the ring.
- **Value: 4.**

*Next session:* **yes.** I can run the whole fight with E, Tab and the number boxes, and a player can build their own sheet.
*Would I pay $4/month:* **yes.** In run 2 I said yes once the label and contrast fixes shipped. They shipped.
*"I'd send this to another DM":* **yes**, to sighted DMs and low-vision DMs like me, with a warning. I wouldn't yet hand it to a blind *player*, because their phone won't tell them it's their turn.

## 9. The ONE thing

**Say the turn out loud.** Keep one polite live region on the HUD and one on the phone, always present, and write "Round 2, Brother Aldous's turn" (and "Your turn" on that player's phone) into them when the turn changes. E fixed my hands. This would fix my ears.

## 10. Verdict

Two months ago I wrote that the bad news was concentrated and cheap. Most of it got paid. There's a key for End turn, the muted colour now reads 7.5:1, the character builder is labelled and tells me why Next is greyed out, and Escape closes things. I built a level 5 Fighter with an ability score improvement, ran a fight, dealt damage, poisoned a fighter and sent feedback, all without a mouse, at 200% in high contrast, and never hit a control I couldn't reach. What's left is a different, smaller kind of problem: focus. Sheets and drawers open without taking it, actions drop it on the floor, and the closed menu keeps stealing Tab presses. Under that sits silence, the one place the app went backwards: whose turn it is is no longer spoken, not even on the phone, which used to do it best. Fix the turn announcement and move focus into what opens, and this is the only VTT-adjacent tool I'd recommend to my low-vision group without an apology.
