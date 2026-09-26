# Plan 00114 — Session 8, the Summer Games and the Stampede

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-25
**Last updated:** 2026-09-25
**Implemented by:** Claude (Opus 5), from Justin's handoff doc of 2026-09-25

---

## Purpose
Session 8 runs Saturday 2026-09-26, remote, on QuestLab. Its centrepiece is a
six-round stampede through a festival crowd where **the number of townsfolk who
die is tracked and carries forward into the rest of the arc**. The players must
be able to *see* the crowd numbers change — that is the whole mechanic, and it
is the one thing Justin cannot run on paper over a remote session. This plan
builds that, then the supporting furniture (herd stat blocks and figures,
toggleable festival lights, staged prize and gift items, a contest tracker),
in strict priority order. Everything not finished by Saturday runs on paper, so
each step must ship independently.

**Rule inherited from the handoff: no lore is invented. Where the handoff is
silent, leave a placeholder marked for Justin. Anything a player can see
carries no secrets — players view source.**

---

## Progress
- [x] Step 0: Explore existing token / item / monster models (2026-09-25)
- [x] Step 1: Crowd knots — domain and service logic (2026-09-25)
- [x] Step 2: Crowd knots — DM panel on the LIVE tab (2026-09-25)
- [x] Step 3: Crowd knots — player-visible badges on the 2D table (2026-09-25)
- [x] Step 4: Herd stat blocks + corrupted animal figures (2026-09-25)
- [x] Step 5: Festival scenery — bonfire, 8 lantern poles, banners, stalls (2026-09-25)
- [x] Step 6: Immersive — crowd figures that stand, fall, and stay down (2026-09-25,
      written and gated; **not yet seen rendering**, see Surprises)
- [x] Step 7: Items — 6 game prizes, 4 queen's gifts, in the compendium (2026-09-25)
- [x] Step 8: Session 8 record + the three boards on its shelf (2026-09-25)
- [x] Step 9: Contest tracker — the Summer Games Companion at
      `campaigns/:campaignId/summergames`. **Rewritten 2026-09-26** for the
      revised handoff: five different games, not one scoreboard.
- [x] Step 14: Ser Bramwell Thistledown — stat block, card, rabbit ears (2026-09-26)
- [x] Step 15: The Summer Games Market — a player-facing shop of 14 stalls
      items (2026-09-26)
- [x] Step 10a: NPC cards for the liaison and the five rivals (2026-09-25)
- [x] Step 10b: Carried-over conditions — token `effects` and a size picker on
      the LIVE tab (2026-09-26)
- [ ] Step 11: Immersive — the five event stations as scenery (partial: caber,
      hedge maze and bout racks are in; no moths, no maze layouts)
- [ ] Step 12: Nice-to-haves (relief animation, moths, feast table, tapestry)
- [x] Step 16 (section 11a): a glowing ring under every crowd knot, brightness
      and size tracking the count, dark when the knot is empty (2026-09-26)
- [x] Step 17 (section 11a): crowd figures stop being capsules — merged
      primitive humanoids with legs, torso and arms, varied height (2026-09-26)
- [x] Step 18 (section 11b): station camera presets for all five Games, the
      chalk circle at the fountain court, maze hedges moved to the garden
      bed (2026-09-26)
- [ ] Step 19 (section 11a): **rigged, animated crowd** — idle, cheer, flee.
      Not built; the figures stand, breathe, sway and fall, nothing more.
- [ ] Step 20 (section 11b): the DM-screen station control that flies the
      camera and fades prop sets in. Presets exist; the control does not.
      Needs a new table-state column, i.e. a migration.
- [ ] Step 21 (section 11b): hedge growth between layouts, caber tumble,
      apple glow on the holder, moth swarm, crowd turning to face a station.
- [ ] **Step 13: DEPLOY. Nothing in steps 1-3 or 6 exists for the DM until the
      backend ships — an older API silently drops the crowd fields.**

---

## Surprises and Discoveries
- **The Moth Lantern's night mode needs no build.** The table already has a
  darkness slider on the LIVE tab, which is exactly the sky-and-ambient drop
  section 11b asks for. Use it, and bring it back up afterwards.
- The crowd capsules were not a rendering bug, they were a modelling choice:
  a capsule plus a ball is a lozenge at any distance. Limbs are what make a
  silhouette read as a person, and they cost nothing extra when the whole
  body is one merged geometry.
- The shop storefront is read at `GET /storefront/{id}`, not `/shops/{id}`.
- The player NPC projection (`services/player_service.py` `list_visible_npcs`)
  returns only name, role, race, appearance, location, status and portrait, so
  `voice`, `quick_who`, `secret`, `motivation` and `notes` are safe places for
  DM-only text. Verified before writing Ser Bramwell's voice note.
- The contest tracker holds the Moth Lantern's sealed bids, which must not
  reach the players. Because the companion is localStorage-only and never
  writes to the table state, that is true by construction rather than by care.
- The 3D hedge maze is static scenery; the tracker's A/B/C layout letter is a
  DM prompt, not something the board animates. Shifting hedges were not built.
- **The compendium lists magic items only.** `services/item_service.py`
  `list_items` filters `is_magic=True`, so the two mundane prizes (the cask and
  the garland) were created successfully and were then invisible to the Loot
  panel — unreachable, un-grantable, and with no error. They were re-created as
  magic. **Two inert duplicate rows are left in the items table**, invisible to
  every listing and referenced by nothing; delete them if it ever matters.
- The items list endpoint ignores `search` and `limit` and always returns
  everything; the working search parameter is `q`.
- The Candlestair picture's open ground is the **bottom terrace only**
  (v 0.86–1.0), roughly 7 cells deep by 33 wide. The great stair occupies
  v 0.73–0.87 and the shrine rotunda sits at (0.5, 0.52). The festival must fit
  the bottom terrace; it cannot sprawl. Placement below is provisional and
  Justin should move props at the table if they read wrong.
- Quaternius' CC0 animal pack has **no boar**. Deer, Stag, Wolf are there; Bull
  is the nearest four-legged charger and stands in for the boar.
- `Black-eyed Stag` already exists as a stat block (35a4560b) carrying the stag
  figure, from the previous handoff. The new handoff names it `Corrupted Stag`,
  which was created fresh (31834c6e) rather than renaming, so the old one still
  exists and should be deleted or ignored.
- **The deployed API silently drops the crowd numbers.** Tokens are validated
  against the `Token` schema on write and pydantic ignores unknown keys, so a
  knot written through the live build comes back as an ordinary token with no
  error anywhere. This is why `scripts/seed_s8_crowd.py` reads its own work back
  and exits non-zero if the numbers did not stick, and why
  `tests/test_domain/test_crowd_token.py` pins the fields to the schema.
- **No PC condition or stat-override mechanism exists**, so Mira's Large, Edrik's
  Tiny, Nya's WIS 24 and Tinkerman's music have nowhere to live. Conditions are
  only persisted on a `SessionCombatant` row, i.e. only during a fight, and the
  HUD's own condition chips are local React state that a refresh loses. The only
  real lever is a token's `size`, which is visual and only editable from the 3D
  Board page. Building an override system the night before the session was not
  worth the risk; these run on paper.
- There is **no staged/unawarded item queue** in the app, by an explicit earlier
  decision (Plan 00016). The prizes and gifts are therefore ordinary compendium
  items; the DM grants one with 💰 Loot → search → pick the PC → Give.
- **Poly Haven rate-limits.** Loading ~40 props at once made `jacaranda_tree` and
  `tree_small_02` fail with the CDN returning 200 to a later HEAD — a throttle,
  not a 404. The festival's prop count was trimmed for this reason. If the room
  comes up patchy on Saturday, reload once.
- The bottom terrace is **grass and scattered stone**, not the mosaic floor the
  top-down read suggested. The festival sits on it fine, but prop placement is a
  first pass and Justin should nudge anything that reads wrong.
- The immersive crowd could not be seen rendering: the spike route takes a MapDef
  and has no projection, and the live route reads the deployed API, which strips
  the numbers. It type-checks and lints; it is unproven on screen.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-25 | How a crowd knot stores its numbers | (a) encode in the token label, (b) new DB table, (c) optional fields on the Token model | (c) | Table state is a JSON blob, so optional Pydantic fields need no migration. A label is unclickable mid-combat; a new table is a migration the night before a session. |
| 2026-09-25 | Where the dead are counted | global `lost` counter vs per-knot `dead` | per-knot `dead`, global total computed | The immersive view needs to know *which* knot lost people to leave bodies in the right place. The global tally is then just a sum. |
| 2026-09-25 | DM interaction shape | per-token selection panel vs one list panel | one list panel | Every knot visible at once, three clicks deep at most, during a six-round timer. Far faster to build and to use. |
| 2026-09-25 | Boar figure | wait for a real boar model vs substitute | substitute Bull, tinted | Session is tomorrow. A dark four-legged charger reads correctly at table distance. |
| 2026-09-25 | Testing the crowd without a database | seed DuckDB, run the API locally, or test pure functions | pure functions + schema round-trip | The local `.env` points at an Azure host that no longer resolves, so there is no local DB. Lifting the arithmetic into `crowd_trample`/`crowd_save`/`crowd_resolve` made it testable with no fixtures and is better structure anyway. |
| 2026-09-25 | Carried-over conditions (Mira Large, Nya WIS 24) | build an override system vs leave on paper | paper | No mechanism exists at any layer; inventing one the night before a session risks the parts that do work. Flagged for Justin. |
| 2026-09-25 | Whether to deploy | push to main vs leave committed | leave committed, do not push | CLAUDE.md requires human approval for `git push`. The work is worthless undeployed, so this is the headline of the handback rather than a quiet omission. |
| 2026-09-26 | Where session-long creature states live | `SessionCombatant.conditions`, a new PC column, or the token | the token (`effects`) | The combatant row only exists while a fight runs, and the Games and the feast are not fights. The token survives the session and every map change, needs no migration, and already reaches both the 2D table and the immersive view. |
| 2026-09-26 | Contest tracker: server-persisted or DM-local | a new table and endpoints vs a companion page | companion page, localStorage | Matches the Restwater and Temple companions exactly, needs no backend, and the scores are DM-only — the handoff never asks players to see them. Ships in an afternoon rather than a day. |
| 2026-09-26 | Rewriting the tracker vs extending it | add modes to the score table vs rebuild per event | rebuild | The revision made the five events structurally different — a holder, touch pips, step pips, sealed bids, three gambled throws. A shared score grid could not express any of them. |
| 2026-09-26 | Grand Champion purse | 100 gp (original) vs 200 gp (revision) | 200 gp | Section 10 explicitly overrides section 3. |
| 2026-09-26 | The two mundane prizes | change `list_items` to show non-magic items vs mark these two magic | mark them magic | Unfiltering the compendium would drop ~150 mundane items into a panel that has only ever shown magic ones, the night before a session. Two fey-court prizes being flagged magic is defensible and reversible. |

---

## Context and Orientation

### Key terms
- **Crowd knot** — one token standing for a small group of festival-goers.
  Eight of them on the board. Starts at 4 people.
- **Trampled** — a person knocked down by the herd. Survives exactly one full
  round; if not saved, they die at the end of the next round.
- **Lost** — the running total of dead townsfolk, visible to players, saved to
  the session record. Drives a DM-only standing tier after the session.
- **Herd Beast** — homebrew stat block: AC 12, HP 11, speed 50 ft, immune to
  charm and fear, Trample (DC 12 DEX or 1d8 bludgeoning and prone), Gore
  (+4, 1d8+2).

### The trampled clock, exactly
Each knot holds four numbers: `crowd` (standing), `hurt` (trampled this round),
`dying` (trampled last round), `dead`.
- **Trample n:** move `min(n, crowd)` from `crowd` to `hurt`.
- **Save:** move one from `dying` back to `crowd`; if `dying` is empty, from `hurt`.
- **End of round:** `dead += dying`, then `dying = hurt`, then `hurt = 0`.
This gives the players a full round to reach anyone who goes down.

### Architecture layers
- `domain/table_state.py` — Token gains four optional ints. No DB change.
- `services/table_service.py` — the trample/save/resolve operations, authorized
  DM-side. **All arithmetic lives here, never in the UI.**
- `api/routers/` — one endpoint for a crowd operation.
- `frontend/src/…` LIVE tab — the DM panel.
- `frontend/src/engine/` — the immersive crowd.

---

## Concrete Steps

### Step 1: Crowd fields and service logic
**Files:** `domain/table_state.py`, `services/table_service.py`, `api/routers/table.py`
**Action:** Modify
**Details:** Add `crowd`, `hurt`, `dying`, `dead` as `Optional[int] = None` on
Token. A token with `crowd is None` is an ordinary token and behaves exactly as
today. Add to the projection a computed `lost` = sum of `dead` over all tokens.
Service functions: `crowd_trample(session, token_id, n)`, `crowd_save(session,
token_id)`, `crowd_resolve_round(session)`. Clamp at zero; never let `crowd` go
negative. One router endpoint taking `{token_id, op, n}`.
**Verify:** `pytest -q`; a unit test that trample → resolve → resolve kills
exactly one person, and that a save inside the window kills none.

### Step 2: DM panel
**File:** `frontend/src/` LIVE tab (path confirmed in Step 0)
**Action:** Create a `CrowdPanel` component
**Details:** Lists every token with `crowd != null`: name, standing count, hurt
and dying badges, buttons **Trample**, **×2**, **Save**. Above the list: the
**Lost** total and one **End round** button. Nothing computes in this component;
every button calls the endpoint from Step 1 and re-reads.
**Verify:** click through a full round on a scratch session; numbers move as
the table above says.

### Step 3: Player-visible badges
**Files:** table view token renderer; `frontend/src/engine/session.ts`, `Party.tsx`
**Action:** Modify
**Details:** A crowd token draws its standing count as a large badge and
hurt+dying as a small red one. The **Lost** total sits in a corner of both the
2D table view and the immersive view, labelled *Lost*.
**Verify:** open the player link on a second browser; numbers match the DM screen.

### Step 4: Herd stat blocks and figures
**Action:** Create via the monsters API; pack figures with the existing pipeline
**Details:** `Corrupted Deer` and `Corrupted Boar` on the Herd Beast numbers;
`Corrupted Wolf` (Dire Wolf); rename `Black-eyed Stag` → `Corrupted Stag`.
Player-visible description stays empty — the name is all a player sees. Figures:
Deer, Wolf, Bull (as boar), Stag from the Quaternius CC0 pack, coat darkened.
**Verify:** each stat block opens with a figure attached; drop one on a scratch
session and it walks.

### Step 5: Festival lights
**File:** `frontend/src/engine/candlestair.ts`
**Action:** Modify
**Details:** A bonfire at (0.5, 0.94) as the one shadow-casting light. Eight
lantern poles ringing the bottom terrace, non-shadow. Their on/off mirrors DM
light tokens. Shrine light at (0.5, 0.52), always on, not toggleable.
**Verify:** toggle a light token; the 3D lantern goes dark.

### Step 6: Immersive crowd figures
**Files:** `frontend/src/engine/` — a new `Crowd.tsx`
**Action:** Create
**Details:** For each crowd token: `crowd` standing instanced townsfolk,
`hurt + dying` fallen, `dead` fallen and still. Low-poly instanced figures, not
Daz models. **No blood for townsfolk.**
**Verify:** frame rate holds with 8 knots, 9 animals and the party on the board.

### Steps 7–12
As listed in Progress, in that order, per the handoff's own priority lists
(section 8 and section 9h). Each is independently shippable.

---

## Validation and Acceptance
- [ ] `pytest -q` — zero failures
- [ ] `black . && isort . && flake8 && interrogate -c pyproject.toml` — clean
- [ ] `pip-audit` — clean
- [ ] No Alembic migration needed (confirm table state is a JSON column)
- [ ] A scratch session runs a full six-round stampede: trample, save, resolve,
      and the Lost total climbs correctly and is visible on the player link
- [ ] The word "satyr" appears on no player-visible surface
- [ ] No Tavish content added

---

## Idempotence and Recovery
Every step is additive and independently shippable. The crowd fields default to
`None`, so a half-finished build leaves every existing session untouched. If
work stops, the Progress checkboxes are the resume point; anything unchecked
runs on paper Saturday.

---

## Interfaces and Dependencies
**Produces:** a reusable crowd-counter mechanic (any future mob scene can use it);
corrupted-animal stat blocks and figures; festival scenery on the Candlestair.
**Depends on:** the three boards already built (Plan 00113); the immersive
table (Plans 00107–00113); the Quaternius CC0 animal pack on F:.

---

## Outcomes and Retrospective
_To be filled in after Saturday._
