# Plan 00118 — Feats in the fight

## Status
[x] Not started  [ ] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-30
**Last updated:** 2026-10-30
**Implemented by:** Claude Code

---

## Purpose
The arena reads the sheet's fighting styles (Archery, Dueling, Defense, GWF) and Tough (via max
HP) and nothing else from `feats`. Thane's Lucky does nothing today, and the party is choosing
level-4 feats now (Plan 115). After this, the feats a fight can use — the party's own and the
level-up guide's popular picks for their classes — act in the arena; the ones that need range,
cover or hiding are named once at the start as "not in play here".

---

## Progress
- [ ] 1 Lucky — luck points = PB: a free "advantage on my next attack" button; with automatic reactions on, a hit against you makes the attacker roll again and keep the lower
- [ ] 2 Alert — +PB initiative
- [ ] 3 War Caster — advantage on concentration saves; Resilient — via sheet saves (Plan 117)
- [ ] 4 Elemental Adept (Type) — 1s count as 2s on that type's spell damage
- [ ] 5 Savage Attacker — once per turn, weapon damage rolled twice, keep the higher
- [ ] 6 Great Weapon Master — heavy weapon hit: +PB once per turn; Hew: crit or drop → bonus-action swing
- [ ] 7 Shield Master (with a shield) — bash after a melee hit: STR save or Prone, once per turn; Interpose: a DEX save made against half damage takes none
- [ ] 8 Heavy Armor Master (heavy armor) — weapon damage on you − PB
- [ ] 9 Mage Slayer — your damage gives disadvantage on their concentration save; once per fight a failed INT/WIS/CHA save succeeds
- [ ] 10 Inspiring Leader — temp HP (level + WIS/CHA) to you and your side at the start
- [ ] 11 Sentinel — boss battle: the boss hits an ally → your reaction swing at it
- [ ] 12 Tavern Brawler (1d4 unarmed, reroll 1s), Polearm Master (bonus 1d4 butt strike)
- [ ] 13 "Not in play here" start line (Sharpshooter, Skulker, Crossbow Expert, Spell Sniper, Speedy, Telekinetic, Charger, Mobile…)
- [ ] 14 Tests, gate, docs

---

## Surprises and Discoveries
None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-30 | Which feats | all 2024 feats / party + popular L4 picks that a positionless fight can use | the latter | Arena has no range, cover, movement or hiding; Justin's table is the user |
| 10-30 | Lucky on defence | ask / never / automatic with the reactions toggle | automatic, under the existing "Reactions: on" toggle | The fight resolves server-side between turns; the toggle already means "spend my defences for me" |
| 10-30 | Lucky vs an advantaged roll | exact adv+dis cancel / roll again keep lower | roll again, keep the lower | Simple, stated in the log line; sparring arena |

---

## Context and Orientation
- `services/arena_service.py` — `_build_pc` (feat flags, shield/heavy-armor detection), `_weapon_attacks` (`heavy`), `_unarmed`, `_class_extras`/features, `roll_expr` (`min_face`), `_resolve_player_attack`, `_take_damage`, `_foe_turn`, `_roll_initiative`, `start*`, `advance_turn` (Sentinel)
- `domain/arena.py` — `ArenaAttack.heavy`; `ArenaPc.shield`, `heavy_armor`; turn flags `savage_used`, `bash_used`, `gwm_used`
- `frontend/src/pages/Arena.tsx` — Lucky button (feature, free), Hew swing allowed
- Feat names on the sheet are free text: match `base_feat_name(f).casefold()` (`integrations/dnd_rules/levelup_2024.py`); "Elemental Adept (Fire)" carries its type.

---

## Validation and Acceptance
- [ ] Thane (Lucky): button gives advantage, uses go 2→1; a monster hit against him triggers a reroll
- [ ] Creed with Sentinel in a boss battle: boss hits Willa → Creed swings
- [ ] Each feat above has a test that fails with the feat removed
- [ ] Gate green

---

## Idempotence and Recovery
New sealed fields → in-flight fights expire at deploy. No schema change.

---

## Interfaces and Dependencies
**Depends on:** Plan 117 `_view` (defensive Lucky in PvP, Mage Slayer, Sentinel).

---

## Outcomes and Retrospective
_Fill at completion._
