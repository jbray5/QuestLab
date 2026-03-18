# Plan 00010 — Multi-Map per Adventure

## Status
[x] In progress

**Started:** 2026-03-16
**Last updated:** 2026-03-16
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

Currently capped at 1 map per adventure (MVP soft limit in service layer). DMs need:
- A world map for the overland campaign
- One or more dungeon maps per location/adventure

No DB migration required — the schema already supports many-to-one (maps → adventure).

---

## Progress

- [x] Step 1: Write plan
- [ ] Step 2: Remove MAX_MAPS_PER_ADVENTURE limit in map_service.py
- [ ] Step 3: Update test that asserts the 1-map limit
- [ ] Step 4: Verify MapBuilder frontend already handles multiple maps (add map UI)
- [ ] Step 5: Quality gates + build pass
- [ ] Step 6: Commit & push

---

## Files touched
```
services/map_service.py          — remove MAX_MAPS_PER_ADVENTURE check
tests/test_services/test_map_service.py — update map-limit test
frontend/src/pages/MapBuilder.tsx — verify/improve multi-map UI
```

## No DB migration needed
The maps table already has a plain FK index on adventure_id (not UNIQUE).
