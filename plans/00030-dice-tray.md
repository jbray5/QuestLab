# Plan 00030 — Dice Tray + Sound Effects

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-16
**Last updated:** 2026-05-16

---

## Purpose

The table still rolls real dice — but a digital tray is invaluable when:
- Someone forgot their dice
- A spell calls for 8d6 and rolling all of them by hand is tedious
- The DM wants a private roll
- You want a "wow" moment with a satisfying clatter sound + crit fanfare

Ship a small, gorgeous dice tray reachable from a floating button across
the DM-side app, with **togglable** synthesized sound effects so the
audio never surprises a table that doesn't want it.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-16
- [ ] Step 2: `lib/dice-sound.ts` — Web Audio synthesizes clatter + crit
- [ ] Step 3: `DiceTray.tsx` — floating button + tray with d4/d6/d8/d10/d12/d20/d100
- [ ] Step 4: `useDicePrefs` hook — persist sound on/off in localStorage
- [ ] Step 5: Wire crit sound into RollHelper's nat-20 path
- [ ] Step 6: Mount the floating button in `Layout` so every DM page has it
- [ ] Step 7: Quality gate + commit + push

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-16 | Sound source | (a) Bundled audio files, (b) Web Audio synthesis | (b) | Zero bundle weight, no licensing concern, scales to any sample rate, works offline. Synthesized clatter is convincing enough for an in-person table. |
| 2026-05-16 | Default state | (a) Sound on, (b) Sound off | (b) | First-load surprises annoy. The first time the user clicks 🔊 they opt in; preference persists. |
| 2026-05-16 | Where to mount | (a) HUD only, (b) Floating across the DM app | (b) | Useful on the Dashboard, encounter pages, etc. Player View is excluded — it has its own contextual dice flows. |
| 2026-05-16 | Modal vs popover | (a) Modal, (b) Inline tray | (b) | Lighter UX; rolls happen, you read result, you close. No overlay needed. |

---

## Files touched

**Frontend (new):**
- `frontend/src/lib/dice-sound.ts`
- `frontend/src/components/dice-tray/DiceTray.tsx`
- `frontend/src/hooks/useDicePrefs.ts`

**Frontend (modified):**
- `frontend/src/pages/Layout.tsx` — mount the floating button
- `frontend/src/components/character-sheet/RollHelper.tsx` — fire crit
  fanfare on nat 20 (gated by the sound pref)

---

## Outcomes and Retrospective

**Shipped 2026-05-16:**
- `lib/dice-sound.ts` — Web Audio synthesized clatter (white noise +
  triangle "ticks" + bandpass), crit fanfare (C5→E5→G5→C6 arpeggio),
  and fumble trombone (sawtooth descending from 180→70 Hz). Zero
  bundle weight, works offline.
- `useDicePrefs` hook — localStorage-backed `soundEnabled` boolean
  with cross-tab sync. Defaults to **off** so first-load is quiet.
- `useGatedSfx` — convenience hook that wraps any sound function in a
  pref check.
- `DiceTray` — floating 🎲 button in the bottom-right of every DM
  page. Click expands a small modal with d4/d6/d8/d10/d12/d20/d100
  buttons, count + modifier inputs, last 8 rolls visible. Click-outside
  + ESC close.
- RollHelper now fires `playCritFanfare` on nat 20 and
  `playFumbleTrombone` on nat 1, both gated by the persisted sound
  preference.

**Surprises:** none.

**Tech debt:** none.
