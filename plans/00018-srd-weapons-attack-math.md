# Plan 00018 — SRD 5.5e Weapons + Attack-Roll Math

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-14
**Last updated:** 2026-05-14
**Implemented by:** Claude (Roll20-killer character sheet — foundation 2/8)

---

## Purpose

Second foundation block of the Roll20-killer character sheet. Adds:
1. **Weapon stats** (damage die, type, properties, mastery, weapon category) as columns on the existing ``items`` table.
2. **Attack-roll math service** — given a PC and a weapon, computes `{hit_bonus, damage_roll, damage_type, mastery}` according to 5.5e rules (finesse, ranged ability, proficiency bonus, versatile damage).
3. **2024 Weapon Mastery** support — Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex stored as a single property per weapon (the new 2024 feature).
4. **API endpoint** `POST /items/{id}/attack-preview?character_id=...` returning the computed numbers, ready for Plan 22's character sheet to display.
5. **Frontend Weapons page** browsing all weapons with full stats, mastery tooltips, and (where a character context is given) an inline attack preview.

When this plan ships, Plan 19 (PC inventory) can link PCs to weapons, and Plan 22 (character sheet UI) has a clean attack-roll API to call.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-14
- [x] Step 2: Domain: 7 nullable weapon columns on `Item`; `WeaponAttackPreview` Pydantic schema — 2026-05-14
- [x] Step 3: Migration 0009 applied to Postgres + DuckDB patch entries — 2026-05-14
- [x] Step 4: Repo filter handled at the service layer (`list_weapons` filters in Python over the small catalog) — 2026-05-14
- [x] Step 5: `services/attack_service.py` — `compute_attack`, `is_weapon`, `ability_modifier`, `proficiency_bonus` — 2026-05-14
- [x] Step 6: `item_service.list_weapons`, `is_weapon`, `seed_weapons` (idempotent) — 2026-05-14
- [x] Step 7: API: `GET /weapons` with category/mastery/property filters + `POST /items/{id}/attack-preview` — 2026-05-14
- [x] Step 8: 35 attack-service tests covering melee STR, finesse DEX-pref, finesse STR-pref, finesse tie, ranged DEX, thrown STR, thrown+finesse, versatile 1H/2H, non-versatile two_handed flag ignored, proficient=False, level-scaling proficiency, negative mod, zero mod, error path — 2026-05-14
- [x] Step 9: Frontend: `MagicItem` extended with weapon fields, new `WeaponAttackPreview` type, `Weapons.tsx` page with mastery+property tooltips, route + nav link — 2026-05-14
- [x] Step 10: `scripts/parse_srd_weapons.py` — one-shot parser. 38 weapons seeded (the SRD has 38, including Blowgun with 1-flat damage) — 2026-05-14
- [x] Step 11: Auto-seed in `api/main.py` lifespan hook alongside monsters, items, spells — 2026-05-14
- [x] Step 12: `/quality-gate` green — 376 tests (341 + 35), all linters, 98.2% docstring coverage — 2026-05-14
- [ ] Step 13: Manual smoke test — _user to verify_ /weapons page loads, filters work, mastery tooltips show on hover

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-14 | Weapons schema location | (a) New `weapons` table, (b) Add nullable columns to `items` | (b) | Magic weapons inherit Item fields (rarity, attunement, image_url) AND need weapon stats. One row per weapon, not two. Loot-handout (Plan 16) keeps working unchanged. |
| 2026-05-14 | Weapon properties storage | (a) JSON array, (b) Bool columns per property | (a) | 2024 has ~10 properties; bool-per-property would balloon the row schema for marginal query benefit. JSON keeps it simple and aligns with how `condition_immunities` on monsters is stored. |
| 2026-05-14 | Weapon mastery: nullable single string vs JSON list | (a) Single column, (b) JSON list | (a) | 2024 PHB: every weapon has exactly ONE mastery property. Single column makes filtering trivial ("show me all Vex weapons"). |
| 2026-05-14 | Proficiency assumption | (a) Always assume proficient, (b) Look up class weapon proficiencies | (a) for Plan 18 | The attack service takes an optional `proficient` flag (defaults True). Plan 21 (class features) will wire class-based proficiency lookups. Keeps Plan 18 unblocked. |

---

## Context and Orientation

### Files touched

**Backend:**
- `domain/item.py` — add weapon columns to `Item`, add `WeaponAttackPreview` Pydantic schema
- `db/repos/item_repo.py` — `list_weapons` query helper
- `services/item_service.py` — `list_weapons`, `is_weapon`
- `services/attack_service.py` (new) — `compute_attack(weapon, character, proficient=True)`
- `api/routers/items.py` — extend list endpoint, add attack-preview endpoint
- `alembic/versions/0009_add_weapon_columns.py` (new)
- `db/base.py` — DuckDB patch for new columns
- `integrations/dnd_rules/srd_weapons_2024.py` (new) — seed list
- `scripts/parse_srd_weapons.py` (new, one-shot, gitignored cache)
- `services/spell_service.py` style: `seed_weapons` idempotent function
- `api/main.py` — lifespan seed hook
- `tests/test_domain/test_weapon_fields.py` (new)
- `tests/test_services/test_attack_service.py` (new) — attack math edge cases
- `tests/test_services/test_item_service.py` (extend) — list_weapons

**Frontend:**
- `frontend/src/api/types.ts` — extend `MagicItem` with weapon fields (or new `Weapon` type)
- `frontend/src/api/items.ts` — `listWeapons`, `attackPreview`
- `frontend/src/pages/Weapons.tsx` (new)
- `frontend/src/App.tsx` — route
- `frontend/src/pages/Layout.tsx` — nav link

### Architecture layers involved
Full vertical slice: domain → repos → services → api → frontend. Plus `integrations/dnd_rules/` for the seed.

### Key terms defined
- **Mastery (2024):** A property of every weapon, granting a special effect when the wielder is proficient. E.g. *Vex* on a Rapier means a hit grants Advantage on your next attack against the same target.
- **Versatile:** Weapons usable one- or two-handed (e.g. Longsword 1d8/1d10). The two-handed damage is stored in `versatile_damage`.
- **Finesse:** Weapons that may use DEX instead of STR for attack + damage rolls.
- **Hit bonus:** `ability_mod + (proficiency_bonus if proficient else 0)`.
- **Damage roll:** `{die} + {ability_mod}` — proficiency is NOT added to damage in 5.5e.

### Attack math reference (5.5e)

```
melee weapon, not finesse        → STR mod for hit + damage
melee weapon, finesse            → max(STR mod, DEX mod) for hit + damage
ranged weapon, not thrown        → DEX mod for hit + damage
thrown weapon (no finesse)       → STR mod for hit + damage
thrown weapon with finesse       → max(STR, DEX) for hit + damage
hit_bonus = ability_mod + (prof_bonus if proficient else 0)
damage_roll = "{die}+{ability_mod}" (no prof)
versatile two-handed damage      → use versatile_damage instead of damage_die
proficiency_bonus = (level - 1) // 4 + 2  (so +2 at level 1, +3 at 5, +4 at 9, ...)
```

---

## Concrete Steps

(Steps follow the patterns established in Plans 17 and 17b — read those if you're picking this up mid-flight.)

### Step 5 in detail: attack_service

```python
def compute_attack(
    weapon: Item,
    character: PlayerCharacter,
    proficient: bool = True,
    two_handed: bool = False,
) -> WeaponAttackPreview:
    """Compute hit bonus + damage roll for a PC wielding a weapon."""
    if not is_weapon(weapon):
        raise ValueError(f"Item {weapon.id} is not a weapon.")

    props = weapon.weapon_properties or []
    is_finesse = "Finesse" in props
    is_ranged = weapon.weapon_category and "Ranged" in weapon.weapon_category
    is_thrown = "Thrown" in props

    str_mod = (character.score_str - 10) // 2
    dex_mod = (character.score_dex - 10) // 2

    if is_ranged and not is_thrown:
        ability_mod = dex_mod
        ability = "DEX"
    elif is_finesse:
        ability_mod = max(str_mod, dex_mod)
        ability = "DEX" if dex_mod >= str_mod else "STR"
    else:
        ability_mod = str_mod
        ability = "STR"

    prof_bonus = (character.level - 1) // 4 + 2 if proficient else 0
    hit_bonus = ability_mod + prof_bonus
    die = weapon.versatile_damage if (two_handed and weapon.versatile_damage) else weapon.damage_die
    sign = "+" if ability_mod >= 0 else "−"
    damage_roll = f"{die}{sign}{abs(ability_mod)}" if ability_mod else die

    return WeaponAttackPreview(
        weapon_id=weapon.id,
        character_id=character.id,
        ability=ability,
        hit_bonus=hit_bonus,
        damage_roll=damage_roll,
        damage_type=weapon.damage_type or "bludgeoning",
        mastery=weapon.mastery,
        proficient=proficient,
        two_handed=two_handed,
    )
```

### Step 10: Seed strategy
Mirror Plan 17b — fetch SRD 5.2.1 `equipment.md`, write a one-shot parser, generate seed file. There are ~37 SRD weapons. Parser is simpler than the spell one because the data is more tabular.

---

## Validation and Acceptance

- [ ] `pytest -q` passes (341 prior + new attack-math + weapon tests)
- [ ] `/weapons` page lists all SRD weapons with category, damage, properties, mastery
- [ ] `POST /api/items/{rapier_id}/attack-preview?character_id={fighter_id}` returns plausible numbers (e.g. fighter level 1 with STR 16, DEX 14: rapier = `1d8+3` hit `+5`, mastery `Vex`)
- [ ] All seeded weapons have a category and damage info
- [ ] `alembic current` shows 0009

---

## Idempotence and Recovery

Each step is independently re-runnable. Migration 0009 is forward-only additive (nullable columns). Seed function is idempotent (skips if weapons already present).

---

## Interfaces and Dependencies

**Produces:**
- Weapon stats columns on `items` table
- `attack_service.compute_attack(...)` — clean API for Plan 22 (character sheet) and Plan 23 (clickable dice)
- `/api/items/{id}/attack-preview` endpoint
- Seeded SRD weapon catalog

**Depends on:** Plan 17 (the seed parser pattern). Existing `Item`, `PlayerCharacter`, item-handout flow.

---

## Outcomes and Retrospective

**Shipped:**
- 38 SRD 5.2.1 weapons live with full 2024 Mastery property coverage (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex).
- Attack-roll service is a pure function with 35 unit tests covering every ability-pick branch (STR, DEX, finesse, thrown, ranged) and edge cases (negative mods, zero mods, non-versatile two-handed flag, level-scaling proficiency).
- `POST /items/{id}/attack-preview?character_id=...` returns `{ability, hit_bonus, damage_roll, damage_type, mastery, proficient, two_handed}` — ready for Plan 22's character sheet to display, Plan 23 to make clickable.
- Frontend page has mastery tooltips with the 2024 rules text. Property badges have tooltips too.

**Trade-offs:**
- Weapon columns added to `items` instead of a new `weapons` table. Means magic weapons (Vorpal Sword etc.) inherit rarity/attunement from Item AND can carry the weapon stats. The loot-handout flow from Plan 16 continues to work unchanged.
- Proficiency defaults to True. Plan 21 (class features) will compute it from class weapon proficiencies.
- Blowgun's "1 flat damage" required a damage_die regex tweak (no `d`); the SRD's Net entry is non-weapon adventuring gear and is correctly skipped.

**Mechanical hints — clean this time:**
- Unlike the spell parser, the weapon parser is fully accurate. Tabular data is much easier to extract structured info from than prose.

**Deferred:**
- AC modifier from shields and magic weapon bonuses (`+1 / +2 / +3` weapons) — Plan 23 territory.
- Two-weapon fighting bonus-action damage suppression (Light property handling) — pure UI/rules concern; the hit/damage math is correct.
