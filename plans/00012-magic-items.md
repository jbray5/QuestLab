# Plan 00012 — Magic Item Compendium + AI Lore

## Status
[x] COMPLETE — 2026-03-17

## Purpose

Seed PHB magic items into the `items` table so DMs can browse/search real items by rarity
and type, then use AI to generate adventure-specific lore and flavor text that ties the item
to the campaign setting, tone, and story so far.

## Components

### Backend
- `integrations/dnd_rules/magic_items.py` — ~100 PHB magic items (all rarities, all types)
- `services/item_service.py` — `list_items`, `get_item`, `seed_magic_items`
- `services/ai_service.py` — `generate_item_lore(db, item_id, adventure_id, dm_email)`
- `api/routers/items.py` — CRUD + lore generation endpoint
- `main.py` / startup — seed items on first boot

### Frontend
- `src/pages/MagicItems.tsx` — item browser (search, rarity filter, type filter)
- `src/api/items.ts` — API client
- Router entry in `App.tsx`
- Nav link in sidebar

## API

```
GET  /items?rarity=Rare&type=Weapon&q=sword   — browse/search
GET  /items/{id}                              — item detail
POST /items/{id}/lore                         — AI lore { adventure_id? }
```

## Lore Generation

Claude receives: item name, mechanics, rarity + adventure setting, tone, synopsis,
campaign name. Returns 2-3 paragraphs of flavor lore that connects the item to the story.
The lore is not persisted — it's generated on demand and displayed to the DM.
