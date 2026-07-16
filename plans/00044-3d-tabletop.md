# Plan 00044 — 3D Tabletop (DM board for Session 3)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-07-15
**Deadline:** Friday-evening go/no-go 2026-07-17; session Saturday 2026-07-18.
**Implemented by:** Claude (Fable 5)

---

## Purpose
A 3D digital tabletop for the existing map system: the battle map as a textured
board, a grid on top (hex default — we play hex), and billboarded standee
figurines for each token that move along the grid with animation and can attack
(lunge + flash + floating damage number). DM display only, screen-shared;
no player sync in v1. The 2D map stays fully functional. Smallest vertical
slice first; if it isn't stable by Friday evening we ship Saturday on 2D.

## Scope rules (from the DM handoff — firm)
1. DM display only. No websockets/multiplayer beyond the existing SSE refetch.
2. Do NOT touch player-facing views (PlayerView, /api/play/*, TableView projection).
3. 2D stays fully functional; 3D is additive.
4. Friday go/no-go; build shippable steps.

## Confirmed design decisions (owner sign-off 2026-07-15)
1. **No migration.** Token positions reuse `TableState.tokens` (image-pixel
   coords, PATCH whole array, SSE `table.updated`) — 2D and 3D stay in sync
   for free. Monster tokens additionally get `ref_id = SessionCombatant.id`
   (fixes the existing 2D glow gap too).
2. **New DM route** `/sessions/:sessionId/board` (standalone, no Layout
   chrome) — 3D canvas left, slim live combat tracker right (side-by-side, as
   required). DM-auth page ⇒ may show HP; the unauth TableView is untouched.
3. **Hex is viewer-side.** Grid rendered (hex default / square / off) derived
   from the existing `grid_size`; snapping client-side; no schema change.
   Gridless maps: no snap, unit = round(min(W,H)/20) (same as MapCanvas).

## Progress
- [x] Deps: three, @react-three/fiber@9, @react-three/drei, @types/three.
- [x] 1. Route + BoardView shell: data chain (session→adventure→campaign),
      table state + battle maps + combat state queries, SSE refetch, layout.
- [x] 2. Board3D: textured ground plane (crossOrigin-safe manual loader with
      graceful fallback), hex/square grid overlay, OrbitControls, T/Y presets.
- [x] 3. Standees: drei Billboard cards with portrait texture, colored base
      disc (PC gold / foe red / custom gray, token.color override), fake
      ellipse shadow, Html nameplate + HP bar synced to combatants.
- [x] 4. Movement: click-select (ring highlight), click-destination glide
      (~0.5 s eased), snap to hex/square centers, Esc/right-click deselect,
      commit via PATCH tokens on arrival.
- [x] 5. Attack: select attacker → press A or click foe → damage prompt →
      lunge + white hit-flash + floating damage number; HP written through
      `patchCombatant` so the tracker stays the source of truth (auto-defeat
      non-PCs at 0 HP).
- [x] 6. Turn spotlight: pulsing ring on the active combatant's token while
      combat is running; advancing the turn in the tracker moves it.
- [x] 7. BoardTracker sidebar: initiative order, HP nudge (shift = ±5),
      defeated toggle, next-turn, round display (react-query direct).
- [x] 8. Console/HUD wiring: "🎲 3D Board" button in SessionHud header;
      TableConsole "+ Foes (combat)" adds monster tokens with
      ref_id = combatant id (fixes the 2D glow gap too).
- [x] 9. Gates: tsc -b clean, eslint 0 new errors (touched files clean),
      vite build clean. BoardView chunk 932 kB (three.js) — lazy route only.
- [ ] 10. Friday live drill on real maps (the go/no-go) — see Validation.

## Decision Log
| Date | Decision | Chosen | Reason |
|---|---|---|---|
| 2026-07-15 | Position store | reuse TableState.tokens | already persisted, per-session, SSE-synced; zero backend work; 2D/3D parity |
| 2026-07-15 | Mount point | new standalone route | TableConsole is a z-1000 modal that covers the combat tracker; handoff requires side-by-side |
| 2026-07-15 | Hex support | viewer-side render+snap | schema untouched; hex default per table preference; persisted grid_kind can come later |
| 2026-07-15 | Map texture loading | manual THREE.TextureLoader with error fallback | drei useTexture suspends/throws; Blob CORS is the known risk — page must degrade, not crash |
| 2026-07-15 | Tracker data | direct react-query | useInitiativeStore is HUD-coupled; board needs a slim isolated reader/writer |

## Context
Frontend-only slice. Files: `frontend/src/pages/BoardView.tsx` (new),
`frontend/src/components/board/Board3D.tsx` (new),
`frontend/src/components/board/BoardTracker.tsx` (new), `frontend/src/App.tsx`
(route), `frontend/src/pages/SessionHud.tsx` (header button),
`frontend/src/components/table/TableConsole.tsx` (+Foes button).
Backend untouched. Coordinate mapping: image px (x→, y↓, origin top-left) →
world (x - W/2, 0, y - H/2) on the XZ ground plane; world units = pixels.

## Validation
- [ ] tsc -b clean; vite build clean; eslint 0 new errors
- [ ] Manual drill (Friday): load session → open /board → map renders as a
      board → party + wolves standees → click-move glides + persists (check
      2D console shows same positions) → attack prompt writes HP (tracker
      updates) → next-turn moves the spotlight → T/Y camera presets → hex
      grid visible and snapping.
- [ ] Projector look-test from six feet.

## Idempotence and Recovery
Each numbered step compiles standalone; resume from the Progress checkboxes.
No migrations, no backend edits — rollback is deleting the three new files
and the three small edits.
