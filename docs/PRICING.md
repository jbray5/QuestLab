# Pricing (approved 2026-10-31, built in Plan 130)

Status: **approved** by Justin on 2026-10-31 ("yeah build it out") and **built** (Plan 130,
`plans/00130-pricing-patron.md`). It ships switched off: `PRICING=off` is the beta, with no
caps. QuestLab never takes payment itself. Patreon does, and QuestLab only reads the
membership. The old Patreon tier machinery (it metered AI) went with the AI code in Plan 124.

## The facts (for the landing page, the Terms and the plan page)
- **Players never pay.** The player link, the phone, the join page and the market are free for
  good. A DM never has to ask their table for money.
- **During the beta** (now, until about 50 active DMs): free for DMs, with no limits. A quiet
  "Support QuestLab" link goes to the Patreon page.
- **After the beta:**
  - **Free DM:** every table feature (the HUD, tracker, prep, players' phones, compendium,
    sessions and notebook), **2 campaigns** and **250 MB** of uploads.
  - **Patron:** **$4/month or $40/year** on Patreon. **Unlimited campaigns**, **5 GB** of uploads,
    early access to new features, and a thank-you in the credits.
- **The limits are on campaigns and storage, never on table features.**
- **Going past a limit never deletes or hides anything.** A DM over a limit keeps everything,
  and can't add a new campaign or upload until there's room.
- Uploads made before the limits existed don't count.
- Justin can give Patron to anyone ("Give Patron" in Admin). Admins have no limits.

## What is built (Plan 130)
- **Plans in one place:** `services/plan_service.py` (`FREE_CAMPAIGNS`, `FREE_UPLOAD_BYTES`,
  `PATRON_UPLOAD_BYTES`, `PATRON_MIN_CENTS = 400`, `PATRON_MIN_ANNUAL_CENTS = 4000`,
  `MEMBERSHIP_FRESH_DAYS = 40`, the display prices).
- **Who is a Patron:**
  - an admin;
  - a DM given Patron by an admin (`users.patron_comped`);
  - or a DM whose Patreon membership of `PATREON_CAMPAIGN_ID` is active, worth at least $4 a
    month (a $40/year payment counts as $4 a month; the entitled tier's own price counts too),
    and checked in the last 40 days.
  Each Patreon sign-in, "Link your Patreon" or "Check my Patreon again" renews the check.
- **Enforcement (only with `PRICING=on`):** campaign create and all three upload routes check the
  plan first. A refusal is a 402 with plain words, for example "Free DMs run two campaigns.
  Become a Patron for unlimited campaigns, or delete one you've finished."
- **The uploads ledger** (`uploads` table, migration 0060) records every upload's owner, URL,
  bytes and kind. Storage use is its sum.
- **API:** `GET /api/me/plan`, `POST /api/me/patreon/link` and `/confirm`,
  `POST /api/admin/users/{email}/comp`, and the plan shown in the admin beta overview.
- **Screens:** "Your plan" (`/plan`) has the plan, usage meters, the two plans, "Support QuestLab"
  or "Become a Patron", and "Link your Patreon". The menu has "Your plan", plus "Support
  QuestLab" when `PATREON_URL` is set. A 402 at campaign create or upload says why and links to
  `/plan`. Admin → Beta has a "Give Patron" toggle per DM.
- **Turning it on:** see `docs/deployment.md`, "Pricing and Patreon": the Patreon tier,
  `PATREON_CAMPAIGN_ID`, the OAuth redirect URI, then `PRICING=on`.

---

The approved proposal follows, unchanged.

## What DMs compare us with
- D&D Beyond Master: $5.99/month, or $4.58/month billed yearly. It shares bought books
  with a party and has no in-person table tools.
- Roll20: Plus $5.99/month, Pro $10.99/month. A VTT, which QuestLab deliberately is not.
- Trackers DMs recommend (Improved Initiative, Shieldmaiden and similar) are free, funded by
  tips or Patreon.

QuestLab sits between a free tracker and a paid VTT. It is the in-room DM screen, the tracker
and the players' phones. A price above D&D Beyond Master would stop DMs trying it.

## Recommendation
1. **Players never pay.** The player link, the phone companion, the join page and the market
   stay free forever. A DM should never have to ask their table for money.
2. **Free for DMs during the beta (now until about 50 active DMs).** No caps and no paywall,
   plus a quiet "Support QuestLab" link (Patreon, which sign-in already supports). The goal of
   this phase is DMs who love it and tell other DMs. A paywall now would slow that.
3. **After the beta, one paid tier:** "Patron", **$4/month or $40/year**, just under D&D
   Beyond Master.
   - **Free DM:** everything needed to run a table (HUD, tracker, prep, phones, compendium,
     sessions, notebook), 2 active campaigns, 250 MB of uploads.
   - **Patron:** unlimited campaigns, 5 GB of uploads (big maps, animated loops, figures), a
     thank-you in the credits, and early access to new features.
   - **The cap is on storage and campaigns, never on table features.** Uploads are the only
     cost that grows per DM (Vercel Blob), and campaign count is a simple honest line.
4. **Never sell or show ads, never train on DM content** (already in the Terms).

## What it costs to run (for scale)
- Vercel Pro $20/month plus Blob storage.
- Render: the API on Starter $7/month (recommended; free instances sleep).
- Postgres (paid tier, already upgraded).

Roughly $35–45/month before storage. Ten patrons cover it.

## If approved
- Add a "Support QuestLab" link (footer + Terms) pointing at `PATREON_URL`.
- After the beta: a small entitlement check (campaign count, upload bytes) in `services/`,
  with Patreon membership read at sign-in. This is a new plan; no AI quota code comes back.
  (Done: Plan 130, above.)
