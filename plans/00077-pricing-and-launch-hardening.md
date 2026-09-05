# Plan 00077 — Pricing tiers and launch hardening

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Justin: "I would love to offer a link on Reddit next week… some features
gated by Patreon, and I'll let you determine pricing structure." Plan 73
built the gate (`AI_GATE=patreon`, one flat daily allowance). This plan
decides the tiers, enforces them by feature kind, and closes the launch
items that were still code-side: per-IP rate limiting and keeping non-SRD
subclass text off the public catalog.

## The pricing decision
Everything at the table is free forever: sheets, the board, projector and
3D table, dice, QR join, the character creator, map uploads, encounters,
initiative, notes, shops. AI generation is what costs money (Claude Opus
for long-form text, gpt-image-1 for art), so AI is what patrons pay for.

| Tier | Pledge | What it unlocks | Allowance |
|---|---|---|---|
| Hearth | $5 / mo | Text AI: NPCs with secrets, monster picks, briefs, runbooks, shop stock, item lore | 15 / day |
| Lantern | $12 / mo | Everything in Hearth + art (portraits, standees, backdrops, props, world maps, the player forge) + full Session Packs | 40 / day |
| Table | $25 / mo | Everything in Lantern, more of it, a seat in the Discord, name in the credits | 120 / day |

Why these numbers: a text generation costs cents; a session pack or an
image is $0.10–$1.50 each. A DM who preps once a week uses maybe 10–20
generations, so $5 covers the cheap kind and $12 covers the expensive kind
with margin. Daily (not monthly) caps keep one bad night from costing more
than the month's pledge. No free AI taste: the sample campaign already
ships AI-made content, and playtesters get `AI_FREE_EMAILS`.

## Shipped
- `services/entitlement_service.py` — `AI_TIERS` ladder (default above,
  env-overridable as `cents:name:daily:scope,…`), `check_ai(db, email,
  kind)` with kinds `text` / `art` / `pack`, tier by highest pledge met
  (legacy pledge below the floor = lowest tier), per-tier daily wall, new
  reason `tier_required` + `required_tier`, `plans()` for the UI,
  `personal_content_allowed()` for non-SRD text.
- `api/deps.py` — `AiUser` (text), `AiArtUser`, `AiPackUser`; `gate_ai_for_pc`
  takes a kind (forge = art). Art routes: battle-map backdrop/props/terrain,
  character + monster + NPC portraits and figures, shop item images, world
  map generation, the player forge. Pack route: `POST /sessions/{id}/pack`.
- `GET /auth/plans` (public) — the tier table; `/auth/me` now carries
  `tier` and `ai_daily_limit`.
- `PaywallModal` — three-column tier table from `/auth/plans`, highlights
  the tier that unlocks the blocked feature and the tier you're on; copy for
  "patron required", "higher tier required" and "allowance spent".
- Guide "AI features" lists the tiers; Welcome tile says what's free.
- `integrations/rate_limit.py` + middleware in `api/main.py` — per-IP
  minute windows: 20/min on sign-in, sign-up, waitlist and join-by-link;
  120/min on every other write; reads and SSE untouched; `RATE_LIMIT=off`
  for tests; 429 with `Retry-After` and code `rate_limited` (the client
  shows a "slow down" toast, not the paywall).
- Non-SRD subclass text (Circle of Stars, Soulknife) is listed and granted
  only to the deployment's admins (`BOOTSTRAP_ADMIN_EMAILS`) — the catalog
  route and the level-up sync both filter.
- API version 1.5.0. Tests: `test_entitlement_tiers.py`, `test_rate_limit.py`.

## Verification
- pending

## Follow-ups (Justin's side, see docs/LAUNCH.md)
- Create the Patreon page with three tiers at $5 / $12 / $25 (the app maps
  by pledge amount, so higher custom pledges land in the right tier).
- OAuth apps, `APP_SECRET`, `AUTH_MODE=oauth`, `AI_GATE=patreon`, paid
  Render instance, domain.
