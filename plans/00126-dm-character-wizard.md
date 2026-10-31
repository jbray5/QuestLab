# Plan 00126 — The guided character wizard, for DMs too, rules-complete

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-10-31
**Last updated:** 2026-10-31
**Implemented by:** Claude Code

---

## Purpose
Justin (10/31), looking at the DM's "New character" form on his phone (free-text race, a class
select, free-text subclass, hand-typed AC/HP/scores):

> I think it's important that creating a character initiates a wizard of sorts to guide you through
> creation and is specific to all rules as you make choices.

Players already had a guided builder (Plan 74). Now:
1. The DM's Add character opens the same wizard.
2. The wizard covers Ability Score Improvements and feats for starting levels 4 and up.
3. Every step says what a choice gives at the chosen level, and why a pick is locked.

---

## Progress
- [x] B1 `services/feat_rules.py`: the level-up guide's feat rules moved to a shared module
  (eligibility at a level, increase shape, sub-picks, per-level HP). `levelup_service` uses it.
- [x] B2 `CharacterBuild.asi: list[BuildAsiChoice]` (the guide's `FeatChoice` plus `level`).
  The creator validates one pick per improvement level reached, each against the build so far,
  applies them before HP/AC/saves/skills, and records feats like the guide.
- [x] B3 DM routes `GET /api/campaigns/{id}/character-builder/options` and
  `POST /api/campaigns/{id}/character-builder` (owner only; no join code; sign-up switch ignored).
- [x] B4 Options carry the feat catalog, ASI levels, class and SRD subclass features by level with
  plain-words notes, spell slots and the HP/AC bonus tables. Rules fixes on the way: half-caster
  spell levels (2nd at 5, not 7), Draconic Resilience HP and unarmored AC, Medium Armor Master and
  Defense in AC, minimum 1 HP a level, a Human's Origin feat must be one and not a repeat.
- [x] F1 One wizard component (`components/character-wizard/`), two routes through the thin page
  `pages/CharacterCreator.tsx`: `/join/:id/new` and `/campaigns/:id/characters/new` (`mode="dm"`).
  DM mode: "Who plays this character" (empty → "Not assigned yet"), "Back to characters", and on
  finish the Characters page lights the new card with "Send {name}'s player their link: Share
  player link on the card."
- [x] F2 Characters page: Add character opens the wizard; the raw form is "Enter an existing
  sheet…" in the ⋯ menu; each card has Share player link.
- [x] F3 The improvement step (one fold-out row per level, popular feats first, locked feats with
  the reason, sub-picks), explanations on every step, and a Review that shows the derived sheet.
- [x] F4 The build is kept as a per-tab draft until it is created (a remount or reload doesn't
  lose it), with "Start over".
- [x] T `tests/test_services/test_plan126_builder_asi.py`, `tests/test_api/test_plan126_dm_wizard.py`.
- [x] D ARCHITECTURE, TESTING, QUALITY (TD-126a), SECURITY, GuidePage.

---

## Decisions
- The DM path reuses the player's rules exactly; only the door differs (`_campaign_owned` vs
  `_campaign_open`).
- Feat eligibility is mirrored client-side (`rules.ts`) to explain locks; the server re-checks.
- App.tsx gets one route line: the existing lazy `CharacterCreator` with `mode="dm"`.

## Not rules-exact (TD-126a)
Class-feature choices (Fighting Style feat, Expertise, Divine/Primal Order, Invocations, Metamagic,
Lore's skills, Hunter's Prey) and the background's Magic Initiate spells are explained but picked on
the sheet. A book Epic Boon is capped at 20 like the level-up guide (the book allows 30).
