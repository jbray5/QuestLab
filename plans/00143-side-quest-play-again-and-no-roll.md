# Plan 00143 — Side quests: let a player play again, and no roll for some characters

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-11-12
**Last updated:** 2026-11-12
**Implemented by:** Claude
**Branch:** `feat/quest-play-again`, off main. Justin merges.

---

## Purpose
The First Night went out on 11/8. Cory (Creed) finished it and asked on Discord: "Could you reset my quest? I want to run it again, now that I know what to expect." Justin: "normally no, but on your last one you made such a good point that I feel like I should factor it in." The point: "he's a dragonborn so the fire piece should be a given ... or at least he shouldn't have to roll."

Neither is possible today. Only a practice run can start over, sending again skips anyone who already has a run, and a sent quest's checks are frozen.

When done:
- On the Results tab, the DM can press "Let them play again" on a character's run. The run goes back to the start. The DM chooses whether to take back what the first try paid (gold, and items still on the sheet). Damage stays taken. The first try's choices, rolls, answers and party story stay on the DM's side under "Earlier try". The party stops seeing the first try's pick.
- On a check step, the DM can tick "No roll for" characters. Their phone skips the dice: it says no roll is needed and goes down the pass path. This is a ruling about a character, like their own words, so it can change after the quest has gone out.

---

## Progress
- [x] Domain: `QuestStep.no_roll`; log entry fields for an auto pass and for "again"; `QuestStepView.no_roll`; `QuestPlayAgain`
- [x] Service: `_current(log)` everywhere the phone or the party reads a log; `_resolve` auto pass; `play_again` with take-back; `_character_problems` covers `no_roll`
- [x] Route `POST /side-quests/{id}/runs/{run}/again`
- [x] Quest creator: "No roll for" on check steps; Results: "Let them play again", earlier tries, auto pass lines; Try it honours "Read as"
- [x] Phone: a no-roll check; history and last-roll lines without a die
- [x] Tests: 12 service, 1 API
- [x] Local walk on real screens, 14 checks
- [x] Data dictionary, SECURITY, ARCHITECTURE
- [x] Full gate: 1958 passed; frontend build and lint clean

---

## Surprises and Discoveries
- Nothing could reset a real run: sending again skips anyone who has one, and "Start over" is practice-only. So Cory's ask needed code, not a setting.
- The log already records each payout by name (`gp`, `items`), which is enough to take a try back without a ledger.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-11-12 | Where the first try goes | A new column; keep it in the log behind an "again" marker | The log, behind a marker | No migration; the DM reads one story with a divider; every phone and party reader already goes through a few helpers |
| 2026-11-12 | What the first try paid | Always keep; always take back; the DM picks | The DM picks, take back ticked | "Normally no" says double pay is unwelcome, but it's his ruling. Gold can't go below zero; an item no longer carried is left alone and named |
| 2026-11-12 | Damage on a replay | Heal it; leave it | Leave it | Days have passed; a fall is a fall |
| 2026-11-12 | No roll: structure or words | Frozen with checks; editable like `text_for` | Editable | It's a per-character ruling, made after sending in exactly this case |

---

## Context and Orientation

### Files touched
- `domain/side_quest.py`, `services/side_quest_service.py`, `api/routers/side_quests.py`
- `frontend/src/api/sideQuests.ts`, `frontend/src/lib/sideQuests.ts`, `frontend/src/components/side-quests/{StepCard,QuestResults,TryIt}.tsx`, `frontend/src/pages/player/QuestScreen.tsx`
- `tests/test_services/test_plan143_play_again.py`, `tests/test_api/test_plan143_play_again.py`
- `docs/data_dictionary.md`, `docs/SECURITY.md`, `ARCHITECTURE.md`

### Architecture layers involved
Domain, service, API, frontend. No migration: `no_roll` lives in the steps JSON and the earlier try in the log JSON.

### Key terms defined
- **Again marker:** a log entry with kind `again`. Everything before it is the earlier try; the phone, the party's names and recaps only read what comes after.
- **No roll:** characters on a check step who pass without rolling.

---

## Concrete Steps
As listed in Progress.

---

## Validation
- `pytest -q tests/test_services/test_plan143_play_again.py tests/test_api/test_plan143_play_again.py`: 13 pass.
- Locally (WebKit, phone 390 wide): Creed's phone shows "No roll needed" with no dice and goes down the pass path for 25 gp; Willa sees "Creed is on this"; the DM's results show "No roll: passed, by your ruling"; "Let them play again" offers to take back 25 gp; after it, the divider says "Took back: 25 gp", the earlier try is still listed, Creed's purse is 0, Willa no longer sees his name, and his phone starts at the beginning; the editor's check step shows "No roll for Creed".

### For The First Night (prod, after merge)
1. Words and pictures → Step 3 (the fire check) → No roll for → tick Creed → Save.
2. What players did → Creed → Let them play again (take back ticked) → Play again.

---

## Rollback
Revert the commit. Runs that were played again keep their marker and earlier entries in the log. The old code shows them as plain entries to the DM, and the party could see a first-try pick again until the player picks anew. No data is lost.
