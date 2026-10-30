# Plan 00116 — Boss battles with everyone on their own phone

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (local; awaiting push approval)

**Started:** 2026-10-30
**Last updated:** 2026-10-30
**Implemented by:** Claude Code

---

## Purpose
Justin (10/30): "keep building out the arena" — first pick: the party vs a monster with each
player on their own phone. Plan 104 put *duels* on separate devices (fight stored in the `duels`
row, server checks whose turn); the boss battle is still one phone where the holder drives one
character and the referee plays the rest. After this: Arena → 🛡 Boss battle → pick who's in →
"📱 Everyone on their own phone" → pick the boss; each player is called in, takes their own
turns, the referee plays the monster in between, and allies can be healed. Also fixes the end
screen telling the loser of a duel "🏆 You win".

---

## Progress
- [x] 1 Engine: `start_boss(controlled=None)` = nobody auto; boss picks a random living target each turn
- [x] 2 Engine: `referee_takes(state, index)` / `player_returns(state, index)` (absent player)
- [x] 3 Engine: heal an ally — heal spells + Lay on Hands accept an ally `target`
- [x] 4 Service/API: `duel_service.start(..., monster_id)`, `hand_over`, `take_back`; DuelStartBody.monster_id; DuelSummary mode/boss
- [x] 5 Frontend: boss "own phone" toggle, boss challenge banner, hand-over/take-back, ally heal picker, per-viewer end screen + rematch
- [x] 6 Tests (engine + service + HTTP), quality gate, docs (ARCHITECTURE, TESTING)
- [x] 7 Local two-browser run (Playwright, two contexts)

---

## Surprises and Discoveries
- 10/30: end screen reads `state.result == "won"` → every duel ends with "🏆 You win" on the loser's phone too (roster fights set "won" whenever anyone stands). Fix: work out the viewer's own seat.
- 10/30: "Again — same foe" on a duel/boss end screen starts a *solo* fight.
- 10/30: the turn header read "your turn" on the phone that was waiting. Fixed.
- 10/30: the boss always swings at `enemies[0]` (first PC in roster order) — in a 4-phone fight one player takes every hit.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-30 | Where an own-phone boss fight lives | new table / reuse `duels` row | reuse `duels` (state.mode = "boss") | Same seat/turn/SSE machinery; no migration |
| 10-30 | Boss targeting | first enemy / random living / lowest HP | random living enemy (`_RNG.choice`) | Spreads the hits; tests' `_Fixed.choice` = seq[0] keeps old behaviour |
| 10-30 | Absent player | block / host-only hand-over / any seat may hand the *up* seat to the referee | any seat hands over the seat that is up; only the owner takes it back | A dead phone mustn't stall four people; friendly table |
| 10-30 | Ally healing | self only / ally target | heal spells + Lay on Hands may target a living ally | Co-op is the point of a party fight |

---

## Context and Orientation

### Files touched
- `services/arena_service.py` — `start_boss`, `_draw` (boss target), `referee_takes`, `player_returns`, ally heal in `act`/`_resolve_buff`/`_feature`
- `domain/duel.py` — `DuelStartBody.monster_id`, `DuelSummary.mode`/`boss`
- `services/duel_service.py` — `start(monster_id)`, `hand_over`, `take_back`
- `api/routers/duels.py` — `POST /play/{pc}/duels/{id}/referee`, `POST /play/{pc}/duels/{id}/return`
- `frontend/src/pages/Arena.tsx`
- tests: `tests/test_services/test_plan116_boss_live.py` (new), `tests/test_api/test_plan104_duels.py`

### Key terms
- **Roster fight** — `ArenaState.roster` non-empty (duel or boss). Engine holds one actor (`state.pc`) and one target (`state.foe`); `_stow` writes the working set back to the roster, `_draw` loads the next.
- **auto seat** — `ArenaSlot.auto`; `advance_turn` plays it (monster: `_foe_turn`; PC: `_auto_swing`).
- **Own-phone fight** — a `duels` row holding the sealed state; `duel_service.act` refuses anyone whose seat isn't up.

---

## Concrete Steps
1. `start_boss(db, pc_ids, monster_id, controlled: Optional[UUID])`: `auto = controlled is not None and pc_id != controlled`; `pc_id = controlled or pc_ids[0]`.
2. `_draw`: if the drawn slot is a monster, `target_index = _RNG.choice(enemies)`.
3. `referee_takes(db, state, index)`: slot must be a PC; set `auto=True`; if it is up: `_auto_swing` (if action free) then `advance_turn`; reseal. `player_returns(db, state, index)`: `auto=False`; reseal.
4. Ally heal: `ArenaAction.target` naming a same-team living PC on a heal-effect attack or `lay_on_hands` → heal lands on that slot's `pc` (no `aim`). Log names the ally.
5. `duel_service.start(db, host, pc_ids, monster_id=None)`: boss → `start_boss(..., controlled=None)`. `hand_over(db, duel_id, pc_id)` (any seat, acts on the up seat), `take_back(db, duel_id, pc_id)` (own seat). Publish `duel.updated`.
6. Frontend per Purpose; end screen: my team standing → "🏆 You win"/"🏆 The party wins"; else "💀 {winners} win(s)"; fled → "🏳 Called off". Rematch re-runs the same start call.

---

## Validation and Acceptance
- [x] `pytest -q` passes (1014); black/isort/flake8/interrogate/pip-audit clean; `npm run build`, changed files lint clean
- [x] Boss own-phone: two seats, monster auto; out-of-turn act → 403; boss turn runs between humans; boss hits are spread (non-`_Fixed` RNG)
- [x] Hand-over: Thane's seat handed to referee → his turn auto-played, fight continues; Thane takes back → his next turn waits for him
- [x] Ally heal: Willa's Cure Wounds on Creed raises Creed's roster HP, not hers
- [x] Loser of a live duel sees "💀 … wins"; winner sees "🏆 You win"
- [x] Local: two Chrome contexts, Nya + Thane vs a boss, both phones update live

---

## Idempotence and Recovery
No schema change. Engine changes are additive; solo path untouched (`roster` empty). The seal is an HMAC over `model_dump_json`, so any new ArenaState/ArenaSlot field invalidates fights in flight at deploy: they get the existing "Start over — this fight expired" path, and `duel_service.end` already closes a row whose seal no longer verifies. Deploy between sessions.

---

## Interfaces and Dependencies
**Produces:** own-phone boss battles; hand-over; ally heals. **Depends on:** Plan 101 roster engine, Plan 104 duels row + `duel:{id}` SSE.

---

## Outcomes and Retrospective
2026-10-30: shipped locally. Two headless Chrome phones (Nya hosting, Creed called in by the 🐉 banner) fought a Gnoll from a copy of the live party: turns alternated with the Gnoll between them, both phones followed over SSE, Creed handed Nya's seat to the referee (it cast Magic Missile for her), Nya took it back, End the fight gave both phones "🏳 Called off".

**Finding:** own-phone boss battles needed no new engine — `start_boss(controlled=None)` (nobody auto) plus the Plan 104 row. The two real holes were presentation: the end screen judged "won" from the fight's point of view rather than the viewer's, and the boss always hit seat one.
