# Plan 00060 — DM HUD Rework (map-first + party strip)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-08-23
**Last updated:** 2026-08-23
**Implemented by:** Claude Code

---

## Purpose

Justin runs sessions from maps and moment-to-moment cards, not runsheets.
Rework SessionHud: map/table control becomes the center default, the
Script tab demotes to a slide-over drawer, and the left Party Tracker
becomes a research-backed always-visible strip (HP/temp/death saves, AC,
conditions+concentration, spell slots, spendable feature pips, passives
PP/PI, Spell DC, Init, Speed). Monster stat blocks and PC sheets stay
one click (both popovers already exist). Choices confirmed by Justin
2026-08-23 (center=maps, script=drawer, cards=monster blocks+PC sheets,
strip=my call per DM-community research).

---

## Progress
- [x] Step 0: recon — centerTab default line 514; script render 1271-1423;
      PC sheet popover via ?sheet= (812); monster popover (874/2064) (08-23)
- [x] Step 1: centerTab defaults "maps"; Script → 🎬 slide-over drawer with
      close button; maps/table queries always enabled (08-23)
- [x] Step 2: party strip — PP/PI (real skill ranks incl. expertise), Spell
      DC by class, Init, Speed in the right column; FeaturePipsRow component
      (spend/restore, psionic cyan glow); dead passivePerception helper
      removed (08-23)
- [x] Step 3: name-click sheet popover + combat monster popover confirmed
      pre-existing — no change needed (08-23)
- [x] Step 4: tsc, eslint (file clean), vite build, 728 pytest — committed +
      pushed (08-23)

---

## Surprises and Discoveries
- Much of the ask already exists: PC-sheet popover (?sheet= param),
  monster stat-block popover, Maps tab with one-click staging (Plan 53).
  The rework is priority/layout + the strip, not new plumbing.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 08-23 | Center default | script / maps / board preview | maps | Justin: map+table control is what he uses |
| 08-23 | Script fate | remove / tab / drawer | drawer | Justin: recommended option; zero loss |
| 08-23 | Strip contents | ask / research | PP+PI+DC+Init+Speed+pips+slots+HP/AC/conds | DM-community standard (DMs Guild party trackers, DDB forum) + app live data |
| 08-23 | Spell DC source | caster-stats API per PC / client calc | client calc (8+prof+mod by class) | one less request per PC; matches server formula |

---

## Context and Orientation

`frontend/src/pages/SessionHud.tssx` (2,247 lines):
- L514 `centerTab` state, default "script"; tab strip ~1250; script content
  1271-1423; maps 1424+; people 1471+.
- Left party panel renders `party` (filtered by attending_pc_ids, L477).
- `?sheet=<pcId>` opens CharacterSheet popover (L812).
- `statBlockMonsterId` → MonsterStatBlock popover (L874, L2064).
- Feature rows API: GET /characters/{id}/features → CharacterFeatureRead
  (feature_name, uses_spent, max_uses, recovery); spend/restore endpoints
  exist (featuresApi in frontend/src/api/features.ts).
- Casting ability by class: WIS=Cleric/Druid/Ranger, CHA=Bard/Paladin/
  Sorcerer/Warlock, INT=Wizard. DC = 8 + prof + mod. Psionic pips glow
  cyan (same rule as FeaturePanel).

## Validation and Acceptance
- [ ] HUD opens on Maps; script drawer slides over and back
- [ ] Strip shows PP/PI/DC/Init/Speed + pips per PC; pips spend/restore
- [ ] 0-HP PC shows death-save pips in strip
- [ ] Name click opens sheet popover; combat monster click opens block
- [ ] tsc, vite build, full gate green

## Idempotence and Recovery
Frontend-only, no schema. Progress boxes are the restart guide.
