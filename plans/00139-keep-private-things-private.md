# Plan 00139 — Keep private things private

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-11-06
**Last updated:** 2026-11-06
**Implemented by:** Claude
**Branch:** `dev/side-quests`, on top of Plans 136 and 138. Not merged or pushed until Justin says.

---

## Purpose
Side quest replies tell players "This goes to your DM, not the party", and Justin says some players want things private. That wasn't true: every phone's Journal has "Not you?", which opens the party's list, and the list handed out every character's link key, so two taps opened another player's phone, answers included. Proved on a test copy 11/05.

When done: a reply's words never come back through a player link, and the list stops opening a character once a player has it. Justin's rule: "without adding any mfa or crazy extra security burden on the player." Players do nothing new, and every link already handed out keeps working.

---

## Progress
- [x] Migration 0067 and DuckDB patch: `player_characters.claimed_at`
- [x] Roster hides the key of a claimed character; `POST /play/{key}/claim`; join-built characters start claimed
- [x] DM: `POST /characters/{id}/play-link/release`, shown on the link button
- [x] `QuestHistoryItem` drops `reply`, adds `step_id` and `replied`; the writing phone keeps its own copy
- [x] Phone: claim once in use, "Back to my character", taken cards, "Copy my link", new wording
- [x] Terms, SECURITY, data dictionary, ARCHITECTURE, QUALITY
- [x] Tests
- [x] Full gate: 1903 passed; black, isort, flake8, interrogate, tsc, vite build; eslint adds no new errors (backlog is informational in CI); `pip-audit -r requirements.txt` clean
- [x] Walk on phone-size screens with the snooping repeated (248 checks), and the DM's button with real clicks (19 checks)
- [ ] Real phones (TD-136a)

---

## Surprises and Discoveries
- `patch_duckdb_schema` runs at every start, so a data fix there would re-claim characters a DM reopened. DuckDB gets the column only.
- "Not you?" used to forget the phone's remembered pick. With a closed list that would strand a player who came in by QR, so the pick now stays until they pick another.
- PCs made before tokens still open by UUID until 2026-12-01, and UUIDs are in party payloads. It takes dev tools, it ends on its own, and replies are safe either way because the words aren't sent. Recorded as TD-139a.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 11/06 | When is a character claimed? | First tap on the list; first request; once past the phone's welcome | Once past the welcome | "Not you?" on that screen still undoes a wrong tap. Personal links claim too, not just the list |
| 11/06 | Who counts as claimed at migration? | Everyone; nobody; PCs with a real player name | Real player name | Hollowmere's four are closed from the first second. A PC still "Not assigned yet" has no player to protect, and the phone asks for a name on first open |
| 11/06 | Does Reset link reopen the list? | Reopen; stay closed | Stay closed | Reopening lets the person just removed pick the character again |
| 11/06 | DM's own look | Server detects the DM; `?peek=1` on the DM's Open button | `?peek=1` | Detecting the DM breaks locally, where every request is the DM. A wrong claim is cheap to undo with the release button |
| 11/06 | Can a player reread an answer? | Never; a copy on the phone that wrote it | Copy on the phone | They keep "You wrote:", and the server still never sends it. Other devices say "You answered. It went to your DM." |
| 11/06 | PIN or code per character | Add one; don't | Don't | Justin ruled out extra burden. A lost link is one message to the DM, and "Copy my link" prevents most of those |

---

## Context and Orientation

### Files touched
`alembic/versions/0067_character_claims.py` (new), `domain/character.py`, `domain/side_quest.py`, `db/base.py`, `services/player_service.py`, `services/character_service.py`, `services/side_quest_service.py`, `api/routers/play.py`, `api/routers/characters.py`, `frontend/src/api/{play,characters,types,sideQuests}.ts`, `frontend/src/lib/sideQuestPhone.ts`, `frontend/src/pages/JoinView.tsx`, `frontend/src/pages/player/{PlayerApp,JournalTab,QuestScreen}.tsx`, `frontend/src/pages/{TermsPage,Characters,SessionHud}.tsx`, `frontend/src/components/PlayLinkGate.tsx`, `frontend/src/components/character-sheet/{PlayerLinkButton,CharacterSheet}.tsx`, `tests/test_api/test_plan139_private.py` (new), `tests/test_api/test_join_api.py`, `docs/SECURITY.md`, `docs/data_dictionary.md`, `docs/QUALITY.md`, `ARCHITECTURE.md`.

### Architecture layers involved
api → services → repos/domain, one way. Authorization lives in services: release checks campaign ownership there.

### Key terms defined
- **Play link / key:** `/play/{play_token}`. Holding it is the only thing that opens a character's phone view. No sign-in.
- **Join roster:** `GET /play/join/{campaign_id}`, behind the join code if set. The "Who are you?" page.
- **Claimed:** `claimed_at` is set. A player has this character, so the roster returns `key: null` for it.
- **Peek:** the DM's Open button adds `?peek=1`, so looking doesn't claim.

---

## Concrete Steps
1. Migration and `claimed_at` as listed under Progress. Verify: `alembic upgrade 0066:0067 --sql`.
2. Services and routes. Verify: `pytest tests/test_api/test_plan139_private.py -q`.
3. Phone and DM screens. Verify: `npx tsc -b`, `npx eslint .`, `npx vite build` in `frontend/`.
4. Docs. Verify: they describe the roster's `claimed` field and the release route.

---

## Validation and Acceptance
- [x] `pytest -q`, black, isort, flake8, interrogate, tsc, vite build all pass
- [x] `alembic upgrade 0066:0067 --sql` gives the column and the update
- [x] Phone-size walk: a second player's list shows the first player's character as taken, with no key anywhere in the response; a sent answer isn't in any `/play` response; the DM still reads it; an old link still opens

---

## Idempotence and Recovery
All steps are safe to re-run. The migration is additive: `downgrade` drops only the new column. If a claim is wrong, the DM's link button reopens the character. Claiming is safe to repeat.

---

## Interfaces and Dependencies
**Produces:** `POST /play/{key}/claim`, `POST /characters/{id}/play-link/release`, roster fields `key: string | null` and `claimed`, `QuestHistoryItem.step_id` and `.replied`.
**Depends on:** SEC-002 play tokens (migration 0057), Plan 136 runs.

---

## Outcomes and Retrospective
The snooping that worked on 11/05 now fails at every step, with nothing new for players to do. Local `pip-audit` on the venv reports stale packages, but CI audits `requirements.txt`, which is clean; rebuilding the venv is worth doing. Real phones are still open (TD-136a).
