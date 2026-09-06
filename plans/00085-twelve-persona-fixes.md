# Plan 00085 — Fixes from the twelve-persona field test (run 2)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Run 2 of the field test (six returning DMs plus a new player, an online-only
DM, a library teen-club DM, a West Marches organizer, a streamer and a
low-vision DM; reports in [docs/research/personas/](../docs/research/personas/))
produced a new defect list. This plan is the part that fits one push.

## Shipped
- **The DM brief treats NPC records as canon** (Hal, Rosa, Tom): the canon
  block from Plan 83 had landed in the runbook prompt only; the brief now
  gets it too, with a rule that `secret_short` shortens the stored secret.
- **Sample pregens are built through the character builder** (Adaeze, Nina,
  Jess, Marcus): gear, spells, features and the same math as a player build.
- **Fog hides foes on player-facing canvases** (Bea, Marcus): tokens under
  unrevealed fog aren't drawn on the projector or remote windows; the party
  always is.
- **Rolls everywhere** (Theo, Priya, Bea, Nina): a per-session ring buffer of
  the last twenty rolls rides on the projection so a refreshed or late window
  has a log; the DM's table roll reaches the projector and remote windows; a
  player's phone roll reaches the DM as a HUD toast and the other phones'
  roll feed; the last-roll chip moved bottom-right, out of the QR's way; the
  dice caption gets a plate so it reads on bright maps.
- **A dead table link is a 404** with a clear message (Theo, Hal, Adaeze,
  Dev, Priya, Tom).
- **HP changes reach the table from every path**: the party card's taps
  publish a table update (Priya); rapid taps accumulate through a ref so
  three in one tick are three (Jess); long rest syncs the fight tracker
  (Dev).
- **Rules**: Paladins and Rangers cast from level 1 (Nina, Dev); Second Wind
  and Rage scale with level (Dev); the roster cap is 30 (Hal, Dev).
- **Arena**: Lay on Hands is a bonus action; heals at full HP are refused;
  Magic Missile is three darts; foes take one action per turn (the best one,
  Multiattack honoured); Rage halves only weapon damage; Extra Attack at 5
  for martial classes; the state is HMAC-sealed so a forged fight is refused
  (Dev); foe list tiers (easy / fits / above your level); greyed buttons say
  why inline (Nina).
- **Phone**: when it isn't your turn, the sheet says whose turn it is (Nina).
- **Join-built characters attend the newest open session** automatically
  (Jess).
- **Creator**: picking a class lays out the standard array for it (Nina,
  Jess).
- **Contrast**: `--muted` from 4.3:1 to 6.5:1 (Sam); **E** ends the turn in
  the HUD (Sam, Marcus); Admin nav only for admins (Jess); DM 3D board defaults
  to a square grid (Marcus); guide videos keep their poster; senses read
  "Passive Perception 9" (Jess); listing characters of a deleted campaign is
  a 404 (Marcus); join-code input wide enough; join button visible.

## Verification
- Gate: pytest 845 passed (new arena tests: tamper refusal, Extra Attack,
  one-action foes); black / isort / flake8 / interrogate; tsc, eslint on
  touched files, vite build.
- Prod: see the commit that flips this plan to Complete.

## Not in this plan
The no-generative-AI pivot (Plan 86); the class-and-feature review of the
Arena through level 5 (Plan 87); campaign import; a session log; the Forge
off-switch (moot under Plan 86); encounter meter for attending PCs only;
co-DM access; claim-your-sheet PIN.
