# Plan 00036 — Guided New-DM Tour

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-17

---

## Purpose

A brand-new DM lands on the dashboard with no campaigns and no idea
where to start. Add a guided spotlight tour that:

1. Auto-launches on first sign-in (when no campaigns exist).
2. Walks through the mental model — campaign → adventure → session,
   plus characters / NPCs / encounters / HUD.
3. Spotlights real UI elements (sidebar nav items, dice tray) so the
   DM sees where things actually live.
4. Skippable; "Don't show again" persists.
5. Re-launchable from a 🧭 button in the sidebar any time.

---

## Progress

- [x] Step 1: Plan doc
- [ ] Step 2: `useTourStore` — Zustand, persisted `completed` flag,
  open / step / next / prev / close actions
- [ ] Step 3: `TourGuide` component — overlay with SVG spotlight cutout
  + tooltip card. Recalculates on resize.
- [ ] Step 4: Tour data — 10 steps mixing centered cards + sidebar
  spotlights
- [ ] Step 5: Auto-launch on Dashboard when not completed; 🧭 button in
  sidebar to restart
- [ ] Step 6: tsc + commit + push

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-17 | Library vs hand-rolled | Shepherd.js / Intro.js / Driver.js / our own | Hand-rolled | All three are 15–30 KB + opinionated styling. Our own is ~150 lines + matches the QuestLab aesthetic out of the box. |
| 2026-05-17 | Auto-launch trigger | First sign-in / on every dashboard / never | First sign-in only | Less annoying. Returning DMs aren't bothered. Re-launchable via sidebar 🧭. |
| 2026-05-17 | Navigation between steps | Auto-navigate the user / stay on dashboard | Stay on dashboard | Auto-nav breaks the spotlight (target disappears). The tour describes pieces; the DM clicks the actual buttons when ready. |
| 2026-05-17 | Persistence | localStorage on dismiss / Zustand persist | Zustand persist | Same pattern as auth + dice prefs. One storage key. |

---

## Files touched

- `frontend/src/stores/useTourStore.ts` (new)
- `frontend/src/components/tour/TourGuide.tsx` (new)
- `frontend/src/components/tour/tour-steps.ts` (new) — content data
- `frontend/src/pages/Dashboard.tsx` — auto-launch when no campaigns + flag unset
- `frontend/src/pages/Layout.tsx` — mount `<TourGuide />` + sidebar restart button

---

## Outcomes and Retrospective

**Shipped 2026-05-17:**

- `stores/useTourStore.ts` — Zustand store with persisted ``completed``
  flag. Open / step / next / prev / close / reset actions. Only
  ``completed`` is persisted; the open-state is ephemeral so a reload
  doesn't trap the user in a half-finished tour.
- `components/tour/tour-steps.ts` — 10 steps walking the mental model
  (welcome → sidebar → campaigns → adventures → PCs → NPCs →
  encounters → sessions/HUD → dice tray → "click 🧭 to replay").
- `components/tour/TourGuide.tsx` — hand-rolled overlay (no
  Shepherd.js dep, ~250 lines): SVG ``<mask>`` cuts a glowing
  spotlight rectangle around the target, card auto-places on the
  right (or fallback bottom) with prev / skip / next + step counter.
  Keyboard: Esc closes, → / Enter advance, ← back.
- `data-tour-id` hooks on the sidebar, the Campaigns nav item, and
  the floating dice-tray button. The spotlight scrolls them into view
  if off-screen.
- Auto-launch on `Dashboard` for first-time DMs (empty campaign list
  + tour not yet completed).
- Sidebar identity block now has a `🧭 Tour` button next to `↩ Sign
  out` so a returning DM can replay any time.

**Surprises:** none. The biggest risk was target-element timing —
solved by recomputing the target rect on a 250ms interval as long as
the tour is open, which catches React re-renders and minor layout
shifts.

**Tech debt:** none added. Code-split note: TourGuide is part of the
main bundle (eager via Layout). It's ~7 KB so not worth lazy-loading.
