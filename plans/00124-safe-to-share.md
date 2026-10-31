# Plan 00124 — Safe to share (roadmap Phase 1)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-31
**Last updated:** 2026-10-31
**Implemented by:** Claude Code

---

## Purpose
Justin (10/31), after the roadmap: "do your phase one in your order and just keep going. You have
permission for all changes like the db one. For pricing, you suggest and I'll approve." Also: "add
the accept or reject cookies thing if we need that."

Phase 1 is everything that has to be true before Justin's party and other DMs can lean on QuestLab
without it embarrassing him:
- no known security holes;
- every page finished in Lamplit and usable on a phone (Plan 123);
- the HUD and session rough edges the review found are fixed;
- "No generative AI" is literally true in the code;
- the first visit is fast and failures are noticed;
- fresh eyes have tried it.

---

## Progress
- [x] 1a SEC-004 uploads: type from magic bytes (`services/upload_service.py`), media-only `/uploads/`, `nosniff` everywhere, sandbox CSP on uploads
- [x] 1b SEC-003 catalog ownership: `created_by_email` on items/spells (migration 0056); shared rows admin-only, homebrew author-only; lists scoped; shop items stamped
- [x] 1c SEC-002 player links (backend):
  - `play_token` + `legacy_uuid_until` (migration 0057, grace to 2026-12-01);
  - `api.deps.play_pc_id` resolves every `/play`, `/stream/pc` and duel route;
  - DM reset `POST /characters/{id}/play-link/reset`;
  - the roster gives keys;
  - 410 `link_replaced`;
  - join-code compare in constant time; roster reads throttled.
- [x] 1d SEC-005/006 backend:
  - crier webhook host check;
  - inventory notes and row-read owner check;
  - session and tracker PC ids checked against the campaign;
  - feature spend checked against the PC;
  - arena fights limited to one campaign.
- [x] 1e Player-side links: `PlayLinkGate` upgrades old UUID links and shows "This link was replaced"; JoinView/CharacterCreator use keys; tabs build links from the key; Arena/TableView compare ids via `usePlayIdentity`
- [ ] 1f DM-side links: PlayerLinkButton builds `/play/{play_token}` and offers "Reset link"; Characters' level-up link uses the key
- [ ] 1g Catalog UI: hide art/edit controls on shared rows for non-admins (`me.is_admin` or `created_by_email`)
- [x] 1h Privacy: fonts self-hosted (`frontend/src/fonts.css`, `public/fonts/`); Terms "Cookies and storage"; no cookie banner needed (no cookies, no trackers)
- [ ] 2 TD-121a: remaining pages (compendium, admin, guide, shops, puzzles, crier and notebook are done in Plan 123; Map Builder in S6; TV views + Arena DM side left)
- [ ] 3 UX-001…003: one HP control; a clear "start the fight"; session rename and undo; local dates; shorter character cards
- [ ] 4 Delete the dormant generative-AI code (backend, frontend, tests, docs, env)
- [ ] 5 First impressions: bundle split (the 3D engine out of the first load), Render plan check, error alerts
- [ ] 6 Persona field test wave on the new UI
- [ ] 7 Pricing recommendation for Justin to approve
- [ ] 8 Docs, gates, commits; Justin approves the push (not on a game night)

---

## Surprises and Discoveries
- 10/31: the upload extension came from the client's filename, so `evil.html` sent as `image/png` was stored and served as HTML.
- 10/31: the crier's webhook check was a substring test (`https://x/?discord.com/api/webhooks/` passed), and updates weren't checked at all.
- 10/31: the arena hot-seat fight had no same-campaign check, so any known PC UUID pulled that sheet's real numbers in.
- 10/31: `/stream/campaign/{id}` is unauthenticated. Once UUIDs stop being keys, what it leaks is low value; left open in SEC-005.
- 10/31: buying from a hidden shop is by design. The direct link is how the DM reveals it.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-31 | Old player links | break now / keep forever / grace period | grace to 2026-12-01, auto-upgrade on open | Players' saved links keep working while phones move to tokens; a reset ends the grace for that PC |
| 10-31 | Join roster and keys | hide claimed PCs / give keys behind the join code | keys behind the join code | The join page is how Justin's players open sheets each week; the reset dialog tells the DM to change the join code too |
| 10-31 | Catalog visibility | everyone sees all / shared + own | shared + own | Another table's plot items shouldn't appear in your pickers |
| 10-31 | Cookie banner | add one / none | none, plus a Terms section and self-hosted fonts | No cookies or trackers; local storage is strictly necessary; Google Fonts was the only third-party request |

---

## Context and Orientation
Backend: `services/upload_service.py` (new), `services/player_service.py`, `services/character_service.py`,
`services/auth_service.py`, `services/item_service.py`, `services/spell_service.py`,
`services/encounter_service.py`, `services/shop_service.py`, `services/crier_service.py`,
`services/inventory_service.py`, `services/session_service.py`, `services/arena_service.py`,
`api/deps.py`, `api/main.py`, `api/routers/{play,duels,stream,characters,items,spells,monsters,uploads,inventory}.py`,
`integrations/rate_limit.py`, `domain/{character,item,spell,character_builder}.py`,
`db/repos/{character,item,spell}_repo.py`, `db/base.py`, migrations 0056 and 0057.
Frontend: `components/PlayLinkGate.tsx`, `hooks/usePlayIdentity.ts`, `api/play.ts`, `App.tsx`,
`pages/{JoinView,CharacterCreator,TableView,Arena,TermsPage}.tsx`, `pages/player/*`, `fonts.css`.
Tests: `tests/test_api/test_sec00{2,3,4}_*.py`, `tests/test_services/test_sec005_hardening.py`,
and `conftest.uuid_play_links` for older suites that address players by UUID.

---

## Validation and Acceptance
- [x] `pytest -q` green (1078 + the new security suites)
- [x] An old UUID link opens and moves to `/play/{token}`; a reset UUID link shows "This link was replaced" with the join page; an old token after a reset is refused
- [ ] The DM's link button copies the token link; "Reset link" works from the sheet
- [ ] No page request reaches a third-party host (fonts verified on /terms and /try)
- [ ] `npm run build` passes; lint shows no new errors

---

## Idempotence and Recovery
Migration 0056 adds nullable columns. Migration 0057 adds two columns and backfills tokens; its downgrade
drops them, and links go back to UUIDs. The grace date lives in the data (per PC), not in code, so it can
be extended with one UPDATE if players need longer.

---

## Interfaces and Dependencies
**Produces:**
- `GET /play/{key}/link`;
- `POST /characters/{id}/play-link/reset`;
- `BuildResult.play_key`;
- the roster's `key`;
- `PlayerCharacterRead.play_token` (DM only);
- `ItemRead`/`SpellRead.created_by_email`.

**Depends on:** Plan 120 accounts (admin = `BOOTSTRAP_ADMIN_EMAILS`), Plan 122 player phone.

---

## Outcomes and Retrospective
_Fill in after completion._
