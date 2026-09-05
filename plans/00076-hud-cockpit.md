# Plan 00076 — HUD cockpit: no right column, a wide board, notes underneath

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-04 · **Implemented by:** Claude Code

## Purpose
Justin, on the Plan 75 HUD: "get rid of this whole right pane… I roll real
dice almost always… stretch the map right, then put my session notes
underneath… 3/4 of the screen can be for this." The right column held the
table dice roller, combat controls, the beats panel, the load-encounter and
add-combatant forms, and the initiative list — all of it either dice he does
not use or combat state that can live above and below the board instead.

## Shipped
- **Two columns.** Party tracker (330–380 px, 300 px when the map is
  focused) and the cockpit. The three-column grid is gone.
- **Combat bar** across the top of the cockpit: round + count (click to
  collapse the strip), ＋ Add (popover with Load Encounter, add-from-roster,
  and the manual form), 📣 Table roll (popover with the broadcast dice
  strip — kept for the rare time), End Turn, Roll Init, End Combat.
- **Initiative strip**: the same combatant rows as compact 300 px cards in a
  horizontal scroller — init edit, AC, HP −/+ with typed delta, bar,
  conditions, stat block, remove, active glow. Long names ellipsize (full
  name on hover). Collapsible.
- **Board** fills the remaining height; the live canvas letterboxes to fit
  instead of forcing a page scroll.
- **Under the board**: tonight's notes (autosaved, same editor as the dock
  and the pop-out — `components/dm/SessionNotesEditor.tsx`) on the left,
  round cards + beats on the right; a drag handle sets the height
  (persisted `ql-hud-notes-h`).
- Dropped: the bottom-bar DM dice strip and its state (real dice at the
  table; the 🎲 tray is one click away). Quick rules stay.
- `.ql-hud-root` finally bounds the HUD to the viewport (`height: 100%`
  never resolved inside the Layout main), so panes scroll internally.

## Verification
- Local (vite localhost:8000 → prod API), Session 7 with 14 combatants:
  1900×1000 — strip 99 px with all cards 87 px, board 1270×287, notes 200 px,
  beats present, no D100 roller, End Combat present, no horizontal page
  scroll. 1900×1250 — board 537 px tall. 1280×1000 — everything still
  reachable; the combat bar wraps to two rows. ＋ Add popover shows the
  encounter select and the manual form. No console errors.
- Prod: pending deploy.

## Follow-ups
- Collapse the Maps/Live/People tab row into the combat bar to buy ~45 px.
- Per-card "▶ turn" jump and drag-to-reorder initiative.
