# Plan 00003 — React Migration

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-03-08
**Last updated:** 2026-03-08
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

Replace the Streamlit frontend with a React + TypeScript + Vite app.
Add a FastAPI backend that wraps the existing Python services layer.
The Streamlit app stays runnable throughout — it is decommissioned only at the end.

---

## Architecture

```
questlab/
  api/                   ← NEW: FastAPI backend
    __init__.py
    main.py              ← app, CORS, lifespan (monster seed)
    deps.py              ← get_db(), current_user()
    routers/
      __init__.py
      campaigns.py
      adventures.py
      characters.py
      encounters.py
      maps.py
      sessions.py
      admin.py
  frontend/              ← NEW: React app
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.tsx
      App.tsx            ← Router setup
      api/               ← fetch wrappers (one file per resource)
        client.ts        ← base fetch + auth header injection
        campaigns.ts
        adventures.ts
        characters.ts
        encounters.ts
        maps.ts
        sessions.ts
        admin.ts
      stores/            ← Zustand slices
        useAuthStore.ts
        useCampaignStore.ts
        useSessionStore.ts
        useInitiativeStore.ts
      components/        ← Shared UI
        Layout.tsx        ← sidebar nav + header
        StatBlockCard.tsx
        CharacterMiniCard.tsx
        DiceRoller.tsx
        LootCard.tsx
        StatusBadge.tsx
        HpBar.tsx
      pages/
        Dashboard.tsx
        Campaigns.tsx
        Adventures.tsx
        Characters.tsx
        Encounters.tsx
        MapBuilder.tsx
        Sessions.tsx
        SessionRunner.tsx
        Admin.tsx
        NotFound.tsx
```

---

## Checklist

### Part A — FastAPI backend
- [x] Add fastapi, uvicorn[standard], python-multipart to requirements.txt
- [x] `api/__init__.py`
- [x] `api/deps.py` — get_db(), current_user()
- [x] `api/main.py` — app, CORS, lifespan, include routers
- [x] `api/routers/__init__.py`
- [x] `api/routers/campaigns.py`
- [x] `api/routers/adventures.py`
- [x] `api/routers/characters.py`
- [x] `api/routers/encounters.py`
- [x] `api/routers/maps.py`
- [x] `api/routers/sessions.py`
- [x] `api/routers/admin.py`
- [x] pytest — all existing tests still pass
- [x] `uvicorn api.main:app --reload` — OpenAPI docs at /docs

### Part B — React frontend scaffold
- [x] `frontend/` — Vite + React + TypeScript scaffold via npm create vite
- [x] Install: react-router-dom, zustand, @tanstack/react-query, tailwindcss, @xyflow/react
- [x] Dark fantasy CSS tokens in index.css
- [x] `src/api/client.ts` — base fetch with auth header
- [x] All resource API clients (campaigns, adventures, characters, encounters, maps, sessions, admin)
- [x] Zustand stores (auth, campaign, initiative)

### Part C — React pages
- [x] Layout.tsx (sidebar nav)
- [x] Dashboard.tsx
- [x] Campaigns.tsx
- [x] Adventures.tsx
- [x] Characters.tsx (ability scores, HP bar)
- [x] Encounters.tsx
- [x] MapBuilder.tsx (React Flow canvas)
- [x] Sessions.tsx
- [x] SessionRunner.tsx (initiative tracker + runbook + scene nav)
- [x] Admin.tsx
- [x] NotFound.tsx

### Part D — Polish & decommission
- [x] `npm run build` — clean production build (485 kB JS, 22 kB CSS)
- [ ] Update README with new run commands
- [ ] Commit + push

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Bundler | Vite | Fast HMR, native ESM, no config hell |
| Routing | react-router-dom v6 | Standard, file-based-friendly |
| State | Zustand | Minimal boilerplate for this app size |
| Server state | @tanstack/react-query | Caching, refetch, loading states |
| Components | shadcn/ui | Unstyled Radix primitives, Tailwind, easy theming |
| Map | React Flow (@xyflow/react) | Drag-drop nodes/edges out of the box |
| Auth | Header passthrough | Same as Streamlit — no changes to auth model |

---

## Run Commands (after migration)

```bash
# Backend
uvicorn api.main:app --reload --port 8000

# Frontend (dev)
cd frontend && npm run dev          # proxies /api → localhost:8000

# Frontend (prod build)
cd frontend && npm run build        # outputs to frontend/dist/
# FastAPI serves dist/ as static files at /
```
