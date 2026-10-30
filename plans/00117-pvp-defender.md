# Plan 00117 — PvP: the one being hit is a whole character

## Status
[x] Not started  [ ] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-30
**Last updated:** 2026-10-30
**Implemented by:** Claude Code

---

## Purpose
Justin (10/30) picked "Reactions in PvP" and "1v1, Nya vs Thane etc". In a duel the attacker's
whole kit works, but the defender is shown to the engine as a stripped copy (`_as_foe`): plain
AC, raw ability mods for saves, no conditions, and only hit points cross back (`_stow`). So
when a friend attacks: no Shield / Cutting Words / Uncanny Dodge / Deflect Attacks / Hellish
Rebuke, Wild Shape form and temp HP ignored, Shield of Faith ignored, Dodge does nothing,
concentration never checked, save proficiencies missing, and Sleep / Command / Nature's Wrath /
Faerie Fire / Charm Person / Vicious Mockery wear off the moment the caster's turn ends. After
this, the defender gets the same treatment a monster's victim gets. The boss-battle path has
the same holes (Dodge, Shield of Faith, concentration of the PC being hit), fixed alongside.

---

## Progress
- [ ] 1 `ArenaPc.saves` (mod + prof per sheet save proficiency); `_as_foe` uses it + real AC (form, Shield of Faith, shield2); concentration check uses `saves["con"]`
- [ ] 2 Slot carries defender state: `conditions`, `charmed_by`, `dodging`, `reckless`, `auto_reactions` (per seat)
- [ ] 3 `_view` context manager: load any roster creature into the working set as the actor (its persist fields), another as target; write both back on exit
- [ ] 4 Monster → PC path uses `_view` (defender's Dodge / faith / concentration / effects now count)
- [ ] 5 PvP damage: `_damage_dealt` on a PC target routes through the defender view (form, temp HP, rage, resist, concentration, Hellish Rebuke back at the attacker); attack-roll hits offer Shield / Cutting Words / Uncanny Dodge / Deflect first; Shield stops Magic Missile
- [ ] 6 Conditions on a PC: stunned/asleep lose the turn, prone stands up, restrained/poisoned/mocked → disadvantage, charmed can't attack the charmer; Faerie Fire clears when its caster's concentration breaks
- [ ] 7 Attacker dropped by a rebuke mid-turn → turn passes
- [ ] 8 Tests, gate, docs

---

## Surprises and Discoveries
- 10/30: the boss path loads only `reaction_used` from the victim; the victim's `dodging`, `faith`, `effects`, `concentration` are the monster's (empty) — a PC's Dodge does nothing in a boss battle either.
- 10/30: concentration CON save guesses proficiency from class (barbarian/fighter/sorcerer) instead of the sheet.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-30 | How the defender is modelled | (a) defender-scoped copies of every rule (b) swap the defender into the working set and reuse the monster-path functions | (b) via one `_view` context manager | Every defensive rule already exists for "a monster hits you"; one swap reuses them all, as Plan 101 did for the boss |
| 10-30 | Charm target | condition only / remember the charmer | `ArenaSlot.charmed_by` | In a 3-way fight the charmed one may still attack the third |
| 10-30 | Sleep on a PC | 2024 save-then-unconscious / mirror monster rule | mirror the arena's monster rule (asleep until damaged) | One rule for both sides; Sleep's 2024 rewrite is its own job |

---

## Context and Orientation
- `services/arena_service.py`: `_as_foe`, `_stow`, `_draw`, `_PERSIST`, `_damage_dealt`, `_resolve_player_attack`, `_take_damage`, `_reaction_reduces`, `_hellish_rebuke`, `_foe_turn`, `advance_turn`, `act`, `_player_mode`, `_drop_concentration`
- `domain/arena.py`: `ArenaPc.saves`; `ArenaSlot.conditions/charmed_by/dodging/reckless/auto_reactions`; `ArenaState.conditions`
- Tests: `tests/test_services/test_plan117_pvp_defender.py` (new)

**Working set** — `state.pc` (actor), `state.foe` (target), plus the actor's persist fields on `state`. **Defender view** — the same working set with the defender as `pc` and the attacker as `foe`, so `_reaction_reduces`/`_take_damage`/`_hellish_rebuke` read the defender's own state.

---

## Validation and Acceptance
- [ ] Nya (Shield known, slot left) attacked by Thane with a roll that Shield beats → miss, Nya's slot spent, her reaction used until her turn
- [ ] Willa in Wild Shape hit by Creed → beast temp HP absorbs first; form AC used for the hit
- [ ] Willa concentrating on Moonbeam hit by Thane → CON save rolled with her sheet's modifier; fail drops it
- [ ] Thane Dodges; Nya's attacks on her turn roll at disadvantage
- [ ] Creed's Nature's Wrath restrains Thane → Thane's own attacks next turn at disadvantage, condition gone after
- [ ] Sleep on Thane → his turn is skipped until he's hit
- [ ] Boss battle: PC Dodge gives the boss disadvantage; Shield of Faith counts
- [ ] Gate green

---

## Idempotence and Recovery
New sealed fields → in-flight fights expire at deploy (existing "Start over" path). No schema change.

---

## Interfaces and Dependencies
**Depends on:** Plan 116 (same engine file, lands first). **Produces:** `_view` — Plan 118 (Sentinel, Lucky on defence, Mage Slayer) builds on it.

---

## Outcomes and Retrospective
_Fill at completion._
