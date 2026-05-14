# Plan 00021 — Class Features, Rest Mechanics + Party-Wide Rest

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-14
**Last updated:** 2026-05-14
**Implemented by:** Claude (Roll20-killer character sheet — foundation 5/8)

---

## Purpose

Fifth foundation block. Adds the **class feature** layer (Action Surge,
Rage, Wild Shape, Channel Divinity, Bardic Inspiration, Ki Points, etc.)
and the rest mechanics that recharge them. Plus the DM-requested
**one-click party-wide short / long rest** buttons.

When this plan ships:
1. **`class_features`** catalog of ~30 most-used 2024 class features with
   recharge type, max uses (formula or fixed), and description.
2. **`character_features`** junction tracks each PC's feature usage.
3. **`rest_service`** consolidates the rest mechanics:
   - **Per-PC short rest:** restores `recharge=short` features + Warlock
     pact slots. Optional hit-die spend (deferred).
   - **Per-PC long rest:** restores everything (slots, all features, HP to
     max).
   - **Party-wide short rest:** applies short-rest to every PC in the
     session's `attending_pc_ids`.
   - **Party-wide long rest:** same, but long rest.
4. **API endpoints** scoped at session level for party-wide rest +
   per-PC for individual feature management.
5. **Frontend:**
   - `FeaturePanel.tsx` on each PC card (like SpellPanel/InventoryPanel).
   - **🌙 Long Rest Party / ⛺ Short Rest Party** buttons in the
     `SessionHud` top bar (the DM-requested ask).

---

## Progress

- [x] Step 1: Write this plan — 2026-05-14
- [x] Step 2: Domain — `ClassFeature` + `CharacterFeature` + `RecoveryType` + `UsesFormula` enums + `RestSummary` — 2026-05-14
- [x] Step 3: Migration 0012 applied to Postgres — 2026-05-14
- [x] Step 4: `ClassFeatureRepo` + `CharacterFeatureRepo` — 2026-05-14
- [x] Step 5: `feature_service` with formula resolution, learn (idempotent), spend/restore (clamped), forget, list_catalog, seed_catalog — 2026-05-14
- [x] Step 6: `rest_service` with `short_rest_pc`, `long_rest_pc`, `short_rest_party`, `long_rest_party`. Warlock pact slot recovery wired through `spellcasting_service` — 2026-05-14
- [x] Step 7: 19 curated 2024 class features (Rage, Bardic Inspiration, Channel Divinity, Wild Shape, Second Wind, Action Surge, Indomitable, Focus Points, Lay on Hands, Favored Enemy, Cunning Strike, Stroke of Luck, Sorcery Points, Font of Magic, Eldritch Invocations, Arcane Recovery, Memorize Spell, Song of Rest, Paladin Channel Divinity) — 2026-05-14
- [x] Step 8: Auto-seed in lifespan hook — 2026-05-14
- [x] Step 9: Two routers — `/class-features` + `/characters/{id}/features/...` + `/characters/{id}/rest/{type}` + `/sessions/{id}/rest/{type}` — 2026-05-14
- [x] Step 10: 28 backend tests covering formula resolution (5 ability/level combos), learn idempotency, spend/restore/clamp, catalog filters, seed idempotency, short rest scope, long rest full reset, party rest summaries, authz, empty-roster — 2026-05-14
- [x] Step 11: Frontend types `ClassFeature` / `CharacterFeature` / `RestSummary` + `featuresApi` + `restApi` — 2026-05-14
- [x] Step 12: `FeaturePanel.tsx` — feature pips (color-coded by recovery), per-PC ⛺/🌙 rest buttons, catalog picker, restore status toast. Wired into Characters.tsx — 2026-05-14
- [x] Step 13: SessionHud party-rest buttons in top bar with confirmation dialogs and a 5-second toast summarizing the party-wide changes — 2026-05-14
- [x] Step 14: `/quality-gate` green — 439 backend tests, all linters, 97.2% docstring coverage — 2026-05-14
- [ ] Step 15: Manual smoke — _user to verify_ ⛺ Short Rest in SessionHud → toast appears, feature pips refill across Characters tab

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-14 | Class-feature uses formula | (a) Eval-string `"prof_bonus"`, (b) Enum `FIXED \| PROF_BONUS \| LEVEL_DIV_3`, (c) Store the computed value at PC-feature learn time | (b) | Enum keeps logic centralized in the service. (c) drifts if PC levels up. (a) is unsafe. |
| 2026-05-14 | HP restoration on long rest | (a) Restore to hp_max, (b) Restore by hit dice + CON | (a) | 2024 rules: long rest restores all HP. Hit dice spend is a short-rest mechanic and is deferred (Plan 24 polish). |
| 2026-05-14 | Party rest button location | (a) SessionHud top bar, (b) SessionRunner sidebar, (c) Both | (c) | User specifically asked for one-click DM control. Putting it in both surfaces means it's available wherever the DM is. |
| 2026-05-14 | Short rest recovers Warlock slots | yes/no | yes | RAW: Warlock pact slots recover on short rest. The rest_service does this through `spellcasting_service` for Warlock PCs only. |
| 2026-05-14 | "Attending PCs" definition for party rest | (a) `session.attending_pc_ids`, (b) all campaign PCs | (a) | The DM marks the party at session start. Honors their explicit roster. |

---

## Context and Orientation

### Files touched

**Backend:**
- `domain/character.py` — `ClassFeature` + `CharacterFeature` + `RecoveryType` enum
- `db/repos/class_feature_repo.py`, `db/repos/character_feature_repo.py` (new)
- `services/feature_service.py` (new)
- `services/rest_service.py` (new)
- `alembic/versions/0012_add_class_features.py` (new)
- `db/base.py` — no DuckDB patch needed for new tables
- `integrations/dnd_rules/class_features_2024.py` (new) — curated seed
- `api/routers/rest.py` (new) — party-rest endpoints
- `api/routers/features.py` (new) — per-PC feature endpoints
- `api/main.py` — register new routers + auto-seed hook
- `tests/test_services/test_feature_service.py`, `test_rest_service.py` (new)

**Frontend:**
- `frontend/src/api/types.ts` — `ClassFeature`, `CharacterFeature`, payload types
- `frontend/src/api/features.ts`, `frontend/src/api/rest.ts` (new)
- `frontend/src/components/FeaturePanel.tsx` (new)
- `frontend/src/pages/Characters.tsx` — render `<FeaturePanel>`
- `frontend/src/pages/SessionHud.tsx` — top-bar rest buttons

### Key terms defined
- **Recharge / recovery type:** When a feature's uses come back. ``"short"`` = short rest, ``"long"`` = long rest, ``"none"`` = passive/no charges, ``"per_turn"`` = handled in combat (Sneak Attack — once per turn, not a use-counter).
- **Max uses formula:** A small enum like `FIXED_1`, `FIXED_2`, `PROF_BONUS`, `WIS_MOD`, `CHA_MOD`, `LEVEL`, `LEVEL_DIV_3`, etc. The service computes the actual number from the PC.
- **Short rest:** ~1 hour. Restores `recharge="short"` features + Warlock slots.
- **Long rest:** ~8 hours. Restores everything: spell slots, all feature uses, HP to max.

---

## Concrete Steps

### Step 2: Domain sketch

```python
class RecoveryType(str, Enum):
    """When a class feature's uses recover."""
    SHORT = "short"
    LONG = "long"
    NONE = "none"
    PER_TURN = "per_turn"


class UsesFormula(str, Enum):
    """Formulas for max_uses. The service resolves each against a PC."""
    NONE = "none"               # passive / not a counter
    FIXED_1 = "fixed_1"
    FIXED_2 = "fixed_2"
    FIXED_3 = "fixed_3"
    PROF_BONUS = "prof_bonus"
    WIS_MOD = "wis_mod"
    CHA_MOD = "cha_mod"
    INT_MOD = "int_mod"
    LEVEL = "level"
    LEVEL_DIV_3 = "level_div_3"


class ClassFeature(SQLModel, table=True):
    __tablename__ = "class_features"
    id: uuid.UUID = ...
    name: str
    character_class: CharacterClass
    subclass: Optional[str] = None
    level_acquired: int = Field(ge=1, le=20)
    recovery: RecoveryType
    uses_formula: UsesFormula
    description: str
    source: str = "SRD 5.5e / 2024 PHB"


class CharacterFeature(SQLModel, table=True):
    __tablename__ = "character_features"
    id: uuid.UUID = ...
    character_id: uuid.UUID = Field(foreign_key="player_characters.id", index=True)
    feature_id: uuid.UUID = Field(foreign_key="class_features.id", index=True)
    uses_spent: int = Field(default=0, ge=0)
    notes: Optional[str] = None
```

### Step 6: rest_service surface

```python
def short_rest_pc(db, pc_id, dm_email) -> RestSummary:
    # Reset CharacterFeature.uses_spent=0 for features with recovery=SHORT
    # Restore Warlock pact slots via spellcasting_service
    # Return summary {features_restored, slots_restored}

def long_rest_pc(db, pc_id, dm_email) -> RestSummary:
    # Reset all CharacterFeature.uses_spent=0
    # spellcasting_service.long_rest_recover
    # Set hp_current = hp_max
    # Return summary

def short_rest_party(db, session_id, dm_email) -> dict[character_name, RestSummary]:
    # Resolve attending_pc_ids
    # For each: short_rest_pc

def long_rest_party(db, session_id, dm_email) -> dict[character_name, RestSummary]:
    # Same but long
```

### Step 7: Seed file shape

```python
CLASS_FEATURES_2024: list[ClassFeatureCreate] = [
    ClassFeatureCreate(
        name="Action Surge",
        character_class=CharacterClass.FIGHTER,
        level_acquired=2,
        recovery=RecoveryType.SHORT,
        uses_formula=UsesFormula.FIXED_1,  # FIXED_2 at level 17
        description="On your turn, take one additional action.",
    ),
    ClassFeatureCreate(
        name="Second Wind",
        character_class=CharacterClass.FIGHTER,
        level_acquired=1,
        recovery=RecoveryType.SHORT,
        uses_formula=UsesFormula.FIXED_2,  # bumps later levels
        description="Bonus action: regain 1d10 + Fighter level HP.",
    ),
    # ... ~28 more
]
```

### Step 13: SessionHud party-rest buttons

Add two buttons in the top bar (next to 💰 Loot):
- **⛺ Short Rest** — confirms then POSTs to `/sessions/{id}/rest/short`. Surfaces a toast with per-PC summary.
- **🌙 Long Rest** — same but `long`. Confirms with "This restores HP, slots, and all feature uses for the whole party. Continue?".

---

## Validation and Acceptance

- [ ] `pytest -q` passes (411 prior + new tests)
- [ ] Manual: Fighter PC, spend Action Surge → click ⛺ Short Rest Party → Action Surge restored
- [ ] Manual: Wizard PC, spend Fireball + take damage → click 🌙 Long Rest Party → slot restored + HP back to max
- [ ] Manual: Warlock PC, spend pact slots → ⛺ Short Rest Party → pact slots back
- [ ] `alembic current` shows 0012

---

## Idempotence and Recovery

Rest endpoints are intentionally NOT idempotent on the GET sense — every click triggers the rest. (A "Long Rest" twice in a row is a no-op functionally since everything is already maxed.)

---

## Interfaces and Dependencies

**Produces:**
- Class feature catalog
- `rest_service.*_party()` for the DM control
- Feature management API for Plan 22 to render

**Depends on:** Plan 20 (spell slot service for restoration), existing `PlayerCharacter`.

---

## Outcomes and Retrospective

**Shipped:**
- 19 curated 2024 class features in catalog across all 12 classes with the right recovery type (Action Surge → short, Lay on Hands → long, etc.).
- `feature_service.resolve_max_uses` translates 13 different `UsesFormula` enum values to integers per PC: FIXED_N, PROF_BONUS, ability mods, LEVEL, LEVEL_DIV_3/2.
- `rest_service` consolidates short rest (features + Warlock pact slots), long rest (everything + HP to max), and **party-wide variants** that loop over `session.attending_pc_ids`.
- **DM-requested one-click party rest** lives in the SessionHud top bar (⛺ Short / 🌙 Long), with confirmation dialogs and a 5-second auto-dismissing toast summarizing what got restored across the party.
- Per-PC FeaturePanel mirrors the spell/inventory pattern: feature pips, click to spend, click to restore, per-PC rest buttons.

**Trade-offs:**
- Use formulas are an enum. Adding new ones (e.g. "INT mod + level" for a specific feature) requires a code change. Acceptable — the formulas are stable PHB constructs.
- 19 features is a starter set — only catalogues limited-use abilities the DM tracks at the table. Passives (Sneak Attack damage, Expertise, Fighting Style) intentionally omitted.
- Short rest does NOT restore HP via hit dice (deferred to Plan 24 polish — needs a separate hit-die-spend flow).

**Caveats / known limitations:**
- Bardic Inspiration formula is fixed at LONG until level 5 per RAW. Plan 24 could add a level-aware override that re-checks recovery on Lv5+. For now the seed marks it LONG to err safe.
- Multi-classed PCs aren't supported — `character_class` is single. Plan 24 is the right place.

**Deferred:**
- Hit Dice spend on short rest (separate from feature/slot restoration).
- Level-aware recovery shifts (Bardic Inspiration L5+, Second Wind scaling).
- Exhaustion management on long rest (-1 exhaustion).
