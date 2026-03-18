# Plan 00009 — Monster Compendium Expansion

## Status
[x] In progress

**Started:** 2026-03-16
**Last updated:** 2026-03-16
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

The current seed data has ~27 monsters. DMs need comprehensive coverage to build
realistic encounters. This plan expands stat_blocks.py to ~160+ monsters covering:
all 10 dragon colors × 4 age tiers (40 entries), all major fiend/undead/beast/humanoid
/giant/construct/aberration/monstrosity/fey types across all CR bands 0–24.

---

## Progress

- [x] Step 1: Write plan
- [x] Step 2: Expand integrations/dnd_rules/stat_blocks.py (28 → 130 monsters)
- [x] Step 3: Run `python -c "from integrations.dnd_rules.stat_blocks import seed_monsters"` to verify
- [x] Step 4: Quality gates pass
- [ ] Step 5: Commit & push

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-03-16 | Data source | Full JSON import vs manual | Manual SRD data | Keeps single-file, no new dependencies |
| 2026-03-16 | Coverage | All 400 SRD monsters vs curated subset | ~160 curated | Quality > quantity; covers all major encounter types |

---

## Context and Orientation

### Files touched
```
integrations/dnd_rules/stat_blocks.py  — MODIFY (add ~130 monsters)
```

### Architecture layers involved
- `integrations/` only — data layer, no logic changes

### Key terms
- **reseed**: Admin → Monsters → Reseed wipes and re-inserts from stat_blocks.py
- All data is SRD 5.1 (CC BY 4.0)

---

## Validation and Acceptance

- [ ] `python -c "from integrations.dnd_rules.stat_blocks import _SRD_MONSTERS; print(len(_SRD_MONSTERS))"` ≥ 150
- [ ] Admin → Reseed → monsters page shows dragons of multiple colors
- [ ] CR bands 0 through 24 all have at least one monster
- [ ] Quality gates pass

---

## Interfaces and Dependencies

**Produces:** ~160 monsters available in compendium after admin reseed
**Depends on:** Nothing — pure data addition
