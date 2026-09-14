# Plan 00102 — A maximize surge has to actually maximize

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-13)

**Started:** 2026-09-13 · **Implemented by:** Claude Code

## Purpose
Chelsea, playing Nya in the arena: *"It shows what it's doing which is fun but
it doesn't actually take effect."* Her Magic Missile rolled 3d4+3 → [2,3,4]+3
= 12 with a maximize surge pending. It should have paid **15**. She assumed it
was too much to program and had just been enjoying reading the surges.

## The bug
`maximize_next` was applied in exactly one place: inside the
`if attack.hit_bonus is not None:` branch of `_resolve_player_attack` — the
attack-roll path. A spell with no attack roll never reached it:

- **Magic Missile** auto-hits and falls to the final `else` branch.
- **Thunderwave, Aganazzar's Scorcher, Command** call for a saving throw and
  take the save branch.

Both branches share one earlier `roll_expr()` that nothing checked. So the log
announced the surge, the dice came up normal, and nothing in the numbers ever
disagreed loudly enough to notice. Chelsea noticed.

## The fix
One `_maximize()` helper, called on all three damage paths. On the save path it
runs *before* the halving, so a maximized spell that is saved against deals half
of the maximum rather than half of a fresh roll.

## Verification
`tests/test_services/test_plan102_maximize.py` (4): Chelsea's exact case pays
15; a saved Thunderwave pays 8 (2d8 maximized = 16, halved); the attack-roll
path still works; no surge leaves the dice alone. Full suite 911 passed.

**On prod, through the real surge path** — the seal refuses a hand-edited
state, so the effect could not be planted. Instead: Tides of Chaos forces a
surge, retry fresh fights until the d100 lands in the maximize band (29–32).
It came up on attempt 21, and the next Magic Missile logged:

```
Magic Missile lands for 15 force.
3d4+3 → [1, 2, 1]+3 = 7 → maximized 15
```

Rolled 7, paid 15. (The verification script printed FAIL on its own arithmetic
— it compared foe HP before and after, and the dragon had only 5 HP left to
take. The log line is the proof.)

## Surprise
The test passed alone and failed in the full suite. `_spell()` in
`tests/test_services/test_arena_rules.py` **reuses any catalog row with a
matching name**, and the SRD seed already ships a Fire Bolt — so the test was
asserting against a different spell than the one it thought it made. Renamed to
a test-only spell. Worth remembering for every future arena test.
