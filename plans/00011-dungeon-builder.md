# Plan 00011 — Dungeon Builder

## Status
[x] COMPLETE — 2026-03-16

**Started:** 2026-03-16
**Last updated:** 2026-03-16
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

The current Dungeon-scale map builder is a generic node-graph (labeled circles + lines).
A DM running a dungeon needs:
- **Rooms** with real size (drag-resize), type, encounter link, loot notes, trap notes
- **Corridors / doors** with types: open, locked, secret, trapped, barricaded, portcullis
- **Visual language** that reads like a dungeon, not a flowchart

World-scale map is untouched — the fantasy node-graph is correct for overworld maps.
The scale check (`selectedMapScale === "Dungeon"`) gates which UI renders.

---

## Progress

- [x] Step 1: Write plan
- [x] Step 2: Backend — enums, domain models
- [x] Step 3: Backend — Alembic migration (0003_dungeon_builder_fields.py)
- [x] Step 4: Backend — service + API pass-through
- [x] Step 5: Backend quality gates (black/isort/flake8/interrogate/pytest) — 282 passing
- [x] Step 6: Frontend — DungeonRoomNode custom node + NodeResizer
- [x] Step 7: Frontend — dungeon toolbar, door-type edges, room panel
- [x] Step 8: Frontend — encounter dropdown (fetches adventure's encounters)
- [x] Step 9: Frontend build passes (npm run build clean)
- [ ] Step 10: Commit & push

---

## Schema Changes

### `map_nodes` — 4 new columns
| Column | Type | Default | Notes |
|---|---|---|---|
| `width` | INTEGER | 200 | px width of room node |
| `height` | INTEGER | 120 | px height of room node |
| `loot_notes` | TEXT | NULL | free-text loot description |
| `trap_notes` | TEXT | NULL | free-text trap description |

`x`, `y` continue to work as pixel offsets (React Flow position).

### `map_edges` — 1 new column
| Column | Type | Default | Notes |
|---|---|---|---|
| `door_type` | VARCHAR(20) | 'open' | DoorType enum value |

---

## New / Changed Domain Objects

### `domain/enums.py`

**`DoorType` enum (new):**
```python
class DoorType(str, Enum):
    OPEN        = "open"        # open archway / corridor
    LOCKED      = "locked"      # locked door — note DC in label
    SECRET      = "secret"      # hidden door
    TRAPPED     = "trapped"     # trapped door/corridor
    BARRICADED  = "barricaded"  # blocked door
    PORTCULLIS  = "portcullis"  # iron gate
```

**`MapNodeType` — replace bad dungeon types:**
Remove: `CORRIDOR`, `OUTDOOR`, `SETTLEMENT`, `DUNGEON`, `LAIR`
Add:
```python
ROOM            = "Room"
BOSS_CHAMBER    = "Boss Chamber"
TREASURE_ROOM   = "Treasure Room"
TRAP_ROOM       = "Trap Room"
SECRET_ROOM     = "Secret Room"
ENTRANCE        = "Entrance"
EXIT            = "Exit"
STAIRS_UP       = "Stairs Up"
STAIRS_DOWN     = "Stairs Down"
CORRIDOR        = "Corridor"   # keep — used as a connection room type
```
World types unchanged.

### `domain/map.py`

`MapNodeBase`: add `width`, `height`, `loot_notes`, `trap_notes`
`MapNodeUpdate`: add same fields as optional
`MapEdgeBase`: add `door_type: DoorType = DoorType.OPEN`
`MapEdgeUpdate`: add `door_type: Optional[DoorType] = None`

---

## Alembic Migration

Single migration: `0005_dungeon_builder_fields.py`
```python
op.add_column("map_nodes", sa.Column("width", sa.Integer(), server_default="200", nullable=False))
op.add_column("map_nodes", sa.Column("height", sa.Integer(), server_default="120", nullable=False))
op.add_column("map_nodes", sa.Column("loot_notes", sa.Text(), nullable=True))
op.add_column("map_nodes", sa.Column("trap_notes", sa.Text(), nullable=True))
op.add_column("map_edges", sa.Column("door_type", sa.String(20), server_default="open", nullable=False))
```

---

## Frontend Architecture

### World map: unchanged
When `selectedMapScale === "World"` the existing React Flow canvas with fantasy node-graph renders as before.

### Dungeon map: new `DungeonBuilder` component
Rendered when `selectedMapScale === "Dungeon"`.

#### `DungeonRoomNode` — custom React Flow node
```
┌─────────────────────┐
│ 🏚 Goblin Barracks   │  ← label + type icon
│ [Boss Chamber]       │  ← node_type badge
│ ────────────────     │
│ ⚔️  Goblin Warband   │  ← encounter name (if linked)
│ 💰 Gold, gems        │  ← loot_notes (if set)
│ ⚠️  Pit trap         │  ← trap_notes (if set)
└─────────────────────┘
  ↑ NodeResizer handles on all 4 sides
```
- Stone-textured card (`background: #2a2a2a`, `border: 2px solid #555`)
- Room type determines border-left accent color
- Resize persists `width`/`height` via debounced PATCH

#### Door-type edge styling
| Type | Visual |
|---|---|
| open | solid grey line |
| locked | dashed gold line + 🔒 label |
| secret | dotted purple line + 👁 label |
| trapped | solid red line + ⚠️ label |
| barricaded | thick brown line + 🪵 label |
| portcullis | solid blue line + ▦ label |

#### Room Properties Panel (right sidebar)
Replaces current simple description textarea when a dungeon node is selected:
- Label (text input)
- Room Type (select — dungeon types only)
- Encounter (searchable select — fetches `encountersApi.list(adventureId)`)
- Description (textarea — read-aloud text)
- Loot Notes (textarea)
- Trap Notes (textarea)
- Notes (textarea — DM notes)

#### Dungeon Toolbar
Replaces world-map node type selector in dungeon mode:
- Node type buttons: Room, Boss Chamber, Treasure Room, Trap Room, Secret Room, Entrance/Exit, Stairs ↑↓
- Door type for next edge: open/locked/secret/trapped/barricaded/portcullis
- Grid snap toggle (snap to 20px grid)
- Background: #111118 (very dark)

---

## Files Touched

```
domain/enums.py                                — DoorType enum, MapNodeType update
domain/map.py                                  — new fields on node/edge models
alembic/versions/0005_dungeon_builder_fields.py — migration
services/map_service.py                        — pass width/height/loot_notes/trap_notes/door_type
api/routers/maps.py                            — no changes needed (pass-through)
frontend/src/api/types.ts                      — MapNode + MapEdge + DoorType
frontend/src/api/maps.ts                       — send new fields in create/update
frontend/src/pages/MapBuilder.tsx              — DungeonRoomNode, dungeon toolbar,
                                                 room panel, door-type edges
```

---

## Validation and Acceptance

- [ ] `alembic upgrade head` runs clean
- [ ] `pytest -q` passes
- [ ] Dungeon map: rooms are cards with resize handles
- [ ] Dragging a resize handle persists new size (PATCH fires, room stays sized on reload)
- [ ] Room properties panel shows encounter dropdown (lists adventure's encounters)
- [ ] Edges show door-type icons (locked shows 🔒, secret shows dotted line)
- [ ] World map is visually unchanged
- [ ] `npm run build` passes

---

## Interfaces and Dependencies

**Produces:** Rich dungeon builder replacing node-graph for Dungeon-scale maps
**Depends on:** Encounters existing for the adventure (optional — rooms work without encounters)
**Does not affect:** World map builder, monster compendium, session HUD, encounter system
