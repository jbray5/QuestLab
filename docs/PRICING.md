# Pricing — proposal for Justin's approval (2026-10-31)

Status: **proposal**. Nothing in the app charges money today. The old Patreon tier
machinery existed only to meter AI and is being removed with the AI code (Plan 124).

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
