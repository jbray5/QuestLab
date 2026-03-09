# Plan 00002 — Stage 10: Visual Polish & React Migration Prep

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-03-08
**Last updated:** 2026-03-08
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

Complete Stage 10 of the QuestLab build plan:
- 10.1 CSS: Add dice-roll animation + parchment card class to existing theme
- 10.2 Component library: `pages/_components/` — stat_block_card, character_mini_card,
  dice_roller, loot_card — Python helpers that emit styled HTML via st.markdown
- 10.3 React migration doc: `docs/react_migration.md` — route map, FastAPI endpoint
  design, Zustand + shadcn/ui recommendations
- 10.4 Admin page: Full `pages/admin.py` — user list, monster reseed, JSON export,
  all behind `require_admin()`
- Tests: `tests/test_services/test_auth_service.py`

---

## Checklist

- [ ] 10.1 — CSS enhancements (dice spin animation, parchment card class)
- [ ] 10.2 — `pages/_components/__init__.py`
- [ ] 10.2 — `pages/_components/stat_block_card.py`
- [ ] 10.2 — `pages/_components/character_mini_card.py`
- [ ] 10.2 — `pages/_components/dice_roller.py`
- [ ] 10.2 — `pages/_components/loot_card.py`
- [ ] 10.3 — `docs/react_migration.md`
- [ ] 10.4 — `pages/admin.py` (full implementation)
- [ ] Tests — `tests/test_services/test_auth_service.py`
- [ ] Quality gates — all pass, plan updated, MEMORY.md updated

---

## Architecture Notes

- Components are pure Python functions returning None (call st.markdown internally)
- No new services needed — admin page uses auth_service, campaign_service, monster seeding
- Monster reseed calls the existing seed function from `integrations/dnd_rules/stat_blocks.py`
- Export is admin-only, enforced via `require_admin()` in service layer
- All component files must have >=80% docstring coverage
