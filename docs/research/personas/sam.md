# Persona test, run 2 — Sam Whitaker (low-vision DM, keyboard-first, NVDA, 200% scaling)

Tested 2026-09-05, 19:55–20:20 CDT, about 25 minutes plus re-runs after my own scripting slips. One campaign ("Persona2 — Sam"), one arc, one Fighter, one session, one foe — all created with Tab, Enter, Space and arrows only, in headless Chrome via puppeteer `keyboard.press`. Viewports: 1366×768 for DM pages, 683×384 at `deviceScaleFactor: 2` to simulate Windows 200% on that laptop, 390×844 @2× for the phone. axe-core 4.10.2 from cdnjs (no CSP blocked it). AI budget: zero. Campaign deleted at the end, by keyboard. Screenshots: `personas2/shots/sam_NN_*.png`.

## Who I am and what I need

I'm 46, a paralegal, twelve years behind the screen, the last four with a retinal condition that took my central vision. I run Windows at 200% with high contrast on, I tab through everything, and NVDA reads me anything longer than a sentence. I can't read light grey on dark at 12 px, and a picture-only button doesn't exist for me. I need every control reachable and visibly focused, every field and button named, combat changes announced, and a layout that survives being twice as big. D&D Beyond manages most of that on the sheet and fails in the encounter tracker; Roll20 fails nearly all of it, which is why my initiative lives in a spreadsheet.

## First five minutes

`/welcome` loaded in 1,110 ms (TTFB 98 ms). The email box already had focus; Enter put me on the dashboard in 22 ms (sam_01, sam_02). The gold `:focus-visible` ring (`frontend/src/index.css:402`) showed on every one of the 300-odd stops I logged — better than either incumbent. The eight-step tour is a labelled `role="dialog"` that Enter advances, but focus never enters it: `activeElement` stayed on `<body>` all eight steps, so NVDA would say nothing (sam_03). Every DM page starts with seven sidebar stops (eleven inside a campaign) before content; no skip link. I skipped the guide; the tour repeats it.

## Keyboard-only run-through

**Campaign.** "+ New Campaign", Tab to the name, type, Tab ×4, "Create Campaign", Enter: *"String should have at least 1 character; String should have at least 1 character"* (sam_05). Only Name is starred; Setting and Tone are silently required (`domain/campaign.py:15-16`) and the form posts empty strings. Filled them, fine.

**Arc, character, session.** "+ New arc" autofocuses its title. The character form is where a keyboard user gets hurt: the first two stops are a portrait-URL box and its "Set" button, and "Set" only joins the tab order when the box has text, so the sequence shifts under you (sam_09, sam_10). All 17 fields are bare `<label>` siblings with no `htmlFor` — axe: **15 `label` + 1 `select-name` critical** (`frontend/src/pages/Characters.tsx:289-435`). NVDA reads "edit, blank" seventeen times. "Create" is `disabled` until a class is picked, so it vanishes from the Tab order with no reason; twice I landed on "Cancel" not knowing why. Driven by label it worked: Fighter, 12 HP (sam_11, sam_12). "+ Session" autofocuses; the party picker is a real wrapped-label checkbox, Space toggles (sam_13); the session card's "HUD" is a proper button (sam_15).

**HUD.** 48 stops per cycle, all findable, all ringed, none off-screen (sam_16). Roll Init: Enter, initiative 15. "＋ Add": the roster `<select>` is unnamed (axe critical), Name is placeholder-only; Bailiff added (sam_28). Damage: Enter on the HP number opens an inline input, type 7, Enter — phone read 7/12 **1.3 s** later (sam_19). Condition: "+ cond" opens a popover without moving focus; Tab reaches Poisoned, Enter applies, Escape closes; phone **1.4 s**, table too (sam_20). End Turn: table and phone changed within **1.0 s**, my poll interval (sam_21–23). N toggled the dock; with the caret in notes, "n", "t", "y" typed normally (`DmDock.tsx:105-117`). Script: the drawer opens, focus stays put, Escape does nothing (sam_25). QR: a labelled button; the table showed it in 1.5 s with `alt="QR code for https://…/join/…"` (sam_26, sam_27).

What made the run slow rather than impossible: **the only hotkey is N.** "End Turn" is the 34th stop from the top of the HUD, every combatant, every round. One key would change the night.

## Automated audit (axe-core 4.10.2, WCAG 2.x A/AA + best-practice)

| Page | Critical | Serious | Moderate | Minor | Top rule |
|---|---|---|---|---|---|
| /welcome | 0 | 0 | 1 | 0 | heading-order |
| Dashboard | 0 | 0 | 1 | 0 | heading-order |
| Characters (form closed / open) | 0 / **16** | 2 | 1 | 0 | label ×15, select-name ×1 |
| HUD 1366×768 | 0 | 22 | 1 | 0 | color-contrast ×22 |
| HUD, "＋ Add" open | 1 | 22 | 1 | 0 | select-name |
| HUD 200% | 0 | 22 | 3 | 0 | color-contrast ×22 |
| Phone sheet | **5** | 20 | 14 | 0 | color-contrast ×20, label ×5 |
| Join page | 0 | 0 | 3 | 0 | region, no main |
| Creator (Species, Background) | 0 | 0 | 3 | 0 | region, no main |
| Remote-player window | 0 | 0 | 1 | 0 | region |
| Arena | 0 | 1 | 5 | 0 | region ×4, color-contrast |

Across pages: `color-contrast` 67 nodes on 5 pages; landmarks 28; `label`/`select-name` 22; `heading-order` 3; the HUD has no h1. My walker stalled at the creator's Background step, so the skills step is unaudited (sam_31, sam_42).

## Contrast and zoom

Nearly every contrast failure is one colour: `--muted: #8a8070` on `#1e1e24` is **4.26:1** — the HUD's 12 px labels, the phone's stat captions at **10.8 px** ("HP", "AC", "Speed", "Init"), the join-code caption. Nudging the token clears 67 nodes. Also `.btn-danger` 3.2:1 and the Arena's gold "show 48" on a light strip, **1.83:1** (sam_41). No stylesheet mentions `forced-colors` or `prefers-contrast`, so Windows High Contrast repaints everything in system colours — usable, but the ring and HP colours vanish.

At true 200% on 1366×768 (sam_34–36): the sidebar collapses to a hamburger, good; "Table" and "Back" hide behind the floating "Cast" tab; the dice button sits on the party card; **Roll Init, End Turn, ＋ Add, Script, + cond and notes are all below the fold** (936 px tall, no horizontal scroll). Everything still focuses — a scrolling problem, not a loss. Browser CSS zoom (sam_37) is worse: the combat bar clips off the right edge. The phone sheet at 200% root font reflows cleanly (sam_40).

## Screen-reader sanity

- **Icon-only, no `aria-label`:** HUD "⧉", "⚔️" (class avatar), "🔗", "−", "↻", "🎭Cast", and the HP value is a button named "12"; phone "🎲". All carry `title`, which NVDA reads inconsistently. The notes handle *is* labelled ("Open DM notes" / "Hide notes"); the QR button has text.
- **Live regions:** the phone's `role=status aria-live=polite` carried "⚔ It's your turn! Round 2" and "CONDITIONS Poisoned" — genuinely good; D&D Beyond announces nothing. When the turn passed to the Bailiff, whose turn it was went unannounced (sam_29). The remote window's only live region (`TableView.tsx:233`) stayed empty through initiative, HP and turn changes. The HUD has none except toasts. Arena log is `aria-live="polite"` (`Arena.tsx:436`).
- **Portraits:** `alt={character_name}` on the phone hero, decorative `alt=""` in the HUD with the name adjacent — fine.
- **Phone headings:** one `<h1>`, nothing else; sections are `<button><strong>` with no heading level and no `aria-expanded` (`PlayerView.tsx:2083-2120`). Five `value="0"` number boxes have no name.
- **Creator:** option cards are plain buttons with no `aria-pressed`/`role="radio"`, so the chosen species isn't exposed, and names run together ("HumanMedium or Small · 30 ft.") (sam_42). "Next" disabled with a visible reason: the Plan 82 fix is real.

## Bugs

1. **Campaign create fails on blank Setting/Tone with a validator sentence.** Repro: + New Campaign, name only, Create. Expected: creates, or fields starred. Actual: sam_05. `domain/campaign.py:15-16`; `frontend/src/pages/Campaigns.tsx:40-45`.
2. **Character form: 17 unnamed fields, portrait URL first, disabled Create disappears silently.** Repro: + Add Character, Tab (sam_09, sam_10). `frontend/src/pages/Characters.tsx:289-435`.
3. **`--muted` fails AA at 4.26:1 on 67 nodes**; Arena "show N" 1.83:1. `frontend/src/index.css`; `Arena.tsx` `.ar-back`.
4. **Tour never takes focus** — `<body>` focused all eight steps (sam_03). `TourGuide.tsx`.
5. **Script drawer and condition popover don't move focus; Script ignores Escape** (sam_25). `SessionHud.tsx:681`.
6. **Remote-player window announces nothing** during a turn change (sam_22). `TableView.tsx:233`.
7. **HUD "＋ Add" roster select unnamed** (axe critical). `SessionHud.tsx` ~1800.
8. **No key for End Turn** — 34 tabs per turn. Not a spec violation; the thing that decides whether I can run a night.
9. **HUD at 200%: "Table"/"Back" behind the Cast tab; combat controls below the fold** (sam_34).

Fixed since run 1: delete is transactional (character, session and `/play` all 404 in 2.5 s, sam_43–44); conditions reach phone and table; the creator explains a disabled Next.

## Scores (1–5)

- **Onboarding: 3** — the email box is focused for me, the tour isn't, and the first form fails with a validator's sentence.
- **Table experience: 3** — everything reachable and visibly focused, which is rare; but 34 tabs per turn and a mute remote window.
- **Player experience: 4** — the phone announces my turn and conditions in about a second; that beats both incumbents.
- **Prep: 2** — the character form is the worst screen for me, and the first one I need.
- **Value: 3** — for free, the bones are unusually right: global focus ring, real buttons, labelled QR.

*Would you use it for your next session?* **Maybe.** I ran a combat with only a keyboard tonight, but I'd want a player to enter the sheets and an End Turn key first.

*Would you pay?* $5 Hearth: **maybe** — yes once the label and contrast fixes ship; an afternoon's work. $12 Lantern: **no**, art doesn't help me. $25 Table: **no**.

**The ONE thing:** one keypress for End Turn (then the `--muted` token and `htmlFor` on the character form). Give me a key and I stop counting tabs.

## Verdict

I expected Roll20 — a canvas of unnamed things. I found a React app with a focus ring on everything, real buttons under most of the emoji, and a phone sheet that speaks when it matters. I built a campaign, a character and a session, rolled initiative, dealt damage, poisoned a fighter, passed a turn and put the QR on the TV without a mouse, and each change reached the phone in 1.5 s or less. The bad news is concentrated and cheap: one colour token, one form's labels, a tour and a drawer that don't take focus, a silent remote window, and no hotkey for the action I take fifty times a night. Fix the token and the form and I'm at $5; add the key and I'm at yes for next Thursday.
