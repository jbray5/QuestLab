# QuestLab design system — "Lamplit"

The look of every QuestLab screen. Chosen by Justin on 2026-10-30 (Plan 121) after the
public review said the old look (carved Cinzel capitals, red and gold on purple-black, emoji
icons, glows) read as AI-generated. Lamplit blends two directions: **"Console" for the tools,
"Lantern" for the story.**

> The tools stay out of the way; the story is set like a book.

All colors, fonts and base components live in `frontend/src/index.css` (`:root` tokens and the
classes below it). Pages should use the tokens (`var(--…)`) and classes, never new hex values.

---

## 0. Principles: a companion that grows with you

Justin, 10/30: the player phone should be "the ideal companion app for new-ish players as they
grow into experienced ones" — and "keep those principles as you review the entire app." Every
screen, DM or player, is checked against these before it is called done:

1. **Grows with the person.** New users get plain words, explanations and suggestions; experienced
   users get density and speed. Where it matters, a **help level** (Teach me · Remind me · Just the
   numbers) decides how much is explained, and the app offers to step it down as they use it.
2. **Plain words first.** Spell it out ("Armor Class", "Passive Perception"); short forms only in
   dense, labeled tables, with the full name a tap or hover away. Sentence case, never ALL CAPS.
3. **The moment decides the screen.** Lead with what matters *now* (your turn, the next session,
   the fight in progress); everything else is one tap away, not scrolled past.
4. **Every number is a verb.** If you can roll it, tap it to roll; if you can spend it, tap it to
   spend; if it's computed, tap it to see why.
5. **Nothing important is buried.** The common action is the most visible one; rare actions live
   in a ⋯ menu; teaching aids sit next to the thing they explain, never in a collapsed appendix.
6. **Tell people what happened.** Loot, turns, damage, invites and rolls arrive with a notice that
   says who did what — never a silent refetch.
7. **Real dice and the shared room come first.** Typing a real die is always an option; rolls and
   big moments can show on the TV.
8. **Thumb-sized and forgiving.** Touch targets ≥ 44 px; undo where a tap spends something.
9. **No dead ends.** Every screen has a way back; every empty state says what it's for and the one
   next step.

---

## 1. The one rule: tool or story?

Before styling any text, ask whether it is **part of the tool** or **part of the fiction**.

| Tool (Console) | Story (Lantern) |
|---|---|
| Navigation, buttons, menus, form labels, column headers, help text, page titles like "Sessions" | Campaign, arc and session names; character, NPC, monster and place names |
| Numbers: HP, AC, initiative, DCs, dice totals, gold, dates | Read-aloud text, recaps, quotes, lore, item flavor text |
| `var(--font-ui)` IBM Plex Sans; numbers `var(--font-mono)` IBM Plex Mono | `var(--font-story)` Alegreya, or the `.story` class |

Session numbers are Roman numerals in Alegreya (I, II, III). One ornament (a small diamond rule)
per page at most, and only in story territory (read-aloud boxes, a landing section break).

## 2. Color tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#111513` | page ground |
| `--surface` | `#161B19` | panels, cards |
| `--surface2` | `#1B211E` | insets inside panels, table header bands, stat tiles |
| `--surface3` | `#232B28` | neutral pills, hovered rows |
| `--border` | `#29312E` | hairlines, panel edges |
| `--border2` | `#38423E` | control outlines (buttons, inputs) |
| `--text` | `#ECE7DA` | body text (parchment) |
| `--text2` | `#CBC6B8` | secondary text |
| `--muted` | `#A2A89C` | labels, captions (passes 4.5:1 on every surface) |
| `--accent` | `#E3863A` | lantern orange: the ONE primary action per view, and what is live now (current turn, "Up next", "Run") |
| `--accent-text` | `#F0A062` | orange text: links, eyebrow labels, "Their turn" |
| `--accent-ink` | `#1B0F05` | text on an `--accent` fill |
| `--accent-soft` | `#231D14` | a lit row/card background (the live thing) |
| `--accent-line` / `--accent-edge` | `#5C3F22` / `#8A5A2E` | borders of a lit row / lit card |
| `--teal` / `--teal-soft` / `--teal-text` | `#5FB8AD` / `#1C3631` / `#8FD6CB` | healthy HP, healing, "Complete", success |
| `--amber` / `--amber-soft` / `--amber-text` | `#E3B04A` / `#3A2A12` / `#F4C27F` | bloodied HP (≤ half), conditions, warnings |
| `--danger` / `--danger-soft` / `--danger-text` / `--danger-line` | `#E0604F` / `#3A1E1A` / `#F09A8C` / `#6B2E26` | critical HP, foes, deleting |
| `--story-bg` / `--story-line` / `--story-text` | `#1C1914` / `#3A3123` / `#E8DFC9` | read-aloud and other story panels |

Orange is rare on purpose: if everything glows, nothing is live. Health is teal → amber → red
(they differ in lightness too, so they read without color vision). Never red/green alone.

**Legacy names** (`--gold`, `--gold2`, `--crimson`, `--crimson2`, `--parch`, `--green2`,
`--yellow`, `--red`, `--text-muted`, …) still resolve, mapped to the nearest Lamplit role, so
pages not yet revisited stay readable. `--gold` is now a warm emphasis parchment, not an accent:
when a page is revisited, anything that was gold because it is live/clickable becomes
`--accent-text`; anything gold for emphasis becomes `--text`.

## 3. Type

- Root size 16px. UI text 15–16px; captions 13px; never below 12px.
- `h1`/`h2`/`h3` default to **Plex Sans 600** (they are usually tool titles). Add `className="story"`
  when the heading is a fiction name ("The Kettle Job", "Sable Quickstep").
- Numbers that change or line up (HP, AC, initiative, totals): `className="num"` (Plex Mono, tabular).
- No letter-spaced uppercase labels except tiny table column headers; sentence case everywhere.

## 4. Components (classes in index.css)

- `.btn` + `.btn-primary` (orange fill, one per view) / `.btn-secondary` (neutral outline) /
  `.btn-ghost` (no outline) / `.btn-danger` (red outline, only inside a ⋯ menu or a confirm).
- `.card` — `--surface`, 1px `--border`, radius 10, no glow, no hover lift.
- `.pill` + `.pill-live` / `.pill-teal` / `.pill-amber` / `.pill-danger` — status chips.
  Session status badges (`.badge-draft/ready/progress/complete`) use the same palette.
- `.read-aloud` — story panel, Alegreya italic, no left border stripe.
- `.eyebrow` — small orange label above a heading.
- `.ql-table` — Console table: column header row, hairline rows, `.lit` row for the live one.

## 5. Icons

Line icons from `lucide-react` (already a dependency), 16px in nav and buttons, stroke 1.8
(set globally in index.css). **No emoji as icons** — not in nav, buttons, headings or status.
An icon-only button needs `aria-label`. Typographic marks that are text (×, →, ·, –) are fine.

**Class crests** (Plan 127): a character without a picture wears its class crest: `components/ClassCrest.tsx`, with
glyphs in `lib/classGlyphs.ts` and class colours `--class-<name>` in index.css. The glyphs are drawn by people
(game-icons.net, Lorc and Delapouite, CC BY 3.0, credited on the Terms page), never emoji and never generated.
`Monogram` (both versions) takes `cls` and falls back to initials for NPCs and unknown classes.

## 6. Don'ts (the "AI look")

Gradient washes, glows and text shadows on UI; cards with a colored left border; emoji icons;
decorative capitals; everything in the accent color; hover lifts on static cards; letter-spaced
uppercase headings. Motion belongs to moments (a turn change, a crit, the landing hero), never
to the tools' chrome. Respect `prefers-reduced-motion`.

## 7. Surfaces

- **DM screens** (prep, HUD, tracker): mostly Console — dense, labeled, mono numbers.
- **Player phone and the table TV**: lean Lantern — bigger story names, a warm glow on "your turn".
- **Public pages** (`/try`, `/welcome`): the drawn night scene hero (parallax, fireflies) and
  the DM-screen/tracker story. Never pitch the private 3D table or VTT gameplay.

## 8. Phones (Plan 123)

Every page works one-handed at 390 px, and nothing changes on a laptop. Phone behaviour switches
at **640 px**, through `useIsCompact(640)` or `@media (max-width: 640px)`. The older breakpoints
stay where they are: 900 for the nav drawer and 820 for the HUD's stacked panes. Check a page with
the sweep (`scratchpad/mobile_sweep.py OUTDIR [route] [width]`). It measures with the
`overflow-x: hidden` safety net switched off, so anything too wide shows up.

**Building blocks in `index.css`:**

| Class / component | Desktop | Phone |
|---|---|---|
| `.ql-page` (`--page-max`) | centred column, 1.5rem padding | no extra padding; `<main>` gives the 16 px gutter |
| `.ql-filters` (+ `.ql-filter-wide`) | search widest, then the selects | search on its own row, two selects per row |
| `.ql-split` | list beside its detail | one column; the detail opens in a `PhoneSheet` |
| `.ql-actions` | header actions, right-aligned | left-aligned, wrapping |
| `.ql-scroll-x` | a row meant to scroll sideways (chips, tabs) | same |
| `.ql-table-wrap` | table scrolls inside its box | same, though stacked cards are better for anything read at the table |
| `.ql-hide-phone` / `.ql-only-phone` | — | hide / show |
| `PhoneSheet` | — | bottom sheet with a title and close button, portalled to `<body>`, z 9000 |
| `HudMenu` | dropdown | bottom sheet |

**Rules:**
- Tap targets are at least 44 px tall. Text fields are 16 px, so iOS doesn't zoom on focus.
- No textarea narrower than its column, and give it about 5 rows.
- Lists put the name on line 1 and the meta on line 2. Make the whole row the button rather than
  squeezing one in.
- List → detail opens a sheet, so the list keeps its scroll position.
- Fixed things (the dice button, side tabs, toasts) never cover content or each other.
- Keep every function reachable. A feature may stay desktop-only only when it really needs the
  room, such as map painting or the 3D board, and then say so on screen ("needs a bigger screen").
- No WebGL on list or character pages (iOS Safari crashed with four previews; see TD notes).
