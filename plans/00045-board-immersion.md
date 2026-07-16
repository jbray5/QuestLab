# Plan 00045 — Board Immersion (Tiers 1+2, Tier 3 stretch)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-07-15 (evening)
**Deadline:** same as Plan 44 — Friday 2026-07-17 go/no-go drill, session Saturday.
**Owner directive:** "Tier 1 and 2, with 3 as a stretch goal. Use AI generation
wherever possible — the OpenAI key we already use for player portraits."

---

## Purpose
Take the Plan-44 board from "standees on a flat map" toward "a place." Immersion
here is light, atmosphere, and camera language — not geometry:

- **Tier 1 — living diorama** (frontend only): real lighting with the darkness
  dial driving day→moonlight, torch point-lights placeable as tokens, a board
  slab so the map has body, scene fog + an edge-fade vignette so the world
  dissolves instead of ending, weather particles (embers / fireflies / rain /
  snow / dust), camera language (follow-the-turn, slow ambient drift, cinematic
  DoF+vignette toggle), token life (idle bob, defeat tip-over).
- **Tier 2 — skybox dome** (full-stack): AI-generated 360° panorama wrapped on
  an inverted sphere around the board, so low camera angles show horizon
  instead of void. `backdrop_url` column on battle_maps (+ migration 0021),
  POST generate endpoint reusing the portrait-generation OpenAI + Blob
  plumbing, "Generate backdrop" UI on the board.
- **Tier 3 — 2.5D terrain** (STRETCH, explicitly after Saturday unless time
  falls from the sky): DM-painted elevation regions (reuse the fog polygon
  editor) extruding plateaus, walls with line-of-sight, droppable 3D props.

## Constraints
- Performance target unchanged: smooth on a mid laptop while screen-sharing.
  Particles are one instanced Points buffer; DoF is a toggle, default OFF.
- No player-facing surface changes; the 2D Table View is untouched.
- Torch lights ride the existing Token JSON (`kind: "light"`) — the backend
  Token.kind is a free string; no schema change. 2D console renders them as
  plain gray dots, which is acceptable.
- Weather/cinema toggles are DM-local UI state in v1 (not persisted).
- eslint react-compiler rules: no Math.random()/Date.now() in render — seeded
  PRNG for particle positions, refs mutated only inside useFrame/effects.

## Progress
- [x] 1. Deps: @react-three/postprocessing.
- [x] 2. Tier 1 — lighting rig (ambient+key driven by darkness), lambert
      ground/slab/discs, card tint at night; under-plane; scene fog.
- [x] 3. Tier 1 — edge-fade vignette frame (procedural canvas texture,
      module-level singleton in boardTheme.ts) + board slab.
- [x] 4. Tier 1 — weather particles component (5 presets, seeded PRNG,
      useFrame-animated buffer) + header selector.
- [x] 5. Tier 1 — torch tokens (kind "light": flame + flickering point
      light, movable/selectable/Del-removable) + "+ Torch" button.
- [x] 6. Tier 1 — camera: follow-turn goal-chase (🎯 toggle, default on),
      ambient drift with 🎞 Cinema (DepthOfField + Vignette, default off).
- [x] 7. Tier 1 — token life: idle bob (phase-hashed), defeat tip-over lerp.
- [x] 8. Tier 2 backend — migration **0022** backdrop_url (nullable) + DuckDB
      patch entry; domain field on BattleMap models + TableMap projection;
      service generate_backdrop (owner-checked, gpt-image-1 1536x1024 →
      Blob `backdrops/battlemap-{id}.png` → row update); router POST
      /battle-maps/{id}/backdrop (404/403/502 mapping); 5 tests, OpenAI
      mocked. 606 backend tests green.
- [x] 9. Tier 2 frontend — BattleMap.backdrop_url in types; BackdropDome
      (BackSide sphere, fog-immune, darkness-tinted); 🌌 backdrop panel
      (hints textarea, generate/regenerate/remove, busy state).
- [x] 10. Gates: pytest 606, black/isort/flake8/interrogate clean, tsc -b
      clean, eslint 0 new (react-refresh fix via boardTheme.ts), vite
      build clean.
- [x] 11. Polish pass from the live screenshot review: night lighting
      floors, dome dimmed vs board + horizon gradient band, nameplates
      +40%, faction-tinted fallback cards, grid fades with darkness.
- [x] 12. Minifig standees: figure_url on PCs+monsters (migration 0023),
      transparent gpt-image-1 cut-outs via /figure endpoints, Token
      style='figure' frameless rendering, 🧍 button (monsters share one
      figure per stat block), party/foes auto-use stored figures.
- [x] 13. Halo clean-up: client-side alpha curve (≤110→0, ramp to 230) +
      auto-crop, validated offline on a real Driven Wolf. SRD Wolf's
      figure seeded to prod (verified — 0023 auto-migrated on deploy).
- [ ] STRETCH (post-Saturday): Tier 3 — elevation regions, walls + LoS,
      3D props. Also parked: "hologram" render style as an alternate
      token look.
- [ ] Friday drill: verify backdrop generation against prod (needs
      OPENAI_API_KEY + BLOB_READ_WRITE_TOKEN on Render) + DoF perf on the
      projector; run `alembic upgrade head` lands 0022 on deploy.

## Decision Log
| Date | Decision | Chosen | Reason |
|---|---|---|---|
| 2026-07-15 | Torch lights data model | Token kind "light" (no schema change) | tokens already persist/sync; backend kind is a free string |
| 2026-07-15 | Skybox aspect | wide-landscape OpenAI image stretched on sphere band, seam rotated behind default camera | OpenAI can't emit true 2:1 equirect; horizon band is what sells it |
| 2026-07-15 | DoF | toggle, default OFF | projector perf; Plan 44's no-postprocessing rule stays the default |
| 2026-07-15 | Weather persistence | DM-local state v1 | no free TableState field; DM screen-shares his own view anyway |

## Validation
- [ ] Friday drill extends Plan 44's: night darkness looks like moonlight, a
      torch pools warm light, embers drift, backdrop horizon visible at Y
      tilt, follow-turn glides between combatants, cinema toggle safe to
      leave off.
