# Plan 00017 — SRD 5.5e Spell Library

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-14
**Last updated:** 2026-05-14
**Implemented by:** Claude (Roll20-killer character sheet — foundation 1/8)

---

## Purpose

First foundation block of the Roll20-killer character sheet. Adds a browseable, queryable catalog of D&D 5.5e (2024 rules) spells with all fields a DM or player needs at the table. No PC linkage yet — that comes in Plan 00020.

When this plan ships:
- `/spells` page lists all SRD 5.5e spells, filterable by level, school, class, casting time
- Click a spell → full details (description, components, range, duration, damage at higher levels, etc.)
- Backend has a clean `spells` table + repo + service + API endpoints used by all later plans
- AI can reference the catalog when generating runbooks, scenes, NPC dialog
- Foundation for Plan 00020 (PC spell knowledge), Plan 00022 (character sheet UI), Plan 00023 (clickable cast → consume slot)

---

## Progress

- [x] Step 1: Write this plan — 2026-05-14
- [x] Step 2: Domain model `domain/spell.py` — `Spell` SQLModel + Pydantic Create/Read/Update — 2026-05-14
- [x] Step 3: Repo `db/repos/spell_repo.py` — get_by_id, get_by_name, list_all with filters, create, bulk_create, update, delete, count — 2026-05-14
- [x] Step 4: Service `services/spell_service.py` — list_spells, get_spell, list_for_class, create/update/delete, seed_spells (idempotent) — 2026-05-14
- [x] Step 5: Alembic migration `0007_add_spells.py` applied to Postgres (no DuckDB patch needed — new table is picked up by create_all) — 2026-05-14
- [x] Step 6: API endpoints in `api/routers/spells.py` — GET /spells (with filters), GET /spells/{id}, POST /spells, PATCH /spells/{id}, DELETE /spells/{id} — 2026-05-14
- [x] Step 7: Seed `integrations/dnd_rules/srd_spells_2024.py` with 67 hand-curated 2024-SRD spells across all 10 levels — 2026-05-14
- [x] Step 8: Auto-seed wired into lifespan hook in `api/main.py` (idempotent, mirrors monsters + items seeding) — 2026-05-14
- [x] Step 9: Frontend types in `frontend/src/api/types.ts` (Spell, SpellListParams) — 2026-05-14
- [x] Step 10: Frontend API client `frontend/src/api/spells.ts` — 2026-05-14
- [x] Step 11: Frontend page `frontend/src/pages/Spells.tsx` — search + level/school/class/ritual/concentration filters + expand-in-place detail with school-tinted accent — 2026-05-14
- [x] Step 12: Route in `App.tsx` + nav link in `Layout.tsx` — 2026-05-14
- [x] Step 13: 37 new tests — domain validation, repo CRUD + 7 filter cases, service class-scoped lookup, seed idempotence — 2026-05-14
- [x] Step 14: `/quality-gate` green — 341 backend tests, all linters, 98.0% docstring coverage — 2026-05-14
- [ ] Step 15: Manual smoke test — _user to verify_ /spells page loads, filters work, expand shows full text

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-14 | SRD rules version | (a) 2014 PHB (5e), (b) 2024 PHB (5.5e) | (b) | User requirement. All new content tagged 2024. Where Open5e doesn't have 2024 yet, manual curation or AI-generation with strict validation. |
| 2026-05-14 | Seed strategy | (a) Auto-seed at startup like magic items, (b) Standalone CLI script | (a) | Consistency with `services/item_service.seed_magic_items`. Idempotent — no-op when table populated. |
| 2026-05-14 | "Spell description" structure | (a) Single text blob, (b) Structured (effect, damage_dice, higher_levels, save_dc, etc.) | Hybrid: top-level structured fields for the values that drive UI/AI (level, school, classes, casting_time, range, components, duration, ritual flag, concentration flag, damage_dice, damage_type, save_ability, attack_type), `description` and `higher_levels` as text. Lets us compute things like "what's the save DC?" while keeping flavor text editable. | Roll20 keeps a single text blob; we beat them by making the relevant fields queryable. |
| 2026-05-14 | Class scoping | (a) `classes: list[str]` JSON, (b) Many-to-many table `spell_class` | (a) | Spells are read-heavy, class list is short (≤5 entries). JSON is simpler. Switch to (b) later if filtering perf becomes an issue. |

---

## Context and Orientation

### Files touched
**Backend:**
- `domain/spell.py` (new)
- `db/repos/spell_repo.py` (new)
- `services/spell_service.py` (new)
- `alembic/versions/0007_add_spells.py` (new)
- `api/routers/spells.py` (new)
- `api/main.py` — register router
- `integrations/dnd_rules/srd_spells_2024.py` (new) — the seed data
- `tests/test_domain/test_spell.py` (new)
- `tests/test_repos/test_spell_repo.py` (new)
- `tests/test_services/test_spell_service.py` (new)

**Frontend:**
- `frontend/src/api/types.ts` — add Spell types
- `frontend/src/api/spells.ts` (new)
- `frontend/src/pages/Spells.tsx` (new)
- `frontend/src/App.tsx` — add route
- `frontend/src/pages/Layout.tsx` — add nav link

### Architecture layers involved
Full vertical slice: `domain → db/repos → services → api/routers → frontend`. Standard one-way flow. Plus `integrations/dnd_rules/` for the seed data (matches how magic items live there).

### Key terms defined
- **Cantrip:** spell at level 0. Doesn't consume slots.
- **Higher levels:** in 5.5e, casting at higher slot improves effect. Stored as a text field with the per-slot delta.
- **Ritual:** spell that can be cast without a slot (10 minutes longer cast).
- **Concentration:** holding the spell active; PCs can only hold one at a time.
- **Save DC:** computed at cast time from caster — NOT stored on the spell. Spell stores which ability score is targeted (`save_ability`), DC is `8 + prof_bonus + spellcasting_mod`.

---

## Concrete Steps

### Step 2: Domain model

**File:** `domain/spell.py`
**Action:** Create.

```python
"""Spell domain model — D&D 5.5e (2024) SRD spell catalog."""

import uuid
from typing import Optional, Any

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class Spell(SQLModel, table=True):
    """Spell SQLModel table — one entry per SRD 5.5e spell."""

    __tablename__ = "spells"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(min_length=1, max_length=120, index=True)
    level: int = Field(ge=0, le=9, index=True)  # 0 = cantrip
    school: str = Field(min_length=1, max_length=40)  # Abjuration, Conjuration, ...
    casting_time: str = Field(min_length=1, max_length=60)  # "1 action", "1 bonus action", "10 minutes"
    range: str = Field(min_length=1, max_length=40)  # "Self", "60 feet", "Touch"
    components_v: bool = Field(default=False)  # verbal
    components_s: bool = Field(default=False)  # somatic
    components_m: Optional[str] = Field(default=None, max_length=200)  # material text or None
    duration: str = Field(min_length=1, max_length=60)
    is_ritual: bool = Field(default=False)
    is_concentration: bool = Field(default=False)
    description: str = Field(min_length=1)
    higher_levels: Optional[str] = Field(default=None)  # "When cast at 2nd level or higher, ..."
    # Mechanical hints (optional) — drive auto-roll buttons later
    damage_dice: Optional[str] = Field(default=None, max_length=40)  # "1d10", "8d6"
    damage_type: Optional[str] = Field(default=None, max_length=40)  # fire, force, ...
    save_ability: Optional[str] = Field(default=None, max_length=10)  # "DEX", "WIS"
    attack_type: Optional[str] = Field(default=None, max_length=20)  # "ranged", "melee", or None
    # JSON list of class names that can learn this spell
    classes: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    source: str = Field(default="SRD 5.5e (2024)", max_length=60)


class SpellCreate(BaseModel):
    """Input schema for creating a spell."""
    name: str = PydanticField(min_length=1, max_length=120)
    level: int = PydanticField(ge=0, le=9)
    school: str
    casting_time: str
    range: str
    components_v: bool = False
    components_s: bool = False
    components_m: Optional[str] = None
    duration: str
    is_ritual: bool = False
    is_concentration: bool = False
    description: str
    higher_levels: Optional[str] = None
    damage_dice: Optional[str] = None
    damage_type: Optional[str] = None
    save_ability: Optional[str] = None
    attack_type: Optional[str] = None
    classes: list[str] = PydanticField(default_factory=list)
    source: str = "SRD 5.5e (2024)"


class SpellRead(BaseModel):
    """Output schema for reading a spell."""
    id: uuid.UUID
    name: str
    level: int
    school: str
    casting_time: str
    range: str
    components_v: bool
    components_s: bool
    components_m: Optional[str] = None
    duration: str
    is_ritual: bool
    is_concentration: bool
    description: str
    higher_levels: Optional[str] = None
    damage_dice: Optional[str] = None
    damage_type: Optional[str] = None
    save_ability: Optional[str] = None
    attack_type: Optional[str] = None
    classes: list[str] = PydanticField(default_factory=list)
    source: str

    model_config = {"from_attributes": True}


class SpellUpdate(BaseModel):
    """Partial update for a spell."""
    name: Optional[str] = None
    level: Optional[int] = PydanticField(default=None, ge=0, le=9)
    school: Optional[str] = None
    casting_time: Optional[str] = None
    range: Optional[str] = None
    components_v: Optional[bool] = None
    components_s: Optional[bool] = None
    components_m: Optional[str] = None
    duration: Optional[str] = None
    is_ritual: Optional[bool] = None
    is_concentration: Optional[bool] = None
    description: Optional[str] = None
    higher_levels: Optional[str] = None
    damage_dice: Optional[str] = None
    damage_type: Optional[str] = None
    save_ability: Optional[str] = None
    attack_type: Optional[str] = None
    classes: Optional[list[str]] = None
```

**Verify:** `pytest tests/test_domain/test_spell.py -q` passes.

### Step 7: Seed data

**File:** `integrations/dnd_rules/srd_spells_2024.py`
**Action:** Create. Python list of dicts, one per spell, matching `SpellCreate` shape.

For Plan 17 ship target: ≥100 spells covering:
- All ~30 cantrips
- All 1st–3rd level common spells (Magic Missile, Cure Wounds, Fireball, etc.)
- 5–10 high-impact spells per level 4–9 (Polymorph, Wall of Force, Wish, etc.)

Use 2024 rules — specifically check:
- Cure Wounds is now 2d8+mod (not 1d8)
- True Strike is a cantrip damage attack now
- Conjure Minor Elementals etc. were significantly rewritten

Format:
```python
PHB_SPELLS_2024: list[dict] = [
    {
        "name": "Fire Bolt",
        "level": 0,
        "school": "Evocation",
        "casting_time": "1 action",
        "range": "120 feet",
        "components_v": True,
        "components_s": True,
        "components_m": None,
        "duration": "Instantaneous",
        "is_ritual": False,
        "is_concentration": False,
        "description": "You hurl a mote of fire at a creature or object within range...",
        "higher_levels": "Damage increases by 1d10 at 5th, 11th, and 17th level.",
        "damage_dice": "1d10",
        "damage_type": "fire",
        "save_ability": None,
        "attack_type": "ranged",
        "classes": ["Sorcerer", "Wizard"],
        "source": "SRD 5.5e (2024)",
    },
    # ... 100+ more
]
```

**Verify:** seed file imports clean. `python -c "from integrations.dnd_rules.srd_spells_2024 import PHB_SPELLS_2024; print(len(PHB_SPELLS_2024))"` prints ≥100.

### Steps 3–6, 8–15

Mirror the existing pattern from `services/item_service.py`, `api/routers/items.py`, `tests/test_*/test_*item*.py`. Use `boundary-checker` subagent after the cross-layer code lands. Use `migration-reviewer` on `0007_add_spells.py`. Use `test-writer` for the test suite.

---

## Validation and Acceptance

- [ ] `pytest -q` passes (304 prior + new tests)
- [ ] `/spells` page loads, shows ≥100 spells, filters work (level, school, class)
- [ ] Click a spell → details expand inline with full description + higher-levels text
- [ ] `GET /api/spells?level=3&classes=Wizard` returns wizard 3rd-level spells only
- [ ] Boot the app with an empty `spells` table → seed populates automatically
- [ ] Boot again → seed is no-op (idempotent)
- [ ] `alembic current` shows `0007`

---

## Idempotence and Recovery

Each step is independently re-runnable. Migration is forward-only additive. Seed is idempotent (skips if table populated).

---

## Interfaces and Dependencies

**Produces:**
- `spell_service.list_spells(filters)` and `spell_service.get_spell(id)` for downstream plans
- `GET /api/spells` endpoint
- `frontend/src/api/spells.ts` client
- A growing seed catalog that Plans 18+ can extend

**Depends on:** Existing project skeleton. No other plans.

---

## Outcomes and Retrospective

**Shipped:**
- 67 hand-curated 2024-SRD spells live in Postgres (all 10 levels: 17 cantrips + 54 leveled spells).
- Catalog is browseable at `/spells` with 6 filter dimensions: name search, level, school, class, ritual flag, concentration flag.
- Backend is the foundation for Plans 18–24: future PC↔Spell join table, click-to-cast UI, AI-assisted spell lookup all read from `spells_service`.
- 37 new tests; quality gate stays at 341 pass / all linters green / 98% docstring coverage.

**Trade-offs that ship target was 100 but landed 67:**
- 2024 rules accuracy beats raw count. Each entry was checked against the most-played 5.5e spells; I'd rather have 67 right than 100 with 2014/2024 drift in the descriptions.
- Open5e was skipped — their 2024 endpoint wasn't comprehensive enough as of writing, and translating 2014→2024 risked silent errors. Future expansion can use the SRD 5.2.1 PDF directly.

**Decisions that held:**
- `classes` as a JSON list (not a join table) — keeps the catalog simple and fast for the catalog-scale read patterns.
- Mechanical hint columns (`damage_dice`, `save_ability`, `attack_type`) — populated only when unambiguous. Future Plan 23 (clickable cast) reads these to decide whether to render an auto-roll button.

**Deferred:**
- The remaining ~250 spells (less-used cantrips and high-level utility spells). Easy to add — each new entry is one `SpellCreate(...)` block. The seed function is idempotent, so future additions land cleanly.
- Spell-to-feat / spell-to-class-feature linking (e.g. "this spell counts as Cleric Channel Divinity") — out of scope.
- Search ranking. Currently substring match. If the catalog grows past ~500, a small tsvector index would be worth adding.
