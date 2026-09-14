# Plan 00101 — Arena duels: hot-seat PvP for the whole table

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-13
**Last updated:** 2026-09-13
**Implemented by:** Claude Code

---

## Purpose
Chelsea asked to fight Parker's character in the Practice Arena. Justin widened
it: any combination of the table's real characters, initiative rolled, hot-seat
on one device, with the arena getting its own landing page.

Today the arena is strictly one PC versus one monster, and the monster's turn is
played by the referee. When this is done, a duel is N characters taking turns in
initiative order on one screen, and the existing PC-versus-monster fight is the
same engine with one of the sides auto-played.

Nothing here touches a real character sheet: a duel is still a sealed JSON
document the device holds, exactly as the solo arena is.

---

## Progress
- [x] Step 0: Measure the asymmetry (2026-09-13) — 141 reads of top-level turn
      state vs 32 `state.pc` / 27 `state.foe`. This is the whole cost.
- [ ] Step 1: `ArenaCombatant` — one shape for a PC side and a monster side
- [ ] Step 2: `ArenaState` becomes a combatant list + initiative order
- [ ] Step 3: Move the 141 turn flags onto the active combatant
- [ ] Step 4: `start_duel()` — build N sides from PCs, roll initiative
- [ ] Step 5: Auto-play stays for monster sides only
- [ ] Step 6: Routes — `POST /arena/duel/start`, reuse `/arena/act`
- [ ] Step 7: The landing page and the hot-seat UI
- [ ] Step 9: Paced log playback (Cory's ask — frontend only)
- [ ] Step 10: `auto` sides — party vs boss with allies played by the referee
- [ ] Step 8: Tests, prod verification

---

## Scope answered and widened (2026-09-13)
Justin's rulings:
- **Initiative rolled fresh each fight.** No persistent ladder.
- **No positioning, and that is deliberate** — assume every attack is valid.
  Ranged spell attacks are fine, melee sneak attacks are fine. This closes the
  open question below; v1 ships abstract and stays abstract.
- **Hit points are the characters' real ones**, not normalised for fairness.
  `_build_pc` already does this.

Two more asks came back from the table's Discord:
- **Cory (Creed): paced playback.** *"I press buttons and it all resolves
  instantly. I'd like the thinking and anticipation!"* The log should reveal a
  line at a time rather than dumping the whole turn. Frontend only — the engine
  already returns an ordered log; `Arena.tsx` just renders it all at once.
- **Cory (Creed): a boss battle.** *"Could it simulate all of us in a battle?
  I only get to pick my stuff but the AI picks what Hayley Parker and Chelsea
  do."* This is nearly free once Steps 1–3 land: an ally side is a PC-backed
  combatant that the referee plays, which is the same machinery as a monster
  side that the referee plays. It becomes a flag on the combatant
  (`auto: bool`) rather than a second engine.

That makes three modes out of one refactor: solo vs monster (today), hot-seat
duel, and party vs boss with allies auto-played.

## Surprises and Discoveries
- **The arena has no positioning at all.** No distance, movement, cover or
  range bands — attacks carry only a `melee` boolean. Against monsters this is
  invisible. In a rogue-versus-sorcerer duel it decides the fight: Thane closes
  for free every round and Nya can never kite. Flagged to Justin; see the
  Decision Log for the chosen stopgap.
- The seal (`integrations/arena_signing.py`) binds a document, not a device, so
  hot-seat needs no change to it. Two *phones* would, which is why this plan is
  hot-seat only.
- `ArenaState.pc_id` is a single UUID used by the routes for ownership. A duel
  needs the whole roster checked, not one id.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-13 | Delivery shape | (a) hot-seat one device (b) two phones, server-authoritative (c) async by link | (a) | (b) means the fight lives in the DB with invites, turn ownership and disconnects, and it throws away the "a practice fight never writes anything" property. Both need the same symmetry refactor first, so (a) is a strict prefix of (b). |
| 2026-09-13 | Unify or fork the engine | (a) one engine, a side is PC-backed or monster-backed (b) a separate PvP engine | (a) | A fork doubles every future rules fix. The existing fight becomes the case "one PC side, one monster side that auto-plays". |
| 2026-09-13 | Positioning | (a) ship abstract, no distance (b) add range bands (c) full grid | (a) for v1, revisit | A grid is a different product. Abstract keeps this shippable; if duels get used, range bands are the smallest honest fix. Justin to confirm he is happy with melee-anywhere for v1. |
| 2026-09-13 | Turn state location | (a) keep top-level, swap contents per turn (b) move onto the combatant | (b) | (a) breaks the moment anything persists across your own turns (concentration, marks, timed effects, sorcery). Those are per-creature facts, not per-turn. |

---

## Context and Orientation

### Files touched
- `domain/arena.py` — combatant model, state model, action model
- `services/arena_service.py` — the engine (~2200 lines; the bulk of the work)
- `api/routers/play.py` — duel start route
- `frontend/src/pages/Arena.tsx` — hot-seat turn UI
- `frontend/src/pages/ArenaLanding.tsx` — **new**, the duelling hall
- `frontend/src/App.tsx` — route for the landing page
- `tests/test_services/test_arena_duel.py` — **new**

### Architecture layers involved
`api/ → services/ → db/repos/ → domain/`. The engine stays in `services/`; the
models stay in `domain/`. No new DB table — a duel is never persisted.

### Key terms defined
- **Hot-seat** — one device, passed between players; the app shows whoever's
  turn it is.
- **Side / combatant** — one creature in the fight. Backed by a real character
  (a human decides) or a monster stat block (the referee decides).
- **Seal** — the HMAC over the fight JSON that proves the device did not edit
  it. `integrations/arena_signing.py`.

---

## Concrete Steps

### Step 1: One shape for both sides
**File:** `domain/arena.py` · **Action:** Modify
**Details:** Add `ArenaCombatant` carrying identity (name, ac, hp, hp_max),
the side kind (`"pc" | "monster"`), everything `ArenaPc` holds today, plus the
per-creature state currently at the top of `ArenaState`: `concentration`,
`marks`, `blessed`, `faith`, `innate_sorcery`, `spiritual_weapon`, `effects`,
`tides_primed`, `conditions`, and the per-turn flags `action_used`,
`bonus_used`, `reaction_used`, `attacks_left`, `hit_this_turn`,
`melee_hit_this_turn`, `sneak_used`, `stun_used`, `reckless`, `adv_next`,
`dodging`. Monster sides keep `attacks: list[ArenaFoeAttack]` and `saves`.
**Verify:** `python -c "from domain.arena import ArenaCombatant"`.

### Step 2: The state becomes a roster
**File:** `domain/arena.py` · **Action:** Modify
**Details:** `ArenaState.combatants: list[ArenaCombatant]`, `order: list[int]`
(indices, initiative order), `turn: int` (position in `order`), `round`.
Keep `pc`/`foe` as read-only properties resolving to `combatants[0]` and
`combatants[1]` so nothing outside the engine breaks mid-refactor.
**Verify:** existing arena tests still import and construct a state.

### Step 3: Move the turn flags (the big one)
**File:** `services/arena_service.py` · **Action:** Modify
**Details:** Replace the 141 `state.<flag>` reads with `actor.<flag>` where
`actor = state.combatants[state.order[state.turn]]`, and `target` for the
other side. Work function by function; the arena suites are the safety net.
**Verify:** `pytest -q tests/test_services/test_arena*.py` green at every step.

### Step 4: Start a duel
**File:** `services/arena_service.py` · **Action:** Modify
**Details:** `start_duel(db, pc_ids, dm_email)` builds one combatant per PC via
the existing `_build_pc`, rolls `d20 + DEX` each, sorts, seals. Two or more
characters; no upper bound beyond what fits the screen.
**Verify:** a unit test starts a Nya-vs-Thane duel and asserts the order.

### Step 5: Auto-play only monsters
**File:** `services/arena_service.py` · **Action:** Modify
**Details:** `end_turn` advances `turn`; if the next side is a monster, run the
existing `_foe_turn` logic against it and advance again. If it is a PC, stop
and wait for input. Round increments on wrap.
**Verify:** the existing PC-vs-monster tests are unchanged in behaviour.

### Step 6: Routes
**File:** `api/routers/play.py` · **Action:** Modify
**Details:** `POST /play/{pc_id}/arena/duel/start` with a body of the other
character ids. `/arena/act` already takes the whole state, so it needs only the
ownership check widened from one `pc_id` to the roster.
**Verify:** `curl` a duel start on prod and get a sealed state back.

### Step 7: The duelling hall
**File:** `frontend/src/pages/ArenaLanding.tsx` · **Action:** Create
**Details:** Route `/play/:pcId/arena` becomes the landing: the campaign's
characters as pickable cards, "fight a monster" (today's flow) or "duel",
initiative shown after the roll. The fight screen gets a "pass the device"
banner naming whose turn it is, and renders the active combatant's own grid.
**Verify:** click through on prod; both characters' options appear on their
own turns.

### Step 8: Tests
**File:** `tests/test_services/test_arena_duel.py` · **Action:** Create
**Details:** initiative order is deterministic under a patched RNG; each side
carries its own slots, concentration and timed effects across rounds; a rogue's
Sneak Attack fires against a PC target; ending a turn hands over rather than
auto-playing; a monster side still auto-plays.

---

## Validation and Acceptance
- [ ] `pytest -q` — zero failures, existing arena suites unchanged
- [ ] `black . && isort . && flake8 && interrogate -c pyproject.toml` clean
- [ ] Nya vs Thane on prod: initiative rolls, each player sees their own
      actions on their own turn, Wild Magic surges and Sneak Attack both fire
- [ ] A PC-vs-monster fight still plays exactly as before
- [ ] The landing page lists the table's characters

---

## Idempotence and Recovery
Steps 1–3 are one refactor and must land together; the arena suites tell you
where you are. Steps 4–8 are independent and re-runnable. Nothing writes to the
database, so a failed attempt leaves no state to clean up.

---

## Interfaces and Dependencies
**Produces:** a symmetric arena engine — the prerequisite for two-phone PvP
later, should it be wanted.
**Depends on:** the existing `_build_pc` (Plans 84–88, 100, 101) which already
models every class, subclass, species and weapon the table uses.

---

## Outcomes and Retrospective
_To be filled in on completion._
