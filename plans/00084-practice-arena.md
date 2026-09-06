# Plan 00084 — Practice Arena: spar with your real sheet, no AI, free

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-05)

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Justin, after a player shared how he'd been practising combat in a chat
model: "Could we build like a practice arena for players into the app?" and,
once the field test's P1 list shipped, "go straight into adding the arena".

The arena is player-facing and free. It teaches the turn (action, bonus
action, when to Dodge, when to spend a slot) against a real foe with the
player's real sheet, and it never writes to that sheet. It's a rules engine,
not a model: every roll is shown, every tip is templated from the state.

## Design
- **Stateless server, JSON on the phone.** `POST /play/{pc}/arena/start`
  snapshots the sheet and a catalog foe into an `ArenaState`;
  `POST /play/{pc}/arena/act` takes that state plus one action and returns
  the next state. The phone keeps the state in localStorage so a pocket
  refresh doesn't lose the fight. No table, no migration, nothing persisted.
- **The sheet, faithfully.** Equipped weapons use the same
  `attack_service.compute_attack` math as the sheet's attack list; cantrips
  and prepared spells use their `damage_dice` / `attack_type` /
  `save_ability` with the caster's attack bonus and DC (cantrips scale at
  5 / 11 / 17); slots come from `spellcasting_service.slot_state`; modeled
  features from the sheet's rows: Second Wind, Action Surge, Rage, Lay on
  Hands, plus Cunning Action Dodge for level-2+ Rogues. No weapon → Unarmed
  Strike.
- **The foe, from its block.** `+N to hit` and the first dice expression in
  each action; Multiattack multiplies the first attack; saves from ability
  scores (stat-block overrides win). `GET /play/{pc}/arena/foes` lists
  catalog (non-custom) monsters, flagging the CR band that fits the level.
- **The referee.** d20 with advantage/disadvantage, crits double the dice,
  nat 1 misses, Dodge gives the foe disadvantage, Rage adds +2 melee and
  halves incoming weapon damage. Dropping to 0 ends the fight with a note
  about death saves at a real table. Flee is allowed.
- **Coach.** Up to three tips per turn from the state: Second Wind under
  half HP with a bonus action free; Action Surge when the foe is nearly
  down; Rage before you attack; cantrips don't run out; Dodge when very
  low. The end screen sums the fight and names the biggest missed play.
- **Phone page** `/play/:pcId/arena`: pick "Surprise me" or a foe; two
  cards with HP bars; the action grid greys out as the action / bonus
  action are spent, with the reason in the tooltip; the log shows every
  die. `⚔️ ARENA` link on the sheet header.

## Verification
- Gate: `tests/test_services/test_arena_service.py` (dice, stat-block
  parsing, a deterministic fight with patched dice: crit kill, action
  economy, foe turn, going down leaves the real sheet untouched, flee and
  the foe list) and `tests/test_api/test_plan84_arena.py` (routes; another
  PC's state is 403); tsc, eslint on touched files, vite build.
- Prod (API 1.7.0, 3af2604): a level-2 Fighter built through the join creator
  (chain mail, longsword, shield in the bag, no warnings) listed 68 catalog
  foes with 25 flagged for its level, started a fight against a random one
  (Gray Ooze, CR 1/2), attacked with Longsword +5 / 1d8+3 each round and won in
  three rounds with 23 dealt and 0 taken; Second Wind and Action Surge were on
  the button grid; acting after the fight returned 422 "The fight is over";
  the real sheet's HP was unchanged afterwards; the campaign deleted (204).
  The Vercel bundle carries the Arena chunk.

## Not in this plan
Multiple foes; reactions (Opportunity Attack, Shield); conditions beyond
Dodge/Rage; monsters' spellcasting; an optional AI narrator for the log
(would be gated like other text AI).
