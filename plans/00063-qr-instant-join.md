# Plan 00063 — QR Instant Join

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-09-01
**Last updated:** 2026-09-01
**Implemented by:** Claude Code

---

## Purpose

Field Guide #2 (Owlbear's adoption engine): a player scans a QR on the
projector, taps their character, and has their live sheet in under 30
seconds — no accounts, no links texted around. Same capability-URL trust
model as /play/{pcId} (in-room trust). Also the DM gets a shareable join
QR from the HUD.

---

## Progress
- [x] Step 0: plan (2026-09-01)
- [x] Step 1: backend (2026-09-01) — GET /play/join/{campaign_id}: player-safe roster
      {id, character_name, player_name, portrait_url}; add campaign_id to
      TableProjection so the projector can build the join URL
- [x] Step 2: frontend (2026-09-01) — `qrcode` npm dep; /join/:campaignId JoinView
      (character cards, remembers pick in localStorage, lands on /play);
      TableView corner 📱 chip toggling a QR overlay; HUD "Join QR" modal
- [x] Step 3: tests + gate green (737 passed); ship + live verify below (2026-09-01)

---

## Surprises and Discoveries
- None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 09-01 | Auth for join page | none (capability) / PIN | capability, in-room trust | matches existing /play model; QR is only shown in the room |
| 09-01 | QR rendering | hand-rolled / `qrcode` npm | `qrcode` npm (MIT) | tiny, standard; hand-rolling QR is ~300 error-prone lines |

---

## Context and Orientation
- Play router (`api/routers/play.py`) exposes unauthenticated
  capability-scoped routes; player_service resolves DM under the hood.
- TableProjection in `domain/table_state.py`; built in
  services/table_service (grep `TableProjection(`).
- TableView corner chips pattern: Table3DView's chipStyle strip.
- HUD party header: `frontend/src/pages/SessionHud.tsx` "Party — N PCs".

## Validation and Acceptance
- [x] /join/{campaignId} lists party with portraits; tap → /play/{pcId}
- [x] Projector 📱 chip shows scannable QR with the join URL
- [x] HUD Join QR modal + copy link
- [x] pytest + tsc + build green; live smoke on The Severance verified 2026-09-01
      (join page renders all 5 PCs sorted with portraits; projector QR
      overlay live; projection.campaign_id confirmed on prod)

## Idempotence and Recovery
Additive routes + UI; progress boxes are the restart guide.
