# Plan 00075 — The DM cockpit: notes that follow you, a board you never leave, sessions by arc

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-04 · **Implemented by:** Claude Code

## Purpose
Justin runs with two screens: a TV above (players: 3D table + YouTube
ambience) and a widescreen below split Discord / QuestLab. On the
QuestLab half he was stuck on the 3D Board page to move tokens, could not
see his notes, and bounced between tabs for everything else. Second ask:
the Adventures page is an extra, confusing hop — group sessions into arcs
on one Sessions page.

## Shipped
- **DM notes dock** (`components/dm/DmDock.tsx`, `DmDockBody.tsx`,
  `dmSession.ts`) — floating, draggable, resizable panel on every DM
  page; toggles with **N**; remembers position/size/open/dim; follows the
  session from the URL or the last one visited. Tabs: 📝 Notes (session
  `actual_notes`, autosaved 700 ms debounce, flushed on unmount),
  🎬 Script (runbook scenes with editable read-aloud / DM notes, encounter
  flows, dialog hooks), 👥 People (every campaign NPC with the DM face:
  secret, motivation, hooks, hidden/revealed). Session picker in the
  header. Route-gated: DM routes only, never `/table`, `/play`, `/join`,
  `/market`, `/shop`, `/puzzle`; hidden under 900 px.
- **Pop-out window** — `/sessions/:id/notes` (`pages/NotesWindow.tsx`),
  the same body in a 460×720 popup to park over Discord. DM-guarded.
- **🎮 Live tab in the HUD** (`components/table/LiveBoardPane.tsx`) — the
  projected board driven inline: drag, ping, markers, + Party / + Foe /
  + Foes (combat), fog regions, darkness, ✋ Stand down per faction, active
  combatant glow. Staging a map from 🗺 Maps jumps here and focuses the
  center column. Logic shared with the Table console modal via
  `useTableController.ts` (one source of truth; sibling query keys
  invalidated so HUD / 3D Board markers stay honest).
- **Sessions by arc** (`pages/CampaignSessions.tsx` at
  `/campaigns/:id/sessions`) — opening a campaign lands here. Arcs are
  collapsible headers (tier, count, synopsis) with + Session, Encounters,
  Map Builder, Edit, Delete; sessions show status, date, party, "▶ up
  next", with HUD / Prep / Party / Advance / Delete. New session defaults
  to the next global number and the last session's party. New arc is one
  field. Sidebar: 🗺 Adventures + per-adventure 📅 Sessions → one
  📅 Sessions. The old Adventures page stays reachable from an arc's Edit
  ("Tier, acts, NPC roster, location notes →") and its route still works.
- Guide: "Two screens, one cockpit" section; tour copy updated.

## Verification
- Local (vite on localhost:8000 → prod API): Live tab renders the map with
  17 tokens and "✋ Stand down: house"; N opens the dock; People lists 18
  NPCs; dock follows to /npcs; absent on /table; arcs page lists the arc
  with six sessions; pop-out renders. No console errors.
- Prod: pending deploy.

## Follow-ups
- Party HP strip inside the dock (for the 3D Board page).
- Beats + combat cards in the dock so the 3D Board page needs nothing else.
- Keyboard: 1/2/3 to switch dock tabs while it has focus.
