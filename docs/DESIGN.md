# QuestLab design system — "Lamplit"

The look of every QuestLab screen. Chosen by Justin on 2026-10-30 (Plan 121) after the
public review said the old look (carved Cinzel capitals, red and gold on purple-black, emoji
icons, glows) read as AI-generated. Lamplit blends two directions: **"Console" for the tools,
"Lantern" for the story.**

> The tools stay out of the way; the story is set like a book.

All colors, fonts and base components live in `frontend/src/index.css` (`:root` tokens and the
classes below it). Pages should use the tokens (`var(--…)`) and classes, never new hex values.

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
