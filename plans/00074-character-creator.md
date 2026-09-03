# Plan 00074 — Join → create your character

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-03 · **Implemented by:** Claude Code

## Purpose
Justin: "a frictionless join → create character flow, with an actual
character creator with all races/classes/subclasses, the full compendium
built in." The D&D Beyond gap: scan the TV → build yourself → play, with
the DM touching nothing.

## Licensing line (the shape of the build)
The shippable compendium is **SRD 5.2.1** (CC-BY 4.0): 9 species, 12
classes with their SRD subclass, 4 backgrounds, 10 origin feats, the SRD
spell list (already seeded), SRD weapons (seeded) and armor. Non-SRD
picks — most PHB subclasses (Circle of Stars, Soulknife, Oath of the
Ancients, Wild Magic…), other species/backgrounds — are entered as
"from my book": the name is recorded, the numbers are the player's to
track. The class-feature catalog currently seeds two PHB subclasses'
feature text; flag for the public launch (see LAUNCH.md).

## Shipped
- `integrations/dnd_rules/srd_character_options_2024.py` — species,
  backgrounds, origin feats, class tables (hit die, saves, skills, armor,
  spellcasting caps by level, SRD subclasses, starting kits), armor table
- `services/character_builder_service.py` — options + create: score
  validation (standard array / point buy / manual + background bonus),
  skill rules, derived HP/AC/speed/saves, spells within class list and
  caps, features via level sync, starting kit into inventory
- `GET/POST /play/join/{campaign_id}/options|characters` (capability URL)
- `campaigns.allow_player_signup` (migration 0042) + DM toggle
- `/join/:campaignId/new` — the phone-first wizard; "New character" card
  on the join page; lands on the new sheet and remembers it

## Follow-ups
- Level-up wizard on the phone (Field Guide #7) reusing the same tables
- Species lineage/ancestry sub-choices (Elf lineage, Dragonborn type)
- DM "approve new characters" queue for public campaigns
