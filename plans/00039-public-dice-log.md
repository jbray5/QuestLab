# Plan 00039 — Public Dice Log

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-05-20

---

## Purpose

Walkthrough item **P3-5** — players can't see the DM's dice rolls.
"DM rolled a 17" is currently a verbal-only event. Surfacing it on the
player phones makes combat feel shared and lets a roll *land* visually.

## Design — two rollers, two purposes

- The **floating dice tray** (existing, `DiceTray.tsx`) stays **private**
  — the DM's own rolls, nobody else sees them. Unchanged.
- A **new "Roll for the Table" strip in the SessionHud** broadcasts —
  every roll fans out to the attending players' phones.

The DM chooses visibility by *which roller they click*. No toggle to
forget mid-combat.

## Routing — why publish to each PC topic, not the campaign topic

Players' `EventSource` subscribes to `pc:{pcId}` only. They do NOT
subscribe to `campaign:{campaignId}` — and shouldn't, because the
campaign topic carries `pc.updated` events for *every* PC, which would
leak other PCs' UUIDs to a curious player.

So the broadcast endpoint looks up the session's attending PCs and
publishes the `dice.rolled` event to each `pc:{pcId}` topic
individually. Players need no new subscription; no UUID leak.

---

## Progress

- [x] Step 1: Plan doc
- [ ] Step 2: `POST /sessions/{id}/dice-roll` — accepts a roll payload,
  publishes `dice.rolled` to every attending PC topic + the campaign
  topic (so the HUD's own log updates too). Ephemeral; not persisted.
- [ ] Step 3: HUD "Roll for the Table" strip — d4/d6/d8/d10/d12/d20/d100
  buttons, optional count + modifier, posts to the endpoint, keeps a
  short local log.
- [ ] Step 4: Player view — handle `dice.rolled` events, render a
  "🎲 DM's Rolls" feed (last ~6, newest first).
- [ ] Step 5: tsc + pytest + commit + push

---

## Decisions

| Date | Decision | Chosen | Reason |
|---|---|---|---|
| 2026-05-20 | Private vs public roll UX | Two separate rollers | No toggle to forget; visibility is obvious from which UI you used. |
| 2026-05-20 | Event routing | Per-PC topic fan-out | Players don't subscribe to the campaign topic; per-PC avoids a UUID leak. |
| 2026-05-20 | Persist rolls? | No — ephemeral | A dice roll is a moment, not a record. Like the existing dice tray's 8-roll memory, it lives only in the client session. |

---

## Files touched

- `domain/session.py` — `DiceRollBroadcast` Pydantic model (new)
- `integrations/event_bus.py` — `publish_dice_rolled` convenience (new)
- `services/session_service.py` — `broadcast_dice_roll` (new)
- `api/routers/sessions.py` — `POST /sessions/{id}/dice-roll` (new)
- `frontend/src/api/sessions.ts` — `broadcastDiceRoll` fetcher
- `frontend/src/pages/SessionHud.tsx` — "Roll for the Table" strip
- `frontend/src/pages/PlayerView.tsx` — "DM's Rolls" feed
- `frontend/src/hooks/useEventStream.ts` — register `dice.rolled`

---

## Out of scope

- Persisting a roll history
- Players broadcasting their own rolls back (they roll real dice;
  the DM enters results — out of scope for now)
- Animating the dice on the player side

---

## Outcomes and Retrospective

_to be written on close_
