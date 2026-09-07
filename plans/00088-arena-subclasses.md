# Plan 00088 — Practice Arena: the table's subclasses

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-06 · **Implemented by:** Claude Code

## Purpose
Justin: "Is Nya's wild magic factored into the arena?" — it wasn't — then
"gotta have subclasses at least for my players. Star chart stuff for Willa
too." His table: Nya (Sorcerer, Wild Magic), Willa (Druid, Circle of Stars),
Creed (Paladin, Oath of the Ancients — Nature's Wrath landed in Plan 87),
Thane (Rogue, Soulknife — psychic blades landed in Plan 87).

These are PHB subclasses, not SRD: their mechanics are served only when the
owning DM has personal content (`entitlement_service.personal_content_allowed`),
the same gate the sheet uses for subclass text. The SRD build never shows them.

## Shipped
- **Wild Magic Sorcerer.** After every leveled spell the referee rolls a d20;
  on a 1 the Wild Magic Surge table fires (`integrations/dnd_rules/wild_magic_2024.py`,
  fifty entries, 2024 style, adapted to a duel: regeneration, disadvantage on
  the foe's next save, spells as bonus actions, the Astral Plane, maximized
  damage, resistance, the potted plant, invisibility, the spectral shield, an
  extra action, a random spell of ten, Frightened, poison, radiance, necrotic
  drain, lightning, piercing vulnerability, a slot back; the rest logged as
  flavor). **Tides of Chaos**: advantage on your next attack and a guaranteed
  surge on your next leveled spell, which gives Tides back. **Metamagic from
  the sheet's feats**: Seeking Spell rerolls a missed spell attack for one
  sorcery point (automatic); Quickened Spell is offered only to sorcerers who
  have it. Sorcery points come from the sheet's row. **Sorcerous Burst** is an
  attack cantrip whose 8s explode (up to CHA modifier times).
- **Circle of Stars Druid.** **Star Map**: Guiding Bolt without a slot, from the
  sheet's uses. **Starry Form** (bonus action, a Wild Shape use, ten rounds):
  Archer (a bonus-action Luminous Arrow, 1d8 + WIS radiant), Chalice (healing
  spells cast with a slot heal 1d8 + WIS more), Dragon (concentration checks
  can't roll below 10).
- **Oath of the Ancients' prepared spells.** Ensnaring Strike as a bonus-action
  rider after a melee hit (STR save or Restrained, 1d6 piercing); Command
  (WIS save or Grovel → Prone).
- **Control spells for everyone**: Faerie Fire (DEX save; advantage on attacks
  against the foe while you concentrate) and Charm Person (WIS save with
  advantage; the foe won't attack until you hurt it).
- **Phone**: chips for the active form, a primed Tides, Wild Magic, and every
  timed effect with rounds left.

## Verification
- `tests/test_services/test_arena_subclasses.py` (9 scripted fights): a 1
  after Magic Missile surges into lightning; the owner gate hides it all;
  Tides primes a sure surge and comes back; Seeking Spell rerolls a miss and
  costs a point; Star Map bolt spends a use and grants advantage; Archer form
  spends a Wild Shape use and adds the bonus-action arrow; Chalice adds to a
  slot heal; Ensnaring Strike restrains after a hit and spends the slot;
  Command's Grovel knocks the foe prone; Faerie Fire then Charm Person. Full
  suite green.
- Prod: see the commit that flips this plan to Complete.

## Not modeled
Twinned Spell (nothing to twin in a duel), Font of Magic slot conversion,
Psionic Power for the Soulknife (utility), Speak with Animals, Misty Step,
Aid, Goodberry.
