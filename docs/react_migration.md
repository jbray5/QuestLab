# React Migration Plan

## Overview

QuestLab is built on Streamlit for the MVP. This document describes the migration path
to a React frontend backed by a FastAPI REST API. The Python services layer (`services/`),
domain models (`domain/`), and database repos (`db/repos/`) are unchanged — only the
presentation layer is replaced.

---

## Route Mapping: Streamlit → React

| Streamlit Page              | React Route                        | Notes                                |
|-----------------------------|-------------------------------------|--------------------------------------|
| `main.py` (home/nav)        | `/`                                 | Dashboard / campaign list            |
| `pages/campaigns.py`        | `/campaigns`, `/campaigns/:id`      | List + detail/edit                   |
| `pages/adventures.py`       | `/campaigns/:id/adventures`         | Scoped to campaign                   |
| `pages/characters.py`       | `/campaigns/:id/characters`         | PC sheet builder                     |
| `pages/encounters.py`       | `/campaigns/:id/adventures/:id/encounters` | Encounter builder             |
| `pages/maps.py`             | `/campaigns/:id/adventures/:id/map` | SVG map → canvas or React Flow       |
| `pages/sessions.py`         | `/campaigns/:id/adventures/:id/sessions` | Session list                   |
| `pages/session_runner.py`   | `/sessions/:id/run`                 | Live session view — WebSocket ideal  |
| `pages/admin.py`            | `/admin`                            | Role-gated admin panel               |

---

## FastAPI Backend Design

### App structure

```
api/
  main.py          # FastAPI app, CORS, middleware
  routers/
    campaigns.py
    adventures.py
    characters.py
    encounters.py
    maps.py
    sessions.py
    admin.py
  deps.py          # Shared dependencies (DB session, current user)
```

### Auth middleware

Azure Front Door injects `X-MS-CLIENT-PRINCIPAL-NAME` (or configured header).
FastAPI dependency reads it and calls `integrations.identity.get_current_user_email()`.
No JWT or session cookies — stateless, header-driven, same as Streamlit.

```python
# api/deps.py
from fastapi import Header, HTTPException
from integrations.identity import get_current_user_email

async def current_user(x_ms_client_principal_name: str = Header(None)) -> str:
    try:
        return get_current_user_email()
    except PermissionError:
        raise HTTPException(status_code=401, detail="Unauthorized")
```

### Key endpoints

```
GET    /api/campaigns                   → list campaigns for DM
POST   /api/campaigns                   → create campaign
GET    /api/campaigns/{id}              → get campaign
PATCH  /api/campaigns/{id}              → update campaign
DELETE /api/campaigns/{id}              → delete campaign

GET    /api/adventures/{id}/sessions    → list sessions
POST   /api/adventures/{id}/sessions    → create session
POST   /api/sessions/{id}/advance       → advance status
POST   /api/sessions/{id}/runbook       → generate AI runbook
GET    /api/sessions/{id}/runbook       → get saved runbook

GET    /api/adventures/{id}/map         → get map + nodes + edges
POST   /api/maps/{id}/nodes             → add node
POST   /api/maps/{id}/edges             → add edge

POST   /api/sessions/{id}/initiative    → roll initiative (pure function)

GET    /api/admin/monsters              → list monsters (admin)
POST   /api/admin/monsters/reseed       → reseed SRD monsters (admin)
GET    /api/admin/export/campaigns      → export all campaigns as JSON (admin)
```

### Streaming

AI generation endpoints should use `StreamingResponse` with SSE (Server-Sent Events)
so the React client can show incremental output rather than waiting for the full response.

```python
from fastapi.responses import StreamingResponse

@router.post("/sessions/{session_id}/runbook/stream")
async def stream_runbook(session_id: UUID, user=Depends(current_user)):
    async def generator():
        async for chunk in ai_service.stream_generate_runbook(...):
            yield f"data: {chunk}\n\n"
    return StreamingResponse(generator(), media_type="text/event-stream")
```

---

## Frontend Technology Recommendations

### Framework
**React 18 + TypeScript + Vite**
- Fast dev server, native ESM, excellent DX
- Type safety aligns with Pydantic-generated OpenAPI schema

### State Management
**Zustand** (recommended over Redux for this app size)
- Minimal boilerplate
- Slices: `useCampaignStore`, `useSessionStore`, `useInitiativeStore`
- `useInitiativeStore` manages the ephemeral initiative tracker state
  (maps cleanly from current `st.session_state` keys)

```typescript
// stores/initiativeStore.ts
interface InitiativeStore {
  combatants: Combatant[];
  currentTurn: number;
  round: number;
  setCombatants: (cs: Combatant[]) => void;
  nextTurn: () => void;
  applyDamage: (idx: number, dmg: number) => void;
}
```

### Component Library
**shadcn/ui** with custom dark fantasy design tokens

shadcn/ui is unstyled by default (Radix primitives + Tailwind). Override the CSS
variables to match the QuestLab palette:

```css
/* globals.css */
:root {
  --background:    0 0% 5%;          /* #0D0D0D */
  --foreground:    38 60% 88%;       /* #F5E6C8 */
  --primary:       0 100% 27%;       /* #8B0000 */
  --primary-foreground: 38 60% 88%;
  --accent:        43 60% 54%;       /* #C9A84C */
  --card:          25 40% 8%;        /* #1C1408  */
  --border:        270 45% 20%;      /* #2D1B4E  */
  --muted:         25 15% 60%;       /* #B0A090  */
}
```

### Fonts
Load via Google Fonts (same as Streamlit version):
- `Cinzel Decorative` — headings
- `EB Garamond` — body text
- `Share Tech Mono` — stat blocks, numbers, dice

### Map Builder
Replace the SVG grid approach with **React Flow** (`@xyflow/react`):
- Drag-and-drop nodes out of the box
- Custom node types for dungeon rooms, towns, wilderness, etc.
- Edge labels for connection types (passage, road, secret)

### Session Runner
Consider **WebSocket** for live session sync (multiple browser tabs / future
multi-player DM screen):
- FastAPI `WebSocket` endpoint: `/ws/sessions/{id}`
- Zustand store subscribes to socket events
- Initiative state, HP changes, and scene navigation sync in real time

---

## Migration Sequence (Recommended)

1. **Scaffold FastAPI app** — `api/` directory, deps, CORS, health endpoint
2. **Generate OpenAPI schema** — `fastapi-code-generator` or manual from existing services
3. **Port endpoints one router at a time** — campaigns first (simplest), session runner last
4. **Build React app** — Vite scaffold, shadcn/ui, Zustand stores
5. **Implement routes** — campaign list → detail → adventure → session runner
6. **Swap frontend** — Deploy React to Azure Static Web Apps; point at FastAPI on App Service
7. **Decommission Streamlit** — keep Python backend, remove `pages/`, `main.py`, Streamlit deps

---

## What Stays the Same

| Layer         | Technology          | Change?  |
|---------------|---------------------|----------|
| `domain/`     | Pydantic v2         | None     |
| `services/`   | Python business logic | None   |
| `db/repos/`   | SQLModel / SQLAlchemy | None  |
| `integrations/` | Claude client, identity | None |
| Database      | Postgres / DuckDB   | None     |
| Auth          | Azure Front Door + Entra ID | None |
| CI/CD         | GitHub Actions      | Add frontend build step |

The entire Python backend is reused as-is. The React migration is purely a UI replacement.
