# Plan 00130 — Pricing: free for players, free DM, Patron ($4/month)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-10-31
**Last updated:** 2026-10-31
**Implemented by:** Claude Code

---

## Purpose
Justin approved the pricing proposal (docs/PRICING.md) on 10/31: "yeah build it out".

**Players never pay.** The player link, phone, join page and market stay free forever.

**During the beta** (`PRICING=off`, the default):
- no caps;
- a quiet "Support QuestLab" link to the Patreon page.

**After the beta** (`PRICING=on`):
- **Free DM:** every table feature, 2 campaigns and 250 MB of uploads.
- **Patron** ($4/month or $40/year on Patreon): unlimited campaigns, 5 GB of uploads, a thank-you
  and early access.

The cap is on storage and campaign count, never on table features. Admins are exempt. Justin can
give Patron to anyone (comp).

---

## Progress
- [x] Migration 0060 (`alembic/versions/0060_pricing.py`; DuckDB parity in `db/base.py`):
  - `users.patron_comped`;
  - an `uploads` ledger (owner, URL, bytes, kind, created), which also feeds the future orphan
    sweep.
- [x] `services/plan_service.py`: the plan, usage and limits, and the checks used by campaign
  create and every upload route. Both raise a plan-limit error that becomes a 402 with plain
  words.
- [x] Patreon membership:
  - "Link Patreon" for a signed-in DM (OAuth, scope `identity identity.memberships`, state bound
    to the signed-in user);
  - membership read for `PATREON_CAMPAIGN_ID`;
  - refreshed on every Patreon sign-in or link.
- [x] API:
  - `GET /api/me/plan`;
  - `POST /api/me/patreon/link` (and `POST /api/me/patreon/confirm`, see the Decision Log);
  - admin comp toggle;
  - plan shown in the admin beta overview.
- [x] Frontend:
  - a "Your plan" page (plan, usage meters, Support or Become a Patron, Link Patreon);
  - menu entries;
  - 402 handling at campaign create and upload;
  - a "Give Patron" toggle in Admin.
- [x] Landing and Terms pricing copy, written with Plan 129: a "What it costs" section on `/try`, Terms §Prices, and Guide §"What it costs".
- [x] Tests, docs, gates: 47 new tests (`tests/test_services/test_plan130_plans.py`,
  `tests/test_api/test_plan130_pricing.py`). Full suite 1,198 passed. black, isort, flake8 clean;
  interrogate 84.9%; pip-audit clean; tsc, eslint (touched files) and `npm run build` clean.
  Docs: PRICING, deployment, SECURITY, data_dictionary, QUALITY, TESTING, ARCHITECTURE, README.
- [x] Coordinator ask: `/campaigns?new=1` opens the New campaign form (the dashboard's "Start your
  first campaign" links there since Plan 129).

---

## Surprises and Discoveries
- **How Patreon reports annual members.** Its docs don't say whether
  `currently_entitled_amount_cents` is per month or per payment. Patreon's own WordPress plugin
  divides by `pledge_cadence`, so it is per payment: $40/year shows as 4000. The plugin also
  requests `include=memberships.currently_entitled_tiers,memberships.campaign` on the identity
  call, so the tier's own monthly price (in the campaign's currency) is available too.
- **Amounts are in the patron's currency.** A UK patron on the $4 tier may show 320 pence. The
  tier price is in the campaign's currency, so the check uses the larger of the two.
- Without `identity.memberships`, Patreon still returns the membership to the client owner's
  own campaign. Sign-in keeps its old scope (`identity identity[email]`, so the consent screen
  doesn't change) and still refreshes the membership.
- **The campaign create router maps `ValueError` to 422**, and it isn't a Plan 130 file. So
  `PlanLimitError` is deliberately not a `ValueError`, and `api/main.py` has one app-wide
  handler that answers it with a 402 from any route.
- **The admin beta overview's row type (`BetaDm`) lives in `domain/beta.py`**, which isn't a
  Plan 130 file. `domain/plan.py` subclasses it as `BetaDmPlan` and `BetaPlanOverview`.
- `render.yaml` must quote `"off"`: unquoted, YAML 1.1 reads it as the boolean false.

---

## Decision Log
- **Patreon handles payment; QuestLab only reads the membership.** No payment code and no new
  package (httpx is already a dependency).
- **The caps ship switched off.** `PRICING=on` turns them on when the beta ends (around 50 active
  DMs), with no code change.
- **A membership counts for 40 days after it was last checked.** Each Patreon sign-in or "Link
  Patreon" refreshes it. Patreon user tokens expire, so there's no background polling.
- **Over the cap never deletes or hides anything.** It only refuses a new campaign or upload.
- **Linking is two steps, so it is safe against account takeover.**
  1. The callback reads Patreon but attaches nothing. It hands `/plan` a signed result for the
     DM named in the state.
  2. The plan page confirms it with its own session (`POST /api/me/patreon/confirm`). A link
     someone else started fails there with a 403.
  Without step 2, an attacker could trick a victim into finishing the attacker's link. That
  would put the victim's Patreon on the attacker's account, so a later Patreon sign-in would
  open the attacker's account for the victim. Linking never issues a session token.
- **Annual counts at QuestLab's own price.** A yearly payment of $40 counts as $4 a month
  (`PATRON_MIN_ANNUAL_CENTS = 4000`). The entitled tier's price also counts, and the larger
  of the two is stored in `patron_tier_cents`, so the rule stays "tier cents ≥ 400".
- **"Unlimited" means unlimited.** Patrons and admins skip the old 20-campaign soft limit; free
  DMs keep it.
- **Admins have no caps at all.** Comped and Patreon Patrons get 5 GB.
- **The plan page shows the DM's plan limits even during the beta**, labelled "after the beta".
  `pricing_on` says whether they're enforced.
- **The 402 body is structured** (`{code: "plan_limit", limit, message}`), like the existing
  `rate_limited` and `link_replaced` details. `errors.ts` reads it, and `isPlanLimitError` lets a
  screen add "See your plan".
- **`patron_checked_at` is stored as naive UTC.** The 0040 column has no time zone, and DuckDB
  shifts aware values to local time.

---

## Context and Orientation
- Patreon sign-in (identity only): `integrations/oauth.py`.
- Former membership columns: `domain/user.py` `patron_active`, `patron_tier_cents`,
  `patron_checked_at` (left from Plan 77).
- `PATREON_URL` is already returned by `GET /api/auth/providers`.

---

## Validation and Acceptance
- With `PRICING=off`: no caps, and the plan page says "Free during the beta".
- With `PRICING=on`:
  - a free DM's third campaign and an upload past 250 MB get a 402;
  - Patron, comped and admin accounts don't;
  - a lapsed membership (over 40 days unchecked) counts as free.
- Linking can't attach a Patreon account to anyone but the signed-in DM, or one already linked
  elsewhere.

---

## Idempotence and Recovery
- Additive migration only.
- Uploads made before the ledger existed aren't counted. Everyone starts at 0, which errs in the
  DM's favour.

---

## Interfaces and Dependencies
- New env vars:
  - `PRICING` (off|on, default off);
  - `PATREON_CAMPAIGN_ID`.
- New routes as above.
- No new packages.

---

## Outcomes and Retrospective
Built on 2026-10-31, and it ships switched off (`PRICING=off`). What's left:
- **TD-130a:** storage use only grows, because replacing or deleting a picture doesn't lower it.
  Fix with the orphan sweep before `PRICING=on`.
- **TD-130b:** "Give Patron" bumps the DM's "Last seen".
- **TD-130c:** the map, figure and notebook upload screens show the 402 message without the
  `/plan` link.
- **TD-130d:** `domain/__init__.py` and `alembic/env.py` don't import `domain.upload`.
- The legacy Streamlit `pages/campaigns.py` doesn't catch `PlanLimitError`; it only matters
  with `PRICING=on`.
- Not yet tested against a live Patreon account. The membership parser follows the documented
  JSON:API shape and Patreon's own plugin, and the fixtures cover it. Check one real annual and
  one monthly member once the tier exists.
- Landing, Terms and Guide copy: done with Plan 129.
- TD-130b (Last seen) and TD-130d (model registration) were fixed during integration.
