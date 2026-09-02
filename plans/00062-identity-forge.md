# Plan 00062 — The Identity Forge (one look, every surface)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-09-01
**Last updated:** 2026-09-01
**Implemented by:** Claude Code

---

## Purpose

Field Guide #4, Justin's pick, Diablo IV as the reference: players fully
customize their character's look + equipment from their phone, and that
ONE identity propagates to the board minifig and every portrait on the
platform. Today hero/loadout renders exist (Plan 48) but portrait_url and
figure_url are generated from TEXT independently — three different faces
for one character. The fix is an identity pipeline: best render (dressed
loadout, else hero) → derived portrait + derived minifig, all from the
same image. Plus a rebuilt /play/:pcId/character screen worthy of it.

---

## Progress
- [x] Step 0: recon — hero/loadout pipeline + 90s cooldown + paper-doll
      screen mapped; figure/portrait presently text-generated (2026-09-01)
- [x] Step 1: backend — portrait_service.derive_pc_portrait +
      derive_pc_figure (edit_image from best render, reusing the portrait /
      _FIGURE_STYLE language); player_service.forge_identity chain
      (cooldown-guarded): [hero if none] → [loadout if gear] → derive both
      → publish; route POST /play/{pc_id}/identity
- [x] Step 2: tests — derive fns (stubbed image/blob per test_character_forge
      _patch pattern), forge_identity chain + cooldown
- [x] Step 3: frontend rebuild of CharacterView — Diablo stage: subclass-art
      backdrop, bigger model, rarity-ringed slots, LOOKS panel (appearance
      editor + suggestion chips), THE FORGE panel with one primary action
      ("Forge my look" → full chain) + per-step buttons, identity row
      showing model/portrait/minifig side by side ("this is you, everywhere")
- [x] Step 4: gate (pytest, tsc, eslint on touched, build) + commit + push
- [x] Step 5: live smoke on Creed via prod: forge chain → verify
      portrait/figure updated → screenshots to Justin

---

## Surprises and Discoveries
- Existing loadout prompt already fights identity drift well (reproduce
  EXACT character, change only listed gear) — the derive functions reuse
  that discipline.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 09-01 | Identity source | text prompts / best render | edit_image from loadout ?? hero | kills three-faces drift; D4 principle |
| 09-01 | Chain trigger | auto on equip / player button | player button (cooldown 90s shared) | paid calls; equipping stays instant (slots show item art) |
| 09-01 | Appearance UX | structured builder / textarea+chips | textarea + tap-to-append chips | ships tonight; structured builder later |
| 09-01 | Screen | patch / rebuild | rebuild on existing slot logic | Justin: "I think we should rebuild it" — keep proven equip logic, new stage |

---

## Context and Orientation
- `services/portrait_service.py`: generate_pc_hero (text→hero_url, clears
  loadout), generate_pc_loadout (img2img hero→dressed), _FIGURE_STYLE via
  build_figure_prompt, portrait prompt in _build_pc_prompt. HOUSE_STYLE_*
  constants carry the art lane.
- `services/player_service.py`: forge_hero / dress_model (90s shared
  cooldown via hero_generated_at), set_appearance (1500 cap), list_gear.
- Routes: POST /play/{id}/hero, /play/{id}/loadout (429 on cooldown).
- Frontend: pages/CharacterView.tsx (doll/slots/pack/appearance), api/play
  forgeHero/dressModel; lib/subclassArt.ts for the stage backdrop.
- Blob paths: heroes/pc-{id}.png, heroes/pc-{id}-loadout.png; derived:
  portraits/pc-{id}.png, figures/pc-{id}.png (existing conventions).

## Validation and Acceptance
- [ ] POST /play/{id}/identity (gear equipped): loadout regenerated,
      portrait_url + figure_url re-derived from it, one publish event
- [ ] Cooldown 429 with seconds remaining
- [ ] Rebuilt screen: equip still instant; Forge chain shows staged
      progress; identity row updates; phone-width clean
- [ ] Creed live: portrait on sheet/HUD + minifig on board all match the
      dressed render

## Idempotence and Recovery
All additive; blob uploads use fixed paths w/ random suffix (CDN-safe).
Progress boxes = restart guide.

## Follow-up (Justin, 2026-09-01)
Golden base models: when a base render lands that the player loves, LOCK
it as the canonical base (never auto-regenerated) and derive all variants
from it. Productized shape: "Forge 3 candidates -> player picks -> pinned."
Add a `hero_locked` flag + candidate-picker UI when we next touch the forge.
  UPDATE 2026-09-01: `hero_locked` SHIPPED — migration 0037, lock guard on
  hero re-roll, POST /play/{pc}/identity/lock, 📌 Lock-this-look toggle on
  the forge screen. Candidate picker (forge 3 → pick) still open.
