# Plan 00034 — Portrait Generation via OpenAI + Vercel Blob

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-17

---

## Purpose

Both `PlayerCharacter` and `Npc` already have a `portrait_url` column.
The DM currently has to find or generate art manually. Plan 34 wires
a "🎨 Generate Portrait" button on the character sheet and NPC modal
that:

1. Builds an image prompt from the entity's attributes (name, race,
   class/role, appearance, campaign tone)
2. Calls OpenAI's image API (`gpt-image-1`)
3. Uploads the resulting PNG to Vercel Blob (permanent public URL)
4. Saves the URL to the entity

Storage on Vercel Blob (not local disk) because Render's free tier
filesystem is ephemeral — disk-stored portraits vanish on every deploy.

---

## Progress

- [x] Step 1: Write this plan
- [ ] Step 2: Add `openai` + `vercel-blob` (or equivalent) to requirements
- [ ] Step 3: `integrations/openai_client.py` — image gen wrapper
- [ ] Step 4: `integrations/blob_storage.py` — upload bytes → public URL
- [ ] Step 5: `services/portrait_service.py` — orchestrates prompt + gen + upload
- [ ] Step 6: Endpoints `POST /api/{npcs,characters}/{id}/portrait`
- [ ] Step 7: Backend tests (mocked OpenAI + Blob)
- [ ] Step 8: Frontend buttons + 10s loading state
- [ ] Step 9: Document new env vars (OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN)
- [ ] Step 10: Quality gate + commit + push

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-17 | OpenAI SDK | Add `openai` pkg vs hand-roll with `httpx` | `openai` | User approved. ~5 MB, official, future-proof for additional OpenAI features. |
| 2026-05-17 | Model | dall-e-3 vs gpt-image-1 | `gpt-image-1` | Newer, better quality, similar cost. Returns `b64_json` directly so we can pipe to storage without a second download. |
| 2026-05-17 | Quality | low / medium / high | medium (1024×1024) | $0.04/image — fine quality for the table; HD ($0.17) is wasteful. |
| 2026-05-17 | Storage | Render ephemeral disk vs Vercel Blob vs S3 | Vercel Blob | Free for our usage pattern, native to our Vercel deploy, permanent URLs, simple SDK. |
| 2026-05-17 | Prompt scope | Auto only / Auto + extra hints | Both | Auto prompt covers 90% of cases; an optional "style hints" field lets the DM say "anime", "oil painting", etc. |
| 2026-05-17 | Trigger | Modal button only / both modal and quick-action | Modal button | Cost gate — explicit click + 10s wait means accidental triggers are unlikely. |

---

## Architecture

```
DM clicks "🎨 Generate Portrait" on NpcModal or CharacterSheet
                      │
                      ▼
       POST /api/{npcs|characters}/{id}/portrait
       body: { "style_hints": "oil painting, fantasy" }
                      │
                      ▼
            services.portrait_service
            ├─ build_prompt(entity, style_hints)
            │     "fantasy portrait of Captain Aldric,
            │      a grizzled human guard captain, …"
            ├─ openai_client.generate_image(prompt)
            │     → bytes  (b64-decoded PNG)
            ├─ blob_storage.upload(filename, bytes)
            │     → public URL
            └─ entity.portrait_url = url; save
                      │
                      ▼
              return updated entity
```

---

## Env vars added

- `OPENAI_API_KEY` — for image generation
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token (created in Vercel dashboard)

Both marked `sync: false` in `render.yaml` so they're set in the Render
dashboard.

---

## Files touched

**Backend:**
- `requirements.txt` — add `openai` (and HTTP upload to Vercel Blob — uses
  `httpx` which we already have)
- `integrations/openai_client.py` (new)
- `integrations/blob_storage.py` (new)
- `services/portrait_service.py` (new)
- `api/routers/npcs.py` — add `POST .../portrait`
- `api/routers/characters.py` — add `POST .../portrait`
- `tests/test_services/test_portrait_service.py` (new)
- `render.yaml` — declare the new env vars
- `.env.example` — document them
- `docs/deployment.md` — note them

**Frontend:**
- `frontend/src/api/npcs.ts` — add `generatePortrait`
- `frontend/src/api/characters.ts` — add `generatePortrait`
- `frontend/src/components/npc/NpcModal.tsx` — "🎨 Generate Portrait" button
- `frontend/src/components/character-sheet/CharacterSheet.tsx` — same button

---

## Validation and Acceptance

- [ ] `pytest -q` passes
- [ ] Click "🎨 Generate Portrait" on an NPC → spinner → portrait appears
- [ ] Click again with "style hints: anime" → different result
- [ ] Portrait URL is `https://*.public.blob.vercel-storage.com/...`
- [ ] Portrait survives a Render redeploy

---

## Outcomes and Retrospective

**Shipped 2026-05-17:**

Backend
- `requirements.txt` — added `openai>=1.50`.
- `integrations/openai_client.py` — thin wrapper for `gpt-image-1`,
  defaulting to medium quality (~$0.04/image). Returns raw PNG bytes
  whether the API responds with `b64_json` or a URL.
- `integrations/blob_storage.py` — Vercel Blob HTTP upload using
  `httpx` (no SDK needed). `BLOB_READ_WRITE_TOKEN` env var.
- `services/portrait_service.py` — builds a fantasy-portrait prompt
  from the PC or NPC's identity fields, calls OpenAI, uploads to
  Vercel Blob at deterministic paths (`portraits/{pc|npc}-{uuid}.png`),
  persists the resulting URL on the entity. Authz routes through the
  existing campaign ownership checks.
- Endpoints `POST /api/{characters|npcs}/{id}/portrait` with optional
  `style_hints` body.
- 10 new tests with both API calls mocked; full suite 560 ✓.

Frontend
- `PortraitGenerator` reusable component — shows current portrait,
  optional style-hints input, "🎨 Generate Portrait" button (or
  "Re-generate" if a portrait exists), 10s "painting…" loading state
  over the image, error surfacing.
- Wired into `NpcModal` (renders when editing an existing NPC) and
  `CharacterSheet` (new "🎨 Portrait" Section above Ability Scores).
- Frontend API clients gained `generatePortrait(id, hints?)` helpers.

Ops
- `render.yaml` declares `OPENAI_API_KEY` and `BLOB_READ_WRITE_TOKEN`
  as `sync: false` so they're set in the Render dashboard.
- `.env.example` documents both with friendly comments.
- `docs/deployment.md` adds them to the Render env-var table with
  setup instructions.

**Cost reality:** ~$0.04 per generation × ~150 portraits/campaign =
$6 worst case. Vercel Blob is free at this scale.

**Surprises:** none. The OpenAI SDK's `client.images.generate` returns
both `b64_json` (gpt-image-1) and `url` (older models); the wrapper
handles either.

**Tech debt:** none. If a future plan wants to lazy-load the
PortraitGenerator only when the panel is expanded, it would shave a
small amount off the CharacterSheet bundle.
