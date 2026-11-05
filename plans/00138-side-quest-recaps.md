# Plan 00138 — Tell the party what happened

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-11-05
**Last updated:** 2026-11-05
**Implemented by:** Claude
**Branch:** `dev/side-quests`, on top of Plan 136. Not merged to main until Justin says.

---

## Purpose
From a player at Justin's table, about side quests: "prior to next session send a recap to each other about what happened. Like Creed found this strange cave and decided to go in. He fell down 100 times and was scared away by a bat, he wasted his time and gained nothing to show for his troubles."

The fun is the player telling it their way. So the words are theirs, nothing is written for them, and they can leave out or make up whatever they like.

When this is done:
- The last screen of a finished quest offers "Tell the party what happened". A player can do it later from the Journal, change it, or take it back.
- The other phones get a card on the Now screen and a Journal section, "What the party says happened".
- The DM sees it in the results, next to what really happened.

## Decisions
- **Only the player's words leave the run.** No quest title, no id, no log. A private quest's title can give it away, and a private quest stays private unless its player says otherwise.
- **It goes out as soon as they share it.** No DM approval and no hold until session day: players play at their own pace, and it's their story. A DM who wants them all before a session just asks.
- **No auto-written summary, ever.** A summary of the log would be the dull version, and a player's lie is allowed. No AI.
- **The card is the announcement.** A pop-up said the same sentence right above it, so it went. A correction keeps its time, so it doesn't bring the card back.

## Not in scope
- Showing recaps on the TV at the start of a session. It's a good idea for later, but it wants a real session to try it on.
- Posting to Discord for the player. The Town Crier speaks as the DM's NPCs.
- A DM switch to turn recaps off. It's only an invitation, and a player can ignore it.

## Progress
- [x] Columns `recap`, `recap_at` on `side_quest_runs` (migration 0066, DuckDB patch)
- [x] `share_recap`, `party_recaps`, two routes
- [x] Phone: end screen, Now card, Journal section. DM: results
- [x] Guide, Terms, SECURITY, data dictionary, ARCHITECTURE
- [x] Tests, and a walk on real screens with two phones and the DM
- [ ] Real phones (TD-136a)

## Validation
`pytest -q`, black, isort, flake8, interrogate, tsc, eslint, vite build, `alembic upgrade 0065:head --sql`, and an upgrade of a populated local database made before this change.
