# Plan 00053 — HUD Center Tabs (Script | Maps | People)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Shipped 2026-07-19.** Owner feedback after Session 3: "I used a runbook
from Claude chat for the last session. I don't think we need to take up so
much real estate in the HUD with the runbook. Maps maybe? full blocks of
the PCs or Monsters?"

## What changed
The HUD's center column (previously 100% Scene Navigator) is now three
tabs, so a DM who runs from paper/chat notes gets a *useful* center:

- **🎬 Script** — the existing scene navigator, unchanged (one scene at a
  time, editable read-aloud/DM notes, NPC dialog hooks). Just no longer
  mandatory.
- **🗺 Maps** — the campaign's battle-map library as clickable thumbnails;
  the active table map is highlighted, and one click stages a different
  map (players' views switch live over SSE). Link to the 3D Board.
- **👥 People** — one-tap full blocks: party cards (portrait, HP/AC →
  opens the full CharacterSheet modal), tonight's encounter monsters
  (CR/HP/AC → opens the full MonsterStatBlock modal), and campaign NPC
  cards (portrait + role, appearance on hover).

All reuses existing modals/queries; map/table queries only fire when the
Maps tab is open. No backend changes.

## Future (not built)
- Persist the chosen tab per session (localStorage).
- A "current beat" mini-ribbon visible on non-Script tabs.
- NPC → linked stat block (needs monster_stat_block_id in the frontend type).
