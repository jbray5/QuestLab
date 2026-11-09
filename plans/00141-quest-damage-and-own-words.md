# Plan 00141 — Side quests: damage, each character's own words, and a party link that finds you

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-11-08
**Last updated:** 2026-11-08
**Implemented by:** Claude
**Branch:** `feat/quest-party-picks`, on top of Plan 140. Justin merges.

---

## Purpose
Justin's notes on Quest 1 ("The First Night"), 11/08:
- A fall from a tree and a branch to the forehead "should take damage here, a little." Quests could only pay gold and items. Answer to "1d4, never below 1 HP?": "yeah."
- The scrap of paper in the pack "says different thing for different people in their own language... a plot hook one liner in a language only they can read," after a check because it's smudged. The quest is shared, so one step has to show each character their own line.
- He wants one Discord message with "a link they can use". The party's join link sent a phone straight to its sheet only if the phone had joined through it; a phone that came in by its own link landed on the list with its character taken.

When done: a step can take damage on arrival (dice or a number, temp HP first, never below 1 HP). A step can give named characters their own words, and each phone gets only its own. The party's link sends any phone that has opened its own link back to its character.

---

## Progress
- [x] `QuestStep.damage` (validated dice), rolled in `_arrive`, floor 1 HP, logged, shown on the phone and in results; frozen once sent
- [x] `QuestStep.text_for`; `_words` in the current step and history; send refuses a line for a character outside the campaign; editable after sending
- [x] Form: Damage in "Rewards when reached"; "Words for one character" per step; Try it shows both
- [x] Party link: `onlyLinkFor` in `linkMemory.ts`; DM's `?peek=1` no longer remembered
- [x] Tests: 18 service
- [x] Data dictionary, SECURITY, ARCHITECTURE
- [x] Full gate
- [x] Local walk at phone size

---

## Surprises and Discoveries
- A run's log entry for a move carries what arriving at the next step did, so damage from step B is on step A's entry. Same as gold; the results read it that way already.
- `PlayerApp` remembered the campaign on the DM's Open too, which would have sent the DM's own browser to that character from the party's link. Fixed with the same `?peek=1` test the claim uses.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-11-08 | Damage floor | Can drop to 0; floor at 1 | 1 HP | At 0 the dying screen takes over the phone, and nobody's at the table to help (TD-136b) |
| 2026-11-08 | Per-character content | A step that routes by character; per-character words on any step | Words on a step | Justin needs one line each; no new step kind, no graph changes, each phone still gets one step |
| 2026-11-08 | Is damage structure? | Frozen once sent; editable | Frozen | Like gold: it changes what a live run does |
| 2026-11-08 | Party link | DM-only per-player links; remember any opened link | Remember exactly one | A shared tablet with several links still sees the list |

---

## Context and Orientation

### Files touched
- `domain/side_quest.py`, `services/side_quest_service.py`
- `frontend/src/api/sideQuests.ts`, `frontend/src/lib/sideQuests.ts`, `frontend/src/components/side-quests/{StepCard,QuestEditor,RewardsPanel,TryIt}.tsx`, `frontend/src/pages/player/QuestScreen.tsx`, `frontend/src/pages/JoinView.tsx`, `frontend/src/pages/player/{linkMemory.ts,PlayerApp.tsx}`
- `tests/test_services/test_plan141_damage_and_words.py`
- `docs/data_dictionary.md`, `docs/SECURITY.md`, `ARCHITECTURE.md`

### Architecture layers involved
domain, services, frontend. No schema change (both fields live in the `steps` JSON).

### Key terms defined
- **Temp HP first:** damage comes off temporary hit points before real ones (5e rule).
- **Party link:** `/join/{campaign id}`, the page listing the party's characters.

---

## Concrete Steps
Done as listed in Progress.

---

## Validation
- `pytest -q tests/test_services/test_plan141_damage_and_words.py`: 18 pass.
- Locally: a step with `1d4` takes 1 to 4 HP and the phone says "You took N damage"; a character at 1 HP takes nothing. Two characters with their own lines each see only theirs.

---

## Rollback
Revert the commit. No schema change; steps that used `damage` or `text_for` just lose them.
