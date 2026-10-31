# Plan 00123 — Phone-friendly pass over the whole app

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-31
**Last updated:** 2026-10-31 (all page groups done)
**Implemented by:** Claude Code

---

## Purpose
Justin (10/31, with four iPhone screenshots): "can you make a pass at making the whole app mobile
friendly?" The player phone (Plan 122) was built for phones; the DM side and the compendium were not.
On a 390 px iPhone today:
- the HUD's "Player display" menu opens off the left edge;
- the Monster Compendium's search box shrinks to two letters, its filters and "View Stats" buttons
  poke out of their cards;
- Magic Items squeezes a list and a detail pane side by side, so the names wrap word by word and the
  rarity badges are cut off;
- the welcome tour's card starts at mid-screen and runs off the right edge.

After this plan every page reads and works one-handed at 390 px, without losing anything on a laptop.

The root causes:
- `html, body { overflow-x: hidden }` hides anything too wide instead of letting the layout reflow.
- Pages use inline fixed-width rows and grids, and pad themselves on top of `<main>`'s own padding.
- Menus and popovers are positioned for a desktop.
- The tour card's centering `transform` is overridden by the `ql-modal-in` entrance animation.

Principles: `docs/DESIGN.md` §0 (thumb-sized targets, nothing important buried, no dead ends).

---

## Progress
- [x] S1 Sweep tool: every route at 390×844 with overflow measured with clipping turned off
      (`scratchpad/mobile_sweep.py`); before shots in `scratchpad/mobile_before/`
- [x] S2 Foundation in `index.css`:
  - phone utilities: `.ql-page`, `.ql-filters`, `.ql-split`, `.ql-actions`, `.ql-sheet`,
    `.ql-scroll-x`, `.ql-hide-phone` / `.ql-only-phone`;
  - inputs never wider than their box;
  - a 16 px gutter.
- [x] S3 Shared pieces:
  - `HudMenu` becomes a bottom sheet on phones;
  - the tour card is centered for real and becomes a bottom sheet on phones, with no spotlight on
    hidden targets;
  - a `PhoneSheet` component for list → detail pages.
- [x] S4 Compendium (Monsters, Magic Items, Spells, Weapons, stat block), Admin, Guide and Terms
- [x] S5 HUD, Prep, notes window, dice tray and DM screen
- [x] S6 Campaigns, Dashboard, Adventures, Sessions, Characters, character sheet, NPCs, Encounters
      and the builder, Battle Maps, Map Builder
- [x] S7 Shops, Puzzles, Town Crier, Notebook, and a re-check of the player satellites (Join, Creator,
      Market, Storefront, Arena, Level-up)
- [x] S8 After-sweep: no element sticks out at 390 px; 1280 px screenshots unchanged in layout; gates
- [x] S9 Docs: DESIGN.md §8 "Phones"; QUALITY.md
- [ ] S10 Justin approves the push (not on a game night)

---

## Surprises and Discoveries
- 10/31: the sweep reported "no overflow" on every page because `html, body { overflow-x: hidden }`
  clips it; the tool now turns clipping off while it measures.
- 10/31: the tour card's `left:50%; top:50%; transform: translate(-50%,-50%)` is overridden by the
  `ql-modal-in` animation (fill-mode `both` keeps its own `transform`), so the card started at the
  centre point on every screen size — off-screen on a phone.
- 10/31: the Magic Items empty state still says "generate adventure lore" while AI features are off.
- 10/31 (S4): /try's tracker mock was 600 px wide inside a sideways scroller, so on a phone its
  hit points and End turn were cut off; phones get a 3-column version.
- 10/31 (S5): the HUD root's fade-in makes a stacking context, so the sticky phone top bar painted
  over full-screen modals; DmScreen and MonsterStatBlock portal to `<body>` on phones.
- 10/31 (S6): Map Builder dungeon rooms had no door handles (doors never drew), and opening any
  map logged an endless "Maximum update depth" loop; both fixed with the Lamplit rewrite.
- 10/31 (S7): a campaign with no notebooks showed "Loading…" forever; the phone rule
  `min-width: 0` shrank checkboxes and radios (now excluded).

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-31 | List → detail on phones | stack both / detail in a bottom sheet / separate route | bottom sheet | Keeps the list position, one tap back, no new routes |
| 10-31 | Menus on phones | clamp the popover / bottom sheet | bottom sheet | Long hints need the width; thumb reach; no edge maths |
| 10-31 | Phone breakpoint | 640 / 820 / 900 | 640 for layout and sheets; the existing 900 for nav chrome and 820 for the HUD stay | Matches `.grid-2`/`.grid-3`; tablets keep desktop layouts |
| 10-31 | Overflow guard | keep `overflow-x: hidden` / remove | keep it | A safety net for real users; the sweep measures without it |

---

## Context and Orientation

### Files touched
`frontend/src/index.css`, `frontend/src/pages/Layout.tsx`, `frontend/src/components/hud/HudMenu.tsx`,
`frontend/src/components/tour/TourGuide.tsx`, `frontend/src/components/PhoneSheet.tsx` (new), and the
page files listed in S4–S7. Frontend only: no API, schema or auth change.

### Architecture layers involved
pages / components (React) only.

### Key terms defined
- **Phone width**: ≤ 640 px CSS (iPhone 390–430).
- **Sweep**: `scratchpad/mobile_sweep.py OUTDIR [filter] [width]`, which logs in as the local DM, loads
  each route, removes the overflow clip, and lists elements past the screen edge or their card's
  edge, squeezed inputs (< 90 px) and small tap targets.

---

## Concrete Steps
1. Run the sweep before (`mobile_before/`).
2. Build S2–S3.
3. Run the page groups S4–S7 in parallel. Agents never commit or stash; each group has its own CSS
   block at the end of `index.css`.
4. Run the sweep after (`mobile_after/`) and a 1280 px pass.
5. `npm run build`, `npm run lint` (no new errors), `pytest -q`; commit per group.

---

## Validation and Acceptance
- [ ] At 390×844 the sweep lists no element past the screen edge on any route, and no input under 90 px.
- [ ] Menus open as bottom sheets and close by tapping outside or with a pick.
- [ ] The tour card is fully on screen at 390 and centered at 1280.
- [ ] Compendium detail opens in a sheet with a close button; the list keeps its scroll position.
- [ ] At 1280×800 every page's layout matches the before shots.
- [ ] `npm run build` passes, there are no new lint errors, and `pytest -q` is green.

---

## Idempotence and Recovery
CSS and component changes only; each group is its own commit and can be reverted alone.

---

## Interfaces and Dependencies
**Produces:** the phone utility classes and the `PhoneSheet` component (documented in DESIGN.md).
**Depends on:** Plan 121 tokens; `hooks/useIsCompact.ts`.

---

## Outcomes and Retrospective
_Fill in after completion._
