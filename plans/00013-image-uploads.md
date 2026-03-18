# Plan 00013 — Image Uploads (Items, Monsters, Characters)

## Status
[ ] IN PROGRESS — 2026-03-17

## Purpose

Allow DMs to attach images to magic items, monsters, and player characters.
File upload stored in `uploads/` on disk (dev), with the URL saved to the DB.
A shared `ImageUpload` React component handles both file-pick and URL-paste flows.

## Components

### Backend
- `domain/item.py` — add `image_url: Optional[str]` to Item table + schemas
- `domain/monster.py` — add `image_url: Optional[str]` to MonsterStatBlock table + schemas
- `domain/character.py` — `portrait_url` already exists; no change needed
- `alembic/versions/XXXX_add_image_url.py` — migration for items + monsters tables
- `api/routers/uploads.py` — `POST /api/uploads` multipart file endpoint
- `api/routers/items.py` — add `PATCH /api/items/{id}`
- `api/routers/monsters.py` — add `PATCH /api/monsters/{id}` (image_url only)
- `api/main.py` — mount `uploads/` as static + include uploads router

### Frontend
- `src/components/ImageUpload.tsx` — file picker + URL paste + preview
- `src/pages/MagicItems.tsx` — wire ImageUpload into detail panel
- `src/pages/Characters.tsx` — add portrait_url to form + card display
- `src/pages/Monsters.tsx` — wire ImageUpload into stat block panel

## API

```
POST /api/uploads              — multipart file → { url: "/uploads/filename" }
PATCH /api/items/{id}          — { image_url? }
PATCH /api/monsters/{id}       — { image_url? }
PATCH /api/characters/{id}     — already exists, portrait_url already in schema
```

## Storage
- Dev: `uploads/` dir in project root, served as `/uploads/` static
- Prod: swap `uploads/` for Azure Blob — only `api/routers/uploads.py` needs changing
