# Plan 00119 — Public-review fix list (2026-10-30)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-30
**Last updated:** 2026-10-30
**Implemented by:** Claude Code

---

## Purpose
A hands-on review of the live app (skeptical anti-AI Reddit DM persona; DM laptop 1440×900, player
phone 375×812) produced a 22-item fix list. P0 items block sharing the app publicly: AI branding,
campaign create failing, wrong encounter difficulty badge, and confirming player/table links are
locked down. One commit per item. Ask before schema, auth, or anything touching real campaign data
(The Severance / Hollowmere have real players).

---

## Progress
P0
- [x] 1 No "AI" in public branding — index.html title/description/og/twitter, `/try` copy and its three generative-AI images (swapped for the procedural demo map), API description
- [x] 2 Campaign create: Setting/Tone optional, "e.g." placeholders app-wide, friendly validation errors, open the new campaign
- [x] 3 Encounter difficulty badge with no party (create ignored the pick; no-party math returned LOW)
- [x] 4 Lock-down audit (docs/SECURITY.md access table; Plan 120 accounts — closes on Render switch; SEC-002..006 in QUALITY.md) of /play, /table, /stream, DM routes (written summary; auth changes need Justin)
P1
- [ ] 5 Quick session path; stable sidebar
- [ ] 6 HUD declutter
- [ ] 7 Initiative tracker labels + sort
- [ ] 8 Encounter roster unsaved state
- [ ] 9 One "Player display" menu
- [ ] 10 Immersive view empty/loading states
P2
- [ ] 11 No "Plan NN" / raw enums / 3D jargon in UI
- [ ] 12 "arc" everywhere
- [ ] 13 Plurals
- [ ] 14 One rules edition string
- [ ] 15 Join code vs self-create
- [ ] 16 Button hierarchy
- [ ] 17 Typography
- [ ] 18 Characters page overflow
- [ ] 19 False empty states while loading
- [ ] 20 Sidebar campaign name ellipsis
- [ ] 21 Navigation as real links
P3
- [ ] 22 Showcase campaign tutorial data (data only, that campaign only)

---

## Surprises and Discoveries
- 10/30: `/try` (the old Reddit landing, Plan 54) predates the no-generative-AI decision (Plan 86): "The AI-powered studio…", "AI-generated battle maps", "AI-stocked shops", and three images from the old AI art pipeline. All replaced.
- 10/30: every generation control in the app is already behind `AI_ON` (`frontend/src/lib/flags.ts`, off in prod) — the branding was the only public trace.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-30 | Edition wording | "5e" / "5.5e" / "5e (2024 rules)" | "D&D 5e (2024 rules)" | The rules engine follows the 2024 PHB / SRD 5.2.1; "5.5e" is fan shorthand |
| 10-30 | Order | list order / parallel | P0 in order; item 4 audit runs read-only in parallel | Item 4 may be the most severe; reading costs nothing |

---

## Validation and Acceptance
Per item: the review's "Done when" line, checked locally (Vite 5173 + uvicorn on a scratch DuckDB on F:) and with the quality gate.

---

## Idempotence and Recovery
Each item is its own commit; revert one without the rest. No schema change planned; any that turns out to be needed is asked first.

---

## Outcomes and Retrospective
_Fill at completion._
