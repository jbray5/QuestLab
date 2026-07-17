# Plan 00048 — Character Forge (the player's BG3-style character view)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Shipped 2026-07-17 (ed851a2).** Migration 0028 applied on Render deploy;
party hero renders seeded for Saturday (Creed / Nya / Thane / Willa —
Sarranthia exited S2). Players reach it from their sheet's 🛡 YOUR
CHARACTER button.

**Created:** 2026-07-17. Owner ask: "expand what the player view has to
offer… see their full character and dynamically equip things like clothes
and new weapons… like a Diablo IV character view, or BG3. Then they could
do some customization on how the character looks and form a bond with the
character they've created."

## Concept
A full-screen character page at `/play/:pcId/character` (same capability
URL as the player view, linked from it). The player sees a tall painterly
full-body render of their character ("the hero portrait"), equips and
unequips gear from their actual inventory, writes their own appearance
notes, and hits **✨ Forge** — the portrait regenerates wearing what they
equipped, looking how they described. The bond loop: equip → describe →
forge → admire → repeat.

## What already exists (leveraged, not rebuilt)
- `character_items.equipped` / `attuned` flags (Plan 10) — the paper-doll
  state was always there; nothing rendered it for players.
- The `/play/{pc_id}/*` capability router with player writes (Plan 25).
- `portrait_service` prompt/generate/upload pattern (Plans 34/45).
- The items catalog now carries art (Plan 47 shops share the same rows —
  gear bought at the market shows its shop art in the equipment list).

## Data (migration 0028, additive columns on player_characters)
- `appearance` TEXT — the player's own description (hair, scars, vibe).
- `hero_url` VARCHAR(500) — the full-body render.
- `hero_generated_at` TIMESTAMPTZ — cooldown anchor (player-triggered
  paid generation; 90s minimum between forges, enforced service-side).
- DuckDB patch entries for all three (existing table).

## Layers
- `player_service`: `list_gear` (inventory joined with item name/type/
  rarity/image), `set_appearance` (≤1500 chars), `set_equipped`
  (ownership-checked), `forge_hero` (cooldown + prompt from race/class/
  subclass/appearance/equipped gear → 1024×1536 → Blob `heroes/pc-{id}.png`).
- `portrait_service`: `_build_hero_prompt` + `generate_pc_hero(pc)` —
  called by player_service after ownership/cooldown checks.
- `api/routers/play.py`: GET `/gear`, PATCH `/appearance`,
  POST `/gear/{character_item_id}/equip`, POST `/hero`.
- Frontend: `pages/CharacterView.tsx` (standalone hall page, mobile-first),
  route + a "🛡 Your Character" button in the PlayerView header.
- SSE: equips publish `pc.inventory.updated`, forge publishes `pc.updated`
  so the DM's sheet and other tabs refresh live.

## Non-goals (this pass)
- No slot-typed paper-doll grid (head/chest/hands) — a flat equipped list
  drives the prompt; slot art can layer on later.
- No image-to-image identity lock — identity continuity comes from the
  appearance text; regenerations may drift and that's part of the fun.
- Possess-mode close-up standee fix — parked per owner (Plan 46 note).
