# Plan 00136 — Side quests: DM-written quests that players finish on their phones between sessions

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-11-04
**Last updated:** 2026-11-04
**Implemented by:** Claude (lead: backend) + two subagents (SD: the DM's page, SP: the phone)
**Branch:** `dev/side-quests`. Not merged to main until Justin says.

---

## Purpose
A table that can't find a date loses momentum. Justin's own table has no session on the calendar until after the holidays, and he floated "side quests to your phones" for gold, loot and world detail. One player replied that they really liked it.

When this is done:
- A DM writes a short branching quest in the app, in steps: story text with an optional picture, a choice, a skill check, or a written reply.
- The DM sends it to one character or the whole party. Each character gets their own private run.
- The player finds it on the phone's Now screen and plays it whenever they like. Checks use the character's real bonuses. Gold and items land on the sheet by themselves.
- The DM sees who finished and what they chose, rolled and wrote.

A quest runs by itself once written. The DM doesn't need to be there, and that's the point: the DM may be away from the keyboard for days.

**Not in scope:**
- **Any AI.** Every word is the DM's. The product has no model clients and gets none here. The form uses plain labels, and placeholder text never reads as story.
- **Web push.** The app has no service worker, and iPhones would need it installed to the home screen. The phone shows a card, and the DM can send an optional Discord ping through the Town Crier.
- **Party-shared runs.** Each character plays alone. A shared quest is the same quest sent to several characters.

---

## Progress
- [x] Backend (lead, 16c8813): models, migration 0065, repo, service, DM and player routes, cascades; 59 tests
- [x] SD: the Quest creator: list, step editor, try-it preview, send, results
- [x] SP: the phone: the Now card, the quest screen, the shake-to-roll check, the Journal list
- [x] Lead merge: quiet phone calls, honest wording on who can read a reply, the Guide and Terms, docs, an end-to-end walk with a real five-quest set (85 routes through the API, 63 checks on the screens)
- [x] Gate: 1878 tests, black, isort, flake8, interrogate, tsc, eslint, vite build
- [ ] A real iPhone and Android phone (TD-136a)
- [ ] Justin tries it locally; merge and push only when he says

---

## Surprises and Discoveries
- `player_service.throw_dice` broadcasts every roll to the TV and to the party's phones, and needs a session to exist. A private quest can't use it, so quest checks roll quietly in `side_quest_service`.
- Neither agent had walked the whole loop: SD played runs through the API and SP wrote quests through the API. The lead's end-to-end walk (DM page, send, phone, results) found no bugs.
- The write limit (120 a minute per IP) and the 30-character campaign cap both stopped the test walk. A real player is nowhere near either.
- A player's reply is readable by anyone with their link, like their notes, so "Only your DM reads this" was untrue. The phone and the Terms now say so.
- `devicemotion` needs a secure context, so a real shake can only be tried on https, not on a phone over local http. Tap, real die and hold work there.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 11/04 | How interactive | letter and reply / branching steps | branching steps | Justin: a quest must run itself while the DM is away |
| 11/04 | Writing help | an AI feature / none in the product | none in the product | The no-AI rule is literal. Whatever help Justin wants for his own table happens outside the product and the repo |
| 11/04 | What the DM's page is called | Side quests / Quest creator | Quest creator (Justin's name, in the nav's sentence case); players still see "side quest" | DESIGN.md asks for sentence case, and its neighbours are "Town crier" and "Map builder" |
| 11/04 | Graph shape | free graph / no cycles | no cycles, checked at send | Each step is reached at most once, so each reward can only be paid once, with no ledger |
| 11/04 | Rewards | at the end only / on any step | on any step, gold may be negative | One check can change the payout without duplicating the steps after it; a cost lets a choice mean something |
| 11/04 | Paying a cost the player can't afford | block the choice / pay what they have | pay what they have, floor at zero | No dead ends in a quest nobody is supervising |
| 11/04 | Editing after sending | locked / free | words and pictures only | A typo must be fixable, but changing links or rewards under a live run breaks it |
| 11/04 | What the phone receives | the whole quest / only the current step | only the current step | Players open dev tools (Puzzle rule, Plan 55). DCs, links and other branches never leave the server |
| 11/04 | Which skill a check uses | one / up to three, player picks | up to three, player picks | DMs often accept more than one approach |
| 11/04 | Real dice | server only / allow a typed die | allow a typed die | The roll sheet already trusts real dice at this kind of table |

---

## Context and Orientation
**Layers:** `domain/` models, `db/repos/` DB only, `services/` rules and authorization, `api/routers/` transport.

**Player links:** `/play/{key}/…` routes take `PlayPcId` (`api/deps.py`), which resolves a play token to one PC's UUID. There's no login. The service must make sure a run belongs to that PC.

**DM ownership:** follow `crier_service._get_owned_campaign`: campaign exists (ValueError), caller owns it (PermissionError).

**Things reused:**
- `character_service.compute_skill_bonuses(pc)`: the 18 skill bonuses.
- `inventory_service.add_item(db, pc_id, CharacterItemCreate, dm_email, notice=...)`: grants an item and tells the phone.
- `shop_service._purse_copper(pc)` / `_redenominate(cp)`: the purse, as `give_coin` uses them.
- `integrations.event_bus.publish_pc_updated(pc_id, campaign_id, notice=...)`: refreshes the phone. A notice goes only to that PC's own topic.
- `crier_service.send(db, campaign_id, dm_email, CrierSendRequest)`: the optional Discord ping.
- `auth_service.catalog_visible(owner, email)`: which items a DM may hand out.

**Deletes:** `CharacterRepo.delete` removes child tables; `campaign_service.delete_campaign` removes campaign children. Both need the new tables.

---

## Shapes
**`side_quests`** (0065): `id`, `campaign_id` (FK, indexed), `title` (≤ 120), `teaser` (≤ 200, shown on the card before opening), `steps` (JSON), `start_step`, `status` ("draft" | "sent"), `created_at`, `updated_at`, `sent_at`.

**`steps`**, a list of `QuestStep`, at most 40:

| Field | Kinds | Notes |
|---|---|---|
| `id` | all | Short id, unique within the quest |
| `kind` | all | `read`, `choice`, `check`, `reply`, `end` |
| `text` | all | ≤ 4000. The DM's words. Plain text, rendered with line breaks, never as HTML |
| `image_url` | all | Optional. `https://…` or `/uploads/…` |
| `next` | read, reply | The step that follows |
| `options` | choice | 2 to 4 of `{label (≤ 120), next}` |
| `skills` | check | 1 to 3 skill names; the player picks one |
| `dc` | check | 1 to 30. Never sent to the phone |
| `pass_next`, `fail_next` | check | May be the same step |
| `gp` | all | −1000 to 10000, applied on arrival. Negative is a cost |
| `item_ids` | all | Up to 5, granted on arrival |

Rules, checked when a quest is sent (a draft may be unfinished):
- `start_step` exists, every link points at a step, and every step can be reached.
- No cycles, and every path reaches an `end`.
- An `end` has no links.
- Every item is one the DM can see.

**`side_quest_runs`** (0065): `id`, `quest_id` (FK, indexed), `character_id` (FK, indexed), `step_id`, `status` ("new" | "active" | "done"), `log` (JSON), `created_at`, `opened_at`, `finished_at`. Unique on (`quest_id`, `character_id`).

**`log`** entries: `{step_id, kind, at, option?, skill?, die?, bonus?, total?, passed?, real?, reply?, gp?, items?}`.

**The phone's view of a run** (`QuestRunView`): `run_id`, `title`, `status`, `step` (`id`, `kind`, `text`, `image_url`, `options` as `[{index, label}]`, `skills` as `[{name, bonus}]`), `outcome` of the last action (`die`, `bonus`, `total`, `passed`, `real`, `gp`, `items`). Never `dc`, `next`, `pass_next`, `fail_next`, or other steps.

---

## Routes
**DM** (campaign owner; 403 for others, 404 for none, 422 for a bad field, 409 for a refused change):
- `GET`/`POST /campaigns/{id}/side-quests`
- `GET`/`PATCH`/`DELETE /side-quests/{id}`
- `POST /side-quests/{id}/send` `{character_ids, ping?: {channel_id, npc_id, content}}`
- `GET /side-quests/{id}/runs`

**Player** (play link):
- `GET /play/{key}/side-quests`: the list for the card and Journal
- `GET /play/{key}/side-quests/{run_id}`: the current step
- `POST /play/{key}/side-quests/{run_id}/open`
- `POST /play/{key}/side-quests/{run_id}/advance` `{step_id, option?, skill?, real?, reply?}`. `step_id` guards a double tap: if it isn't the current step, nothing changes and the current view comes back.

---

## Concrete Steps
1. **Backend (lead).** `domain/side_quest.py`; `alembic/versions/0065_side_quests.py`; `db/repos/side_quest_repo.py`; `services/side_quest_service.py`; `api/routers/side_quests.py`; player routes in `api/routers/play.py`; the deletes; `tests/test_services/test_plan136_*.py` and `tests/test_api/test_plan136_*.py`; `frontend/src/api/sideQuests.ts`. Commit.
2. **SD and SP, in parallel,** from that commit.
3. **Gate, docs:** `docs/data_dictionary.md`, `ARCHITECTURE.md`, `docs/SECURITY.md` (the phone's view), the Guide, `docs/QUALITY.md`.

---

## Validation and Acceptance
- [x] The gate passes: pytest, black, isort, flake8, interrogate, pip-audit, tsc, eslint on changed files, vite build.
- [x] A DM writes a five-step quest with a choice, a check and a reply, and sends it to two characters.
- [x] Each character's phone shows a card. Neither sees the other's run, and nothing reaches the TV or other phones when they roll.
- [x] A check shows the real bonus. Passing and failing lead to the steps the DM set.
- [x] Gold and items arrive exactly once, even on a double tap or a repeated request.
- [x] A cost larger than the purse empties the purse without error or a dead end.
- [x] The DM's results show every choice, roll and reply.
- [x] Inspecting the phone's API responses shows no DC, no links, no later steps.
- [x] After sending, words can be edited; links and rewards can't (409).
- [x] A cycle, a dangling link or an unreachable step is refused at send, in plain words.
- [x] Deleting a character or a campaign removes its runs and quests.
- [x] Everything that existed before is unchanged: the full suite passes.
- [ ] On a real iPhone and Android phone: a shake, the iOS motion prompt, a finger hold (TD-136a).

---

## Idempotence and Recovery
- 0065 adds two tables and touches nothing else. Downgrade drops them: quests and logs go, while gold and items already granted stay on sheets.
- `send` skips characters who already have a run. `advance` with a stale `step_id` changes nothing.

---

## Interfaces and Dependencies
**Produces:** the routes above; `frontend/src/api/sideQuests.ts`.
**Depends on:** `character_service`, `inventory_service`, `shop_service`, `crier_service`, the event bus.
**No new packages.**

---

## Outcomes and Retrospective
_Fill in after completion._
