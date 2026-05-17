# Plan 00033 — NPC Sheets

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-17

---

## Purpose

NPCs are currently just an opaque JSON blob on each Adventure
(`adventure.npc_roster`). The DM has no structured way to:

- Track who's alive, where they are, and what they want
- Carry an NPC from one adventure to the next
- Pull up an NPC mid-session to remember their personality / secret / dialog
- Link an NPC to combat stats when they fight

This plan adds real, campaign-scoped NPC sheets. Each NPC is a story
entity (name, role, personality, motivation, secret, dialog hooks,
status, location, tags); combat stats are optional via a link to an
existing Monster row.

---

## Progress

- [x] Step 1: Write this plan
- [ ] Step 2: Domain — `Npc` + `NpcStatus` enum + Create/Read/Update schemas
- [ ] Step 3: Alembic migration 0015 + DuckDB patch
- [ ] Step 4: `db/repos/npc_repo.py`
- [ ] Step 5: `services/npc_service.py` — CRUD with authz + AI generate
- [ ] Step 6: `api/routers/npcs.py` — 6 endpoints
- [ ] Step 7: Backend tests
- [ ] Step 8: Frontend — `Npcs.tsx` page + `NpcModal` + sidebar nav
- [ ] Step 9: Quality gate + commit + push

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-17 | Scope | Adventure-scoped vs campaign-scoped | Campaign | NPCs survive across adventures. A recurring antagonist matters in session 1 and session 12. |
| 2026-05-17 | Combat stats | Embedded statblock vs link to Monster | Link (optional) | Reuses existing monster catalog. Generic "Guard" / "Bandit" templates already exist. NPCs are story-first; if you need combat, point at a Monster. |
| 2026-05-17 | Adventure.npc_roster | Migrate / leave | Leave | The JSON blob is still useful as a per-adventure "who appears here" list. Future plan can wire it to NPC IDs. |
| 2026-05-17 | AI generation | New endpoint vs reuse existing generate_npc | New thin wrapper | `ai_service.generate_npc` already exists; the new endpoint persists the result. |
| 2026-05-17 | Relationships | Free-text vs graph | Free-text notes | A relationship graph is a lot of UI for marginal gain. The DM can mention "owes Captain Aldric a favor" in notes. Future plan if needed. |

---

## Domain shape

```python
class NpcStatus(str, Enum):
    ALIVE = "Alive"
    DEAD = "Dead"
    MISSING = "Missing"
    IMPRISONED = "Imprisoned"
    UNKNOWN = "Unknown"


class Npc(SQLModel, table=True):
    __tablename__ = "npcs"
    id: UUID
    campaign_id: UUID  # FK
    name: str
    role: Optional[str]            # "innkeeper", "sage", "mob boss"
    race: Optional[str]
    gender: Optional[str]
    age: Optional[str]             # free text — "ancient", "in their 40s"
    appearance: Optional[str]      # paragraph
    personality: Optional[str]
    motivation: Optional[str]
    secret: Optional[str]
    dialog_hooks: list[str]        # JSON
    tags: list[str]                # JSON — ["ally", "merchant", "patron"]
    status: NpcStatus = ALIVE
    location: Optional[str]        # "Last seen in Phandalin"
    monster_stat_block_id: Optional[UUID]   # FK monsters.id, nullable
    portrait_url: Optional[str]
    notes: Optional[str]           # private DM notes
    created_at: datetime
    updated_at: datetime
```

---

## Files touched

**Backend:**
- `domain/npc.py` (new)
- `domain/enums.py` — add `NpcStatus`
- `db/repos/npc_repo.py` (new)
- `services/npc_service.py` (new)
- `api/routers/npcs.py` (new)
- `api/main.py` — mount router
- `alembic/versions/0015_add_npcs.py` (new)
- `db/base.py` — DuckDB patch
- `tests/test_services/test_npc_service.py` (new)

**Frontend:**
- `frontend/src/api/npcs.ts` (new)
- `frontend/src/pages/Npcs.tsx` (new)
- `frontend/src/components/npc/NpcModal.tsx` (new)
- `frontend/src/App.tsx` — register `/campaigns/:cid/npcs` route
- `frontend/src/pages/Layout.tsx` — sidebar nav item under "Campaign"

---

## Validation and Acceptance

- [ ] `pytest -q` passes
- [ ] Sidebar shows "👤 NPCs" when a campaign is active
- [ ] Page lists NPCs in the campaign with portrait / name / role / status
- [ ] "+ New NPC" opens modal; fields persist
- [ ] "✨ Generate" autofills via Claude
- [ ] Status badge color reflects state (green=Alive, gray=Unknown, red=Dead, etc.)
- [ ] Tag filter narrows the list

---

## Outcomes and Retrospective

**Shipped 2026-05-17:**

Backend
- `domain/npc.py` — `Npc` SQLModel + `NpcCreate` / `NpcRead` / `NpcUpdate`
  / `NpcGenerate` Pydantic schemas. `NpcStatus` enum added to
  `domain/enums.py`.
- Migration `0015_add_npcs.py` — campaign-scoped npcs table with
  optional `monster_stat_block_id` FK for combat stats.
- `db/repos/npc_repo.py` — standard CRUD + `list_by_campaign`. Updates
  bump `updated_at`.
- `services/npc_service.py` — CRUD with campaign-owner authz, 100-NPC
  cap, and `generate_npc_from_ai` that reuses the existing
  `ai_service.generate_npc` and (optionally) persists the result.
- `api/routers/npcs.py` — 6 endpoints:
  - `GET /campaigns/{id}/npcs`, `POST .../npcs`, `POST .../npcs/generate`
  - `GET /npcs/{id}`, `PATCH /npcs/{id}`, `DELETE /npcs/{id}`
- 17 new service tests; full suite 550 ✓.

Frontend
- `frontend/src/api/npcs.ts` — typed client + status color map.
- `frontend/src/pages/Npcs.tsx` — campaign-scoped grid of NPC cards
  with portrait / name / role / status / first 4 tags / personality
  preview. Action bar: "+ New NPC" + "✨ Generate (role)" inline.
- Tag filter chips (auto-collected from existing NPCs).
- `frontend/src/components/npc/NpcModal.tsx` — full form: identity,
  status, location, appearance, personality, motivation, secret,
  dialog hooks (line-per-entry), tags (comma-separated), notes.
  Delete with confirm.
- Route `/campaigns/:campaignId/npcs` + sidebar nav item "👤 NPCs"
  under the Campaign section.

**Surprises:** none. The existing `ai_service.generate_npc` was a clean
fit — just needed the orchestrating wrapper.

**Tech debt:** none. NPC ↔ adventure linkage is still loose (the
adventure.npc_roster JSON blob is unchanged). A future plan can wire
that to NPC IDs if the table-side experience needs it.
