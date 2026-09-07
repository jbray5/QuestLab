# Plan 00089 — Practice Arena: every spell slot accounted for

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-06)

**Started:** 2026-09-06 · **Implemented by:** Claude Code

## Purpose
Justin: "Make sure all spell slots are accounted for." The arena copied the
sheet's slot counts correctly (Plan 85), but it did not *use* them
correctly: a higher slot was spent and bought nothing, a warlock's pact slots
could never pay for Shield or Hellish Rebuke, a sorcerer had no Font of
Magic, the phone showed a bare count with no maximum, and the Wild Magic
"regain a slot" surge handed out a slot that was never spent.

## Shipped
- **Upcasting is real.** The slot actually spent (the picker's choice, or the
  lowest slot that can pay — a pact slot upcasts automatically) scales the
  spell: Magic Missile one more dart per level, Scorching Ray one more ray,
  Cure Wounds +2d8 and Healing Word +2d4 per level (2024), Guiding Bolt +1d6,
  Searing Smite and Ensnaring Strike +1d6, Divine Smite +1d8 (already), and
  every catalog spell whose "higher levels" text says "increases by NdM for
  each spell slot level above" (Thunderwave, Aganazzar's Scorcher, Burning
  Hands, Inflict Wounds …). The log names the slot: "(level 2 slot)".
- **Reactions use any slot.** Shield and Hellish Rebuke spend the lowest slot
  that can pay, pact slots included; Hellish Rebuke deals 2d10 + 1d10 per
  level of the slot used.
- **Font of Magic (sorcerer 2+).** Two bonus-action features: make a slot from
  sorcery points (L1 for 2, L2 for 3 at level 3+, L3 for 5 at level 5+, L4 for
  6 at 7+, L5 for 7 at 9+) and convert a slot into points equal to its level,
  capped at the sheet's maximum.
- **Maxima travel with the fight.** `slots_max` and `sorcery_max` come from
  the sheet; the phone shows "L1 slots 3/4" and "Sorcery 2/3". A surge's
  "regain your lowest expended slot" now returns only a slot that was spent.
- **Phone.** Every leveled spell with more than one slot level available gets
  a Slot L1 / L2 picker (action and bonus grids, riders included) with the
  scaling hint beside it; Font of Magic cards list only the affordable
  choices; a fight in the ring still never writes to the sheet.

## Verification
- `tests/test_services/test_arena_slots.py` (7 fights): four darts at level 2;
  Cure Wounds 4d8 at level 2; Thunderwave 3d8 from the catalog text; a
  level-3 warlock's Shield then Hellish Rebuke (3d10) off pact slots; Font of
  Magic make/convert with the level gate, the point cost, and the cap; slots
  spent on the sheet arrive spent; regain-a-slot needs a spent slot. All
  arena suites: 41 passed. Full suite green.
- Prod (41cddee, API live 60 s after push), against the real sheets: **Nya**
  — slots 4/4 and 2/2 with sorcery 3/3; features innate_sorcery, create_slot,
  convert_slot, tides_of_chaos; Font of Magic turned 2 points into a fifth
  level-1 slot; Magic Missile's note reads "one more per slot level up" and a
  level-2 cast spent the level-2 slot (2 → 1). **Willa** — Cure Wounds
  upcast 2d8; a level-2 cast logged "Cure Wounds (level 2 slot)" with
  4d8+3. A hand-edited HP value was refused (422, altered or expired). The
  Arena bundle on Vercel carries the Font of Magic cards and slot pickers.

## Not modeled
Spiritual Weapon's +1d8 per two levels; Sleep is still the 2014 HP pool;
Twinned Spell; Careful/Distant/Extended Spell; Sorcerous Restoration.
