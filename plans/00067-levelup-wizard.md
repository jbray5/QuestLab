# Plan 00067 — Guided Level-Up Wizard (SPEC — not started)

## Status
[x] Not started  [ ] In progress  [ ] Blocked  [ ] Complete

**Spec written:** 2026-09-01 (build deferred — rules-heavy, wants Justin's
input on two policy questions below before code).

---

## Purpose

Field Guide #7: "Roll20's level-up is broken; the bar is on the floor."
A guided 2024-PHB level-up on the player's phone: the DM says "you're
level 4", the player opens their sheet, a glowing "Level up!" banner
walks them through every choice, and the sheet/HUD/board all update.
Replaces the quick_levelup.py relay for routine levels.

## Questions for Justin (answer before building)
1. **Feats policy** — at ASI levels, may players pick any feat freely
   from a feat catalog, or ASI-only with feats DM-approved? (2024 PHB
   makes feats core, but a catalog needs seeding.)
2. **Trigger** — does the DM bump the level (wizard fills in the rest),
   or does the DM grant "you may level" and the player's wizard does the
   level bump itself? (Recommend: DM grants, wizard bumps — one tap for
   Justin at the table: "everyone level up!")

## Step design (2024 PHB, computed per class + new level)
1. **HP** — choose: fixed average (die/2+1) or ROLL (use the Plan 66
   dice cinematic — the whole table watches your hit die!). Auto +Con
   mod, retroactive Con changes handled by the ASI step re-computing.
2. **Class features** — auto-grant from the existing feature catalog
   (feature_service sync, exactly what quick_levelup --sync does),
   presented as reveal cards ("You learn Extra Attack!").
3. **Subclass** — at the class's subclass level (3 for all 2024 PHB
   classes), pick from a subclass list (needs a small catalog:
   class → [subclass names + one-line blurbs]; SUBCLASS_CARD_ART keys
   are a starting inventory).
4. **ASI / feat** — levels 4/8/12/16/19 (fighter/rogue extras): +2/+1+1
   ability picker with live modifier preview, or feat per Q1.
5. **Spells** — slot table auto-set per class table (existing
   spellcasting service logic); known casters pick new spells from the
   catalog (filter: class list, max level castable); prepared casters
   get an informational "you now prepare N" card. Cantrip swaps per
   2024 rules.
6. **Summary** — one confirmation screen; on confirm: PATCH via
   player-scope service (new bounded level_up service method — NOT the
   open PATCH whitelist), publish pc.updated + a table.fx "level up!"
   flourish on the board (gold burst on their token).

## Architecture notes
- `services/levelup_service.py`: `compute_steps(pc) -> LevelUpPlan`
  (pure, testable) + `apply(pc, choices)` (validating, transactional).
- Rules data: extend integrations/dnd_rules with per-class level tables
  (hit die, subclass level, ASI levels, spells known/prepared table) —
  SRD-safe content only.
- Frontend: /play/{pcId}/levelup route, one step per screen, big
  tap targets, the dice cinematic for rolled HP.
- Tests: per-class step computation goldens (wizard 2→3, paladin 2→3,
  sorcerer 2→3 match what Session 6 did by hand).

## Why deferred
Rules correctness is the product here (Justin verifies against the
PHB). Better to build it fresh with his policy answers than tack it
onto the end of a long shipping day.
