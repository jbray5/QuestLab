# Plan 00092 — Aunti Sorrel's stat block: the real Green Hag

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-07)

**Started:** 2026-09-07 · **Implemented by:** Claude Code

## Purpose
Justin gave the 2024 Green Hag block for Aunti Sorrel: "code it in." The
catalog already had a Green Hag, but a wrong one — Draconic where the block
says Elvish, Arcana +3 for +5, no swim speed, damage resistances a green hag
never had, no traits at all, and a single lumped "Claws, +6 to hit, 2d8+4".

## Shipped
- **The block, corrected** in `integrations/dnd_rules/stat_blocks.py` and on
  the live row: AC 17, 82 HP (11d8+33), Speed 30 / Swim 30, Arcana +5,
  Darkvision 60, Common / Elvish / Sylvan, CR 3, no resistances. Traits
  Amphibious, Coven Magic (DC 11) and Mimicry (DC 14 Insight). Actions
  Multiattack, Claw (+6, 1d8+4 slashing plus 1d6 poison) and Spellcasting
  (DC 12, +4; Dancing Lights, Disguise Self, Invisibility, Minor Illusion,
  Ray of Sickness at level 3).
- **Aunti Sorrel is linked to it**, so her NPC card carries the block.
- **The arena reads 2024 action text.** Its foe parser only understood
  "+6 to hit", so every 2024-phrased block silently fell back to a 1d4 Slam.
  It now also reads "Melee Attack Roll: +6" and finds the damage type past
  the parenthesis in "Hit: 8 (1d8 + 4) Slashing damage".
- **The descriptive half of a stat block is editable.** `MonsterStatBlockUpdate`
  carried only the numbers and action lists, so a PATCH naming languages,
  senses, alignment, size, creature type or the damage lists was silently
  dropped — the reason the first correction left the wrong languages in
  place. Those fields are now on the schema.

## Verification
- `tests/test_services/test_plan92_green_hag.py`: the catalog row matches the
  2024 block; the hag parses into two claws at +6 for 1d8+4 slashing; the
  older "+6 to hit" phrasing still parses.
- `tests/test_services/test_plan92_monster_update.py`: languages, senses and
  the damage lists round-trip through an update; an omitted field is left
  alone. Full suite: 887 passed.
- Prod: the live row reads Elvish, no resistances, swim 30, Arcana +5, all
  three traits and all three actions; Aunti Sorrel points at it; starting an
  arena fight against her gives `Claw +6, 1d8+4 slashing, ×2`.

## Not modeled
The arena rolls the claw's 1d8+4 slashing but not its 1d6 poison rider (one
damage expression per foe attack), and Coven Magic and Spellcasting are text
for the DM — the referee does not cast them.
