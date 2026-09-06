# Plan 00083 — The P1 list from the six-DM field test, plus packs at $5

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-05)

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Justin: "Keep working the P1 list and whatever else was surfaced through the
investigation" and "I'm good with packs being in the $5 tier." This plan is
everything in [docs/research/persona-field-test-2026-09.md](../docs/research/persona-field-test-2026-09.md)
below the P0 line that fits one push, plus the one pricing change the test
argued for.

## Shipped

### Pricing
- **Session Packs move to Hearth ($5).** `Tier.allows` treats `pack` like
  `text`; Lantern is the art tier. Blurbs, the paywall modal, the guide and
  LAUNCH.md say so. Daily caps unchanged (15 / 40 / 120).

### "Run tonight"
- The sample campaign seeds **two NPCs with lines** (Aldous Fenwright, Tansy
  Quill) and a **three-scene runbook** with read-aloud text, DM notes, an
  encounter flow and closing hooks. Session title is "The Millpond Bells"
  (no doubled "Session 1").
- The dashboard button reads **🎲 Run the sample night** and lands in the
  HUD with 🎬 Script open. A second press finds the existing sample (200
  with its ids) instead of a 409.
- A sample built before this plan is upgraded in place on the next press:
  the NPCs and runbook are added if missing and the doubled title fixed;
  nothing the DM changed is touched.

### Remote-player window
- The public projection now carries `combat_running`, `round` and an
  `initiative` list while a fight runs: name, whose turn, defeated,
  conditions, and **HP for the party only**. Foe HP never crosses.
- `/table/:sessionId?pc=<id>` shows a side panel (initiative, party HP bars,
  roll log) and makes the player's **own token draggable**; the server
  (`POST /play/{pc}/table/move`) refuses any other token or another
  campaign's table. `?panel=1` opens the panel for anyone.
- The phone's sheet gains a **🗺 Table** link (`GET /play/{pc}/live-session`
  picks the newest in-progress session).
- The **last roll stays on screen** as a bottom-left chip until the next one.

### Join codes
- `campaigns.join_code` (migration 0043). Characters page: "Join code" field.
  When set, the join page, the creator's options and character creation all
  require `?code=` (403 `join_code_required` otherwise); the join page asks
  for it and remembers it per campaign for the creator.

### NPC record as source of truth
- Table-face cards fall back to role / motivation / personality / secret
  when the table face is empty; a **hidden** badge shows until revealed.
- The brief prompt injects the campaign's NPC records as canon ("never
  contradict a secret or motive"; "PCs are not NPCs"). NPC generation passes
  every PC and NPC name as taken.

### Rules depth
- A PATCHed level, class or subclass grants the features the PC now
  qualifies for (`feature_service.sync_for_level`), so a level isn't a hollow
  number.
- Long rest clears temp HP, death saves and concentration.
- Channel Divinity: 2 / 3 at 6 / 4 at 18 (`UsesFormula.CHANNEL_DIVINITY`);
  the catalog seeder now syncs formulas on existing rows.
- Species skill bonus is exactly one pick; only that one may sit off the
  class list; Elf's Keen Senses is restricted to Insight / Perception /
  Survival (server and creator).
- SRD armor and the shield are catalog items (`srd_armor_2024.py`,
  per-name idempotent seed), so starting kits land in the bag.
- `combat_state` is typed: `setup`/`active`/`started`/`over` map to real
  states; anything else is a 422.

### Navigation and polish
- Pasting `/campaigns/<id>/…` selects that campaign in the sidebar.
- `/campaigns/<id>/encounters` resolves (one arc → redirect; several → pick).
- Arc tier is inferred from the party's average level when omitted.
- Class placeholder avatars (⚔️ 🧙 🗡️ …) on the sheet, phone, join page and HUD.
- **+ Party** lands inside the first revealed region when fog is on.
- A board click drops focus from the notes so hotkeys work.
- "Map saved" toast in the map editor.
- Tour rewritten: eight steps, first one is the sample night, each spotlight
  targets a real element (sample button, sidebar, Campaigns, Characters,
  dice tray) or renders centered.
- **Export**: `GET /campaigns/{id}/export` → one JSON bundle (campaign,
  characters, NPCs, arcs with encounters and sessions with runbooks, battle
  maps, notebooks with pages, shops with stock, puzzles). Button on the
  campaign card. Import is a follow-up.

## Verification
- Gate: black / isort / flake8 / interrogate (92.8%); pytest 830 passed (new:
  `tests/test_api/test_plan83_p1.py`, `tests/test_services/test_plan83_rules.py`,
  an onboarding upgrade test); pip-audit clean; tsc, eslint on touched files,
  vite build. CI green on aedc5a2.
- Prod (API 1.6.0, aedc5a2), driven through the real routes on a throwaway
  campaign, then deleted (204): Hearth's plan blurb names Session Packs; the
  sample button returns 200 with the same session twice; an arc posted
  without a tier came back Tier2 for a level-7 party; join code "reed-7"
  stored as REED7, join page 403 `join_code_required` without it and 200
  with `?code=reed7`, options 403 too; roster rows carry `character_class`;
  combat_state "active" landed as running and "brawling" was a 422; the
  public projection listed Creed 40/58 and Wolf with no HP and `prone`;
  the player's move landed at (300, 240) and the foe stayed put;
  live-session resolved to the session; export returned the bundle as an
  attachment and a stranger got 403; long rest cleared temp HP, a death
  save and concentration; a Fighter built through the join creator got
  chain mail, longsword and shield with no "not in the catalog" warning.
  The Vercel bundle carries "Run the sample night" and the TableView chunk
  carries the remote panel.

## Not in this plan
Campaign import; a first-class session log; level PATCH recomputing HP;
2024 (SRD 5.2.1) monster blocks; the Practice Arena (Plan 84).
