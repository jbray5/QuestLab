# Plan 00142 — Side quests: practice runs for the DM

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-11-08
**Last updated:** 2026-11-08
**Implemented by:** Claude
**Branch:** `feat/quest-party-picks`, on top of Plans 140 and 141. Justin merges.

---

## Purpose
Justin, before sending The First Night: "could you make it 'playable' for me as sarranthia or steven and have the results not show up for them? like not show that i had claimed a task etc? but i want to try it and try all the possibilities on my end."

"Try it" walks a quest in the DM's form, but not on the real phone. A real run on a spare character would show his picks to the party ("Steven is on this"), pay that sheet, could be recapped, and can't be replayed.

When done: "Play it yourself" in the Quest creator opens a character's phone on a practice run. The party never sees it, the sheet never changes (the phone shows what it would have paid or cost), no recap, "Start over" on the phone. Works on a draft. Try it can also read the quest as one character, to check their own lines without touching their phone.

---

## Progress
- [x] `side_quest_runs.practice` (migration 0068, DuckDB patch)
- [x] `practice` (create or start over), `remove_practice`, `start_over` (phone, opens the first step); send replaces a practice run; a draft's structure change restarts its practice runs
- [x] Practice skipped in `taken_by`, `_tell_the_others`, `party_recaps`; `share_recap` refuses; `_arrive` only reports
- [x] Routes: `POST /side-quests/{id}/practice`, `DELETE /side-quests/{id}/practice/{run}`, `POST /play/{key}/side-quests/{run}/start-over`
- [x] Quest creator: "Play it yourself" panel (drafts and sent); results mark practice; Try it "Read as"
- [x] Phone: practice banner with Start over; payouts say the sheet didn't change; no recap box; cards say "Practice run"
- [x] Tests: 11 service, 2 API (incl. migration)
- [x] Local walk, 13 checks
- [x] Data dictionary, SECURITY, ARCHITECTURE
- [x] Full gate

---

## Surprises and Discoveries
- First cut of the phone's Start over put the run back at the seal, so every replay needed the hold again. The phone's Start over now opens the first step; the DM's "Start over and open" still shows the seal, like a player's first look.
- The panel briefly said "nobody to practise as" while the roster loaded; it waits now.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-11-08 | Real phone or better preview | Make Try it fuller; a hidden run on a real character's phone | Hidden run, plus "Read as" in Try it | He asked to play it as Sarranthia or Steven, on the phone, with checks rolling off their sheets |
| 2026-11-08 | Rewards in practice | Pay a spare sheet; pay nothing and show it | Show, don't pay | Sarranthia and Steven are real rows in Hollowmere; replays would pile up gold and damage |
| 2026-11-08 | Forcing branches | A pass/fail switch for practice; the phone's existing "real die" box | The die box | Already there: type 20 or 1 |
| 2026-11-08 | A practice run when the quest is sent to that character | Skip them; replace it | Replace | Otherwise the send would silently skip them |

---

## Context and Orientation

### Files touched
- `domain/side_quest.py`, `services/side_quest_service.py`, `db/repos/side_quest_repo.py`, `db/base.py`, `alembic/versions/0068_side_quest_practice_runs.py`, `api/routers/side_quests.py`, `api/routers/play.py`
- `frontend/src/api/sideQuests.ts`, `frontend/src/components/side-quests/{PracticePanel,QuestEditor,QuestResults,TryIt}.tsx`, `frontend/src/pages/player/QuestScreen.tsx`
- `tests/test_services/test_plan142_practice_runs.py`, `tests/test_api/test_plan142_practice_runs.py`
- `docs/data_dictionary.md`, `docs/SECURITY.md`, `ARCHITECTURE.md`

### Architecture layers involved
All: domain, repo, service, API, frontend, plus one additive migration.

### Key terms defined
- **Practice run:** a run with `practice = true`; the DM playing as a character.
- **Peek:** `?peek=1` on a phone link; the DM's look, which doesn't claim the character or get remembered.

---

## Concrete Steps
Done as listed in Progress.

---

## Validation
- `pytest -q tests/test_services/test_plan142_practice_runs.py tests/test_api/test_plan142_practice_runs.py`: 13 pass.
- Locally: Play as Steven, take the fire; Willa's phone shows no name; Steven's sheet is unchanged; Start over returns to the first step; Remove clears his phone; Steven stays unclaimed.

---

## Rollback
Remove any practice runs from the panel, then revert the commit. 0068 is additive and can stay.
