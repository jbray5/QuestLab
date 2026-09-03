# Plan 00073 — Publishable QuestLab (the Reddit launch)

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-02 (overnight) · **Implemented by:** Claude Code

## Purpose
Justin's brief: "make the app as close to publishable as you can get it…
post to Reddit and let folks start using. AI features behind a Patreon
pay wall. Map licensure accounted for. Plenty of tutorial. Think as a
normal DM (in-person, digital, hybrid) — praised for usefulness and
retention above all."

The lens: a DM clicks a Reddit link. What stops them from getting value,
and what brings them back next week?

## What blocks a public link today
1. **Identity is honor-system.** The browser sends whatever email it
   likes in the trusted header — anyone can type another DM's email and
   own their campaigns. Non-negotiable to fix before strangers arrive.
2. **AI costs are uncapped** and paid by Justin.
3. **No onboarding** beyond a sidebar tour; an empty dashboard is a
   dead end for a newcomer.
4. **Licensing** isn't surfaced: users need to know what maps they may
   upload, and the shipped product must contain no third-party packs.

## Phases (tonight, in order)
- [x] P1 Accounts: Discord + Patreon OAuth, HMAC-signed session tokens
      (stdlib), `users` table (migration 0040), bearer auth in `deps`,
      `AUTH_MODE=header|oauth` (default header — Justin's prod unchanged
      until he flips it), Welcome page with provider buttons.
- [x] P2 AI paywall: `entitlement_service` (AI_GATE off|patreon, daily
      quota, allowlist), `AiUser` dependency → 402 with a Patreon link,
      player-facing AI charged to the campaign owner, a global paywall
      modal on the frontend, usage counters.
- [x] P3 Onboarding: `/guide` (first session in 15 minutes: sign in →
      campaign → players via QR → maps incl. licensing → encounter →
      run the table; in-person / digital / hybrid setups), one-click
      **starter campaign** for new DMs, map-rights notice on upload,
      tour points at the guide.
- [x] P4 Licensing + launch: `/terms`, SECURITY.md updated, `.env.example`
      + `docs/LAUNCH.md` (Discord/Patreon app setup, env, domain, backups,
      demo DB, Reddit post draft), verify shippable seeds carry no
      third-party art.

## Decision Log
| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 09-02 | Identity provider | email magic link / Discord / Patreon | Discord (identity) + Patreon (identity + membership) | every DM has Discord; Patreon login doubles as the paywall check; no email service needed |
| 09-02 | Token signing | JWT lib / itsdangerous / stdlib HMAC | stdlib HMAC | zero new packages (CLAUDE.md approval rule) |
| 09-02 | Rollout | flip now / env-gated | env-gated, default header | Justin's live campaign keeps working tonight; launch flips AUTH_MODE + AI_GATE |
| 09-02 | Quota | none / per-user daily | per-user daily (50) | offsets usage even for patrons; visible in /auth/me |
