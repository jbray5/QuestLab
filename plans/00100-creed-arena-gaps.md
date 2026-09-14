# Plan 00100 — Creed's missing arena options: breath weapon and javelin

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-13)

**Started:** 2026-09-11 · **Implemented by:** Claude Code

## Purpose
Justin: "creed brought up that he loves the arena but doesn't see his breath
weapon or javelin on there." Two different causes.

## 1. Breath Weapon — the arena had no species layer at all
It built weapons, spells and class features. Nothing read `race`, so **no
dragonborn has ever had a breath weapon**, in any fight, since the arena
shipped.

`_species_extras()` now runs beside `_class_extras()`. Dragonborn get Breath
Weapon as printed: a 15-ft cone on the Attack action, DEX save
`8 + CON + PB` for half, `1d10` rising at levels 5/11/17, uses equal to the
proficiency bonus per long rest tracked as its own counter (spent by the
attack; clicking the counter points you at the attack rather than erroring).

**The ancestry problem.** There is no ancestry column on a character — only
`race: "Dragonborn"`. The damage type is read off whatever the DM wrote on the
sheet, and Creed's says *"Species: Fire breath weapon, Fire resistance,
Darkvision."* The regex takes a damage word within 24 characters either side of
"breath" and falls back to fire, which is both the commonest pick and visibly
wrong rather than silently absent if a sheet says nothing.

Live for Creed: **Breath Weapon (fire), DC 11 DEX, 1d10, half on a save, 2 uses.**

## 2. The javelin was simply not on his sheet
Nothing to fix in the arena's build — his inventory held a longsword, a cloak,
rope, a grappling hook and a potion. Justin confirmed six javelins are on his
physical sheet as 2024 Paladin starting equipment.

The catalog only had the magic *Javelin of Lightning*, so the plain weapon was
added (Simple Melee, 1d6 piercing, Thrown 30/120, mastery Slow) and six went
to Creed, equipped.

## 3. …which exposed a real gap: a thrown weapon could not be thrown
Plan 88 classed thrown weapons as melee so Divine Smite would ride a javelin.
That was correct, but it left exactly one button and no way to hurl one.

A thrown weapon now yields **two** entries:

| | melee | smite | Dueling |
|---|---|---|---|
| `Javelin` | yes | rides it | +2 |
| `Javelin (thrown)` | no | no | no |

Both verified on prod: the swing is `+5 1d6+5` with Dueling, the throw is
`+5 1d6+3` noted `30/120 ft · no smite on a throw`.

## Verification
`tests/test_services/test_plan100_breath.py` (9) and
`test_plan101_thrown.py` (3): the breath appears with the right DC, dice and
uses; a non-dragonborn gets nothing; the dice scale at level 5; four ancestry
strings parse with fire as the fallback; two uses then a refusal; the swing
smites and the throw is refused a smite; a longsword gets no second button.
Full suite 907 passed.
