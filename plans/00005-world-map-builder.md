# Plan 00005 — World Map Builder (AI Continent Generator)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-03-15
**Last updated:** 2026-03-15
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

The current Map Builder is dungeon-scale (Room, Corridor, etc.) and manual.
This plan upgrades it to a dual-scale tool:
- **World scale**: continent/region map with AI generation — towns, cities, regions,
  races/cultures per area, geographic landmarks, roads, political borders
- **Dungeon scale**: existing node types, unchanged

The DM describes their world in a text prompt; the AI returns a full map populated
with named locations, dominant races/cultures, and lore snippets. The DM can then
edit, add, or delete nodes manually. Nodes are colour-coded by type.

---

## Progress

- [ ] Step 1: Add world-scale node types to `domain/enums.py`
- [ ] Step 2: Add `generate_world_map` to `services/ai_service.py`
- [ ] Step 3: Add `POST /maps/{map_id}/generate` to `api/routers/maps.py`
- [ ] Step 4: Add map `scale` field to `domain/map.py` + Alembic migration
- [ ] Step 5: Update `frontend/src/api/maps.ts` — new types + generate call
- [ ] Step 6: Rewrite `frontend/src/pages/MapBuilder.tsx` — world vs dungeon mode,
              AI generate panel, colour-coded nodes, node detail sidebar

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-03-15 | Scale model | Separate map types table, single `scale` enum field | `scale` enum on Map | Simplest; no schema churn; same node/edge CRUD |
| 2026-03-15 | AI output format | Free text parsed, structured JSON | Structured JSON via tool use | Reliable parsing; no regex fragility |
| 2026-03-15 | Node colours | CSS class per type, inline style | Inline style from a type→colour map | Avoids CSS class explosion; easy to extend |
| 2026-03-15 | Dungeon types | Remove, keep, gate by scale | Keep all, show relevant subset by scale | Backwards compatible |

---

## Context and Orientation

### Files touched (full paths from repo root)
```
domain/enums.py
domain/map.py
services/ai_service.py
api/routers/maps.py
alembic/versions/<new>.py
frontend/src/api/maps.ts
frontend/src/api/types.ts
frontend/src/pages/MapBuilder.tsx
```

### Architecture layers involved
- `domain/` — new enum values, new `scale` field on Map
- `services/` — AI generation logic
- `api/routers/` — new generate endpoint
- `frontend/` — UI changes only; no business logic

### Key terms defined
- **World scale**: continent/region level — Regions, Cities, Towns, Villages, Landmarks, Roads
- **Dungeon scale**: location interior level — Rooms, Corridors, Lairs, etc. (existing)
- **scale**: new `MapScale` enum on `Map` table: `World | Dungeon`
- **generate**: AI call that returns a list of nodes + edges to populate a blank map

---

## Concrete Steps

### Step 1: `domain/enums.py` — add world node types + MapScale
**File:** `domain/enums.py`
**Action:** Modify

Add `MapScale` enum:
```python
class MapScale(str, Enum):
    WORLD = "World"
    DUNGEON = "Dungeon"
```

Extend `MapNodeType`:
```python
# World-scale types
REGION   = "Region"
CITY     = "City"
TOWN     = "Town"
VILLAGE  = "Village"
LANDMARK = "Landmark"
PORT     = "Port"
FORTRESS = "Fortress"
ROAD     = "Road"
```

**Verify:** `python -c "from domain.enums import MapNodeType, MapScale; print(list(MapNodeType))"` prints all values.

---

### Step 2: `domain/map.py` — add `scale` field
**File:** `domain/map.py`
**Action:** Modify

Add to `MapBase`:
```python
scale: MapScale = Field(default=MapScale.DUNGEON)
```

Update `MapCreate` to accept `scale`.

**Verify:** `MapCreate(name="test", adventure_id=uuid4(), scale=MapScale.WORLD)` doesn't raise.

---

### Step 3: Alembic migration
**Action:** Run `alembic revision --autogenerate -m "add map scale"`

Expected: adds `scale VARCHAR` column with default `'Dungeon'`.

**Verify:** `alembic upgrade head` runs clean; `alembic current` shows new head.

---

### Step 4: `services/ai_service.py` — `generate_world_map`
**File:** `services/ai_service.py`
**Action:** Add function

Signature:
```python
def generate_world_map(
    db: Session,
    map_id: uuid.UUID,
    prompt: str,
    dm_email: str,
) -> tuple[list[MapNode], list[MapEdge]]:
```

Prompt to Claude:
- Input: DM's world description, campaign name, tone
- Tool/structured output: list of nodes (label, node_type, x, y, description, lore) + edges (from→to, label)
- World should include: 6–12 regions, 1–3 cities, 4–8 towns, geographic landmarks, roads between settlements
- Each region node description includes: dominant race/culture, climate, political alignment, 1-sentence lore hook
- Returns saved MapNode + MapEdge objects (calls `map_service.create_node/create_edge` internally)

AI response format (system prompt instructs Claude to return JSON):
```json
{
  "nodes": [
    { "label": "Ironhold Mountains", "node_type": "Landmark",
      "x": 3, "y": 2, "description": "Dwarven homeland. Rich ore veins..." }
  ],
  "edges": [
    { "from_label": "Ironhold Mountains", "to_label": "Goldenvale City", "label": "King's Road" }
  ]
}
```

**Verify:** Unit test with mocked Claude client returns valid node/edge lists.

---

### Step 5: `api/routers/maps.py` — generate endpoint
**File:** `api/routers/maps.py`
**Action:** Add endpoint

```python
class GenerateWorldRequest(BaseModel):
    prompt: str

@router.post("/maps/{map_id}/generate", response_model=GenerateWorldResponse)
def generate_world(map_id, body: GenerateWorldRequest, db, user):
    nodes, edges = ai_service.generate_world_map(db, map_id, body.prompt, user)
    return {"nodes": nodes, "edges": edges}
```

**Verify:** `POST /maps/{id}/generate` with a prompt returns 200 with nodes + edges.

---

### Step 6: Frontend — `maps.ts` + `types.ts`
**Files:** `frontend/src/api/maps.ts`, `frontend/src/api/types.ts`
**Action:** Modify

Add to `NodeType` union: `"Region" | "City" | "Town" | "Village" | "Landmark" | "Port" | "Fortress" | "Road"`

Add `MapScale = "World" | "Dungeon"` type.

Update `AdventureMap` type to include `scale: MapScale`.

Add `generate: (mapId, prompt) => api.post(...)` to `mapsApi`.

---

### Step 7: `MapBuilder.tsx` — world mode UI
**File:** `frontend/src/pages/MapBuilder.tsx`
**Action:** Rewrite

Key changes:
1. **Scale toggle** on the Create Map form: "Dungeon Map" vs "World Map"
2. **Node colour coding** — a `NODE_COLORS` map from type → CSS colour:
   - Region: indigo, City: gold, Town: teal, Village: sage, Landmark: stone,
     Port: blue, Fortress: crimson, Road: muted; Room: surface2 (existing)
3. **AI Generate panel** (World maps only, shown when map is empty OR via a button):
   - Textarea: "Describe your world..."
   - Button: "Generate World Map"
   - Loading state with spinner text
   - On success: nodes + edges appear on canvas
4. **Node type selector** filters by scale: world scale shows world types,
   dungeon scale shows dungeon types
5. **Node detail sidebar**: clicking a node opens a side panel showing label,
   type, description/lore, with an edit field

**Verify:** Creating a World map shows AI generate panel; clicking Generate populates canvas with 15–25 nodes; nodes are colour-coded; clicking a node opens sidebar.

---

## Validation and Acceptance

- [ ] `pytest -q` passes (new test for `generate_world_map` with mocked client)
- [ ] `alembic upgrade head` succeeds; `maps` table has `scale` column
- [ ] Creating a "World" map shows the AI generate panel
- [ ] Submitting a prompt ("a dark fantasy continent ruled by undead empires")
      returns a populated canvas with colour-coded nodes
- [ ] Each region node description visible in sidebar includes race/culture/lore
- [ ] Manual "Add Location" still works in both scales
- [ ] Existing dungeon maps load and function unchanged

---

## Idempotence and Recovery

- Migration is additive (new column with default) — safe to re-run
- `generate_world_map` clears existing nodes before generating (or user can choose to append)
- If Claude API fails, endpoint returns 503 with a clear message

---

## Interfaces and Dependencies

**Produces:** `POST /maps/{id}/generate`, world-scale node types, world map UI
**Depends on:** existing `map_service`, `ai_service` (claude_client), `MapNode/Edge` domain models

---

## Outcomes and Retrospective

_Fill in after completion._
