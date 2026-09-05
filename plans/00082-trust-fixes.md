# Plan 00082 — Trust at the table: the P0 list from the six-DM field test

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (v1, live-verified 2026-09-05)

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Justin, after reading the field test: "I think we start addressing critical
issues then reevaluate the pricing model if AI just isn't selling." The
P0 list from [docs/research/persona-field-test-2026-09.md](../docs/research/persona-field-test-2026-09.md):
the things six constructed DMs hit that made them say "maybe" instead of
"yes".

## Shipped
- **Campaign delete cascades everything** (6/6 hit the 500). Sessions'
  beats, combatants, table state and briefs via a shared
  `session_service.cascade_session_children`; then encounters, loot
  tables, maps; then battle maps, NPCs, notebooks (pages first), crier
  posts/NPCs/channels (new `CrierPostRepo.delete_for_campaign`), shops
  (items first), puzzles, characters; then the campaign. API tests drive
  the real routes with a running fight, a staged table, a map and an NPC.
- **Conditions reach every screen.** `update_combatant` now publishes
  `table.updated` too, so a condition or HP change from the initiative
  strip re-pulls the TV and the remote link, not just the HUD and phone.
- **HP taps never drop.** `HpEditor` accumulates rapid −/+ locally and
  saves once 320 ms after the last tap.
- **Foes land first time.** `addFoesFromCombat` reads the live roster
  from the server before placing tokens (the HUD's own combat query was
  stale in the board's cache).
- **Short screens.** `useIsCompactHeight(900)`: strip collapsed by
  default, notes 140 px, quick-rules bar hidden; the live board keeps a
  280 px minimum.
- **QR retires** when a map is staged from the HUD.
- **Grid guessed on upload** from the image (70/100/96/140… divisors with
  a plausible cell count); 3D table defaults to a square grid on gridded
  maps.
- **Creator says why.** `nextHint()` beside a disabled Next; "N of M
  picked"; background-granted skills labelled; the ability-bonus block
  scrolls into view; Human origin feat marked required; the standard array
  is laid out for the class's primary abilities.
- **Session Pack hygiene.** Catalog monsters only (no custom reskins and
  their art from other campaigns); the antagonist must be in `npcs`;
  names only (no "(absent)"); explicit DM constraints outrank defaults;
  `Round N:` prefixes stripped.
- **Scrub.** Owner-world placeholders gone from the NPC editor, the
  session premise and the arcs page; guide sign-in copy true in both
  modes; sidebar reads "Table tool for D&D 5e"; walkthrough posters are
  real frames.

## Verification
- Gate: black/isort/flake8/interrogate clean; pytest 812 passed (two new API
  tests: a campaign with a running fight, staged table, map and NPC deletes
  in one call; a session with active combat deletes on its own); tsc,
  eslint, build clean.
- Prod (06ed442): a throwaway campaign with a running combat and a staged
  table returned 500 on delete until the deploy landed, then 204. A strip
  condition on a showcase foe appears in the public table projection within
  a second and clears again. HUD at 1366×768: board 278 px (was ~40), strip
  collapsed, rules bar hidden, notes 140 px. Staging a map from the HUD
  turns the join QR off. The creator shows "Give your character a name."
  beside the disabled Next. Sidebar reads "Table tool for D&D 5e".

## Not in this plan (P1 from the field test)
"Run tonight" page for the sample campaign; remote-player window (roll
log, initiative, HP, move-your-own-token); NPC record as source of truth;
join code per campaign; tour rewrite; class placeholder avatars; export.
