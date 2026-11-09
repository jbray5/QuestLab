# Plan 00140 — Side quests: the party sees who picked what

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-11-08
**Last updated:** 2026-11-08
**Implemented by:** Claude
**Branch:** `feat/quest-party-picks`, from `main` at 5526edc. Justin merges.

---

## Purpose
Justin, rolling out "The First Night" (same quest to all four Hollowmere players): "as the first people start picking options... could we add a tag like, Willa's already working on this? ... In theory, they'd chat about who's doing what and not duplicate work." Each character has a private run, so nobody could see anyone else's pick.

When done: a DM can tick "Show the party who picked what" on a choice step. Every phone on that quest then shows "Willa is on this" under an option another character picked there, and says "Your party will see which one you pick" before the pick. Off by default, per step, so later choices in the same quest stay private.

---

## Progress
- [x] `QuestStep.party_sees` (JSON field, no migration); can change after sending
- [x] Log keeps `option_index` and `party` on a choice; `QuestOptionView.taken_by`, `QuestStepView.party_sees_pick`
- [x] A shown pick refreshes the other runners' phones (`_tell_the_others`)
- [x] Step card switch; phone notice and names
- [x] Tests: 8 service, 1 API; Plan 136's option-shape test now expects `taken_by: []`
- [x] Local walk at 390 px in WebKit, 12 checks: notice, live names without reload, two names, no sideways scroll, own pick still works, the next choice shows nothing, one switch per choice step, switching off on a sent quest clears the other phones
- [x] Data dictionary, SECURITY, ARCHITECTURE
- [x] Full gate

---

## Surprises and Discoveries
- First built as one switch per quest (with migration 0068, never committed). Justin's Quest 1 has a second choice, take the pack's money or leave it, and his NPC plot needs that kept quiet until the owner turns up. A quest-wide switch would have shown it to everyone, so the switch moved onto each choice step and the migration went away.
- The log stored the option's label only, and labels may change after sending. New entries also keep `option_index`, and only entries marked `party` count, so old entries never need matching by label.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-11-08 | Tag or lock | Names only; or a taken option can't be picked | Names only | Justin asked for a tag. Four players and four options: a lock forces the last player, and a player who wanders off blocks the others |
| 2026-11-08 | Where the switch lives | Every quest sent to 2+; per quest; per choice step | Per choice step, off by default | Splitting up work is one step; a moral choice later in the same quest is private. Plan 139's promise is that private stays private |
| 2026-11-08 | Switching on after sending | Lock it once sent; allow, show old picks; allow, show only picks made while on | The last | Players who picked earlier weren't told, so their picks stay hidden. The DM can still fix a forgotten tick. `structure_of` ignores it, so it doesn't unlock links |
| 2026-11-08 | What crosses | Names; names plus outcome | Names and option number only | Where a pick led, rolls and replies are each player's own |

---

## Context and Orientation

### Files touched
- `domain/side_quest.py`, `services/side_quest_service.py`
- `frontend/src/api/sideQuests.ts`, `frontend/src/lib/sideQuests.ts`, `frontend/src/components/side-quests/StepCard.tsx`, `frontend/src/pages/player/QuestScreen.tsx`
- `tests/test_services/test_plan140_party_picks.py`, `tests/test_api/test_plan140_party_picks.py`, `tests/test_services/test_plan136_side_quests.py`
- `docs/data_dictionary.md`, `docs/SECURITY.md`, `ARCHITECTURE.md`

### Architecture layers involved
domain (fields), services (who picked what, refresh), api (unchanged routes, new response fields), frontend.

### Key terms defined
- **Run:** one character's private walk through a quest (`side_quest_runs`).
- **Pick:** a choice step's option a player tapped, kept in the run's `log`.

---

## Concrete Steps
Done as listed in Progress.

---

## Validation
- `pytest -q tests/test_services/test_plan140_party_picks.py tests/test_api/test_plan140_party_picks.py`: 9 pass.
- Locally: send a quest with the switch on for one choice to two characters; pick on one phone; the other phone, left open, shows "<name> is on this" within a few seconds.

---

## Rollback
Untick the switch on the step: names and the notice disappear at once. Code: revert the commit; no schema change.
