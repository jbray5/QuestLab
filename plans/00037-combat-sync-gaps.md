# Plan 00037 — Combat Sync Gaps (Saturday-block)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-05-19

---

## Purpose

End-to-end walkthrough surfaced three combat-related sync gaps that will
hurt at the table on Saturday 2026-05-23:

- **P4-4a** Player turn banner stuck at "ROUND 1" — never advances from
  the player's perspective.
- **P4-4c** When DM applies damage from the HUD, the player's phone HP
  updates but there's no visible feedback (no flash, no log).
- **P4-6** When DM applies a condition (e.g. *charmed*) to a PC via the
  combat tracker, the player sees nothing — the condition lives on the
  `SessionCombatant` row but never reaches the player view.

These all share a theme: events / state on the DM side don't make it
through to the player view in a useful way.

---

## Progress

- [x] Step 1: Plan doc
- [ ] Step 2: Reproduce P4-4a — confirm whether it's a missing event or
  a UX problem (no obvious advance button in the HUD)
- [ ] Step 3: Publish `pc.combat.updated` whenever a `SessionCombatant`
  with a `character_id` mutates (conditions, hp_temp, defeated, sort
  index). Service-layer change.
- [ ] Step 4: Player-view: query the PC's current combat state (active
  conditions + temp HP) and render a Conditions strip near the HP bar.
- [ ] Step 5: Player-view: brief flash animation on `play-pc` queryKey
  invalidation when `hp_current` changed. Keep it subtle — green-flash
  on heal, red-flash on damage. Tied to existing `pc.updated` event.
- [ ] Step 6: tsc + pytest + commit + push

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-19 | Where does the condition list live? | On PC / on Combatant / both | Combatant (current model, no schema change) | Conditions are combat-scoped; persist on combatant. Player view joins back via `character_id`. |
| 2026-05-19 | Event topic for combat changes affecting a PC | New event type / reuse pc.updated | `pc.combat.updated` (new) | Lets the player view do a targeted refetch of just the combat-state slice; pc.updated already covers the rest. |
| 2026-05-19 | HP-flash UX | Animated bar / colored toast / no feedback | Animated bar (200ms color overlay) | Cheap, in-context (HP-bar location), no popup needed. Matches the existing `ql-fade-in` animation aesthetic. |

---

## Files touched

- `services/session_service.py` — publish `pc.combat.updated` from
  `update_combatant` when the combatant has a character_id
- `integrations/event_bus.py` — add `publish_pc_combat_updated` convenience
- `api/routers/play.py` — new GET endpoint returning the PC's active
  combat state (conditions + temp_hp + defeated)
- `services/player_service.py` — combat-state projection for the player view
- `frontend/src/api/play.ts` — combat-state fetcher
- `frontend/src/pages/PlayerView.tsx` — render a Conditions row + handle
  `pc.combat.updated` event + HP-flash
- `frontend/src/index.css` — ql-hp-flash keyframes

---

## Out of scope (deferred)

- P4-4a — if it's a UX issue (no clear advance button), the fix is
  cosmetic and can ship Wednesday with the rest of the combat-input work.
- Public combat log feed (monsters take damage → players see) — that's a
  bigger feature and a Plan 38 candidate.

---

## Outcomes and Retrospective

_to be written on close_
