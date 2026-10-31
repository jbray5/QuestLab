# Launch runbook — taking QuestLab public (Plan 73)

The app ships in **personal mode** by default (`AUTH_MODE=header`) —
exactly how Justin's own deployment has always run. Flipping to public mode is
a handful of environment variables plus two OAuth apps. Nothing in the code path
changes until you set them.

## 0. Lock the door: accounts on (10 minutes, no OAuth needed) — Plan 120

Personal (header) mode trusts whatever email the browser sends, and Render is
public, so on prod **anyone who types your email is you**. Do this before
anything else:

1. Deploy the Plan 120 code (it closes the signup/OAuth/dev-token takeover holes).
2. On Render → the API service → Environment, add:
   ```
   APP_SECRET=<python -c "import secrets;print(secrets.token_urlsafe(48))">
   ACCOUNT_CLAIM_CODE=<python -c "import secrets;print(secrets.token_urlsafe(16))">
   AUTH_MODE=oauth
   RATE_LIMIT=on
   ```
   Save (Render redeploys). From this moment the email header is ignored, and every
   browser that was "signed in" by email lands on `/welcome`.
3. On `/welcome` → **Create account** with **your existing email**, a password, and —
   under "Already running campaigns here under this email?" — the claim code.
   Your campaigns are there.
4. Check from a terminal: `curl -H "X-MS-CLIENT-PRINCIPAL-NAME: <your email>" https://<API_HOST>/api/campaigns` → **401**.
5. Remove `ACCOUNT_CLAIM_CODE` (or keep it only while other header-era DMs still
   need to claim theirs — give it to them privately).

Players are unaffected: `/play`, `/table`, `/join`, `/market` links keep working.
Setting `APP_SECRET` also re-keys arena seals (when `ARENA_SECRET` is unset), so a
practice fight in flight at that moment shows "Start over".
Scripts in `scripts/` that send the email header stop working against prod;
they need a bearer token (copy `ql_token` from your browser's localStorage).

Password resets have no email path yet: sign in with a verified Discord email
(once configured) or clear `users.password_hash` for the user.

## 1. Create the OAuth apps (15 minutes)

### Discord (identity — every DM has one)
1. https://discord.com/developers/applications → **New Application** → "QuestLab".
2. OAuth2 → **Redirects** → add `https://<API_HOST>/api/auth/discord/callback`
   (e.g. `https://questlab-api-9yhe.onrender.com/api/auth/discord/callback`).
3. Copy **Client ID** and **Client Secret**.

### Patreon (sign-in only)
1. https://www.patreon.com/portal/registration/register-clients → **Create client**.
2. Redirect URI: `https://<API_HOST>/api/auth/patreon/callback`. Scopes are requested
   by the app: `identity identity[email]`.
3. Copy **Client ID** and **Client Secret**.
4. Your public page URL (e.g. `https://www.patreon.com/questlab`) goes in `PATREON_URL`
   for the "Support QuestLab" link (see [PRICING.md](PRICING.md)).

## 2. Set the environment on Render (API)

```
APP_SECRET=<long random string — `python -c "import secrets;print(secrets.token_urlsafe(48))"`>   # also enables email+password accounts
AUTH_MODE=oauth                 # header identity is IGNORED from now on
OAUTH_REDIRECT_BASE=https://<API_HOST>/api
FRONTEND_ORIGIN=https://<FRONTEND_HOST>
DISCORD_CLIENT_ID=…  DISCORD_CLIENT_SECRET=…
PATREON_CLIENT_ID=…  PATREON_CLIENT_SECRET=…
PATREON_URL=https://www.patreon.com/<you>
RATE_LIMIT=on                   # per-IP throttle: 20/min auth + join (+60/min roster reads), 120/min writes
BOOTSTRAP_ADMIN_EMAILS=justinray5@outlook.com   # admins may edit the shared SRD catalog
```

**Your own account:** sign in with Discord using the same email as your campaigns
(`justinray5@outlook.com`) and everything you own is still yours — email is the
identity key. If your Discord email differs, sign in first with header mode
(`/api/auth/dev-token` mints a token for the header identity), or link accounts.

Order of operations: set `APP_SECRET` + provider vars first (deploy), sign in
with Discord while still in header mode to confirm, THEN set `AUTH_MODE=oauth`.

## Pricing
QuestLab has no generative AI (Plan 86; the code was removed in Plan 124), so there is no AI
paywall or tier ladder any more. The current proposal is in [PRICING.md](PRICING.md): players never
pay, DMs are free during the beta, and later one "Patron" tier caps storage and campaign count,
never table features.

## 3. Frontend (Vercel)
No new env needed. `/welcome` shows the provider buttons automatically once the
API reports them at `/api/auth/providers`. Remove `VITE_DM_EMAIL` if set.

## 4. Before the Reddit post
- [ ] Custom domain on Vercel + Render (the `*.vercel.app` URL screams "side project").
- [ ] Render: paid instance (no cold starts), Postgres backups on, disk for `uploads/` off (Blob is the store).
- [ ] Vercel Blob: Pro tier is on; watch the store size (`scripts/` has the orphan sweep on the tech-debt list).
- [x] Rate limits: in-app per-IP throttle (Plan 77) on sign-in/sign-up/join (20/min) and every write (120/min). Cloudflare in front is still a good idea for the raw flood case.
- [ ] The demo service (`questlab-demo`) either fixed (new free Postgres, re-point PG*, redeploy, `scripts/seed_demo_world.py`) or its links removed from `/try`.
- [ ] Support channel: a Discord server invite in the Guide footer, or an email.
- [ ] Try the full new-DM path yourself in a private window: sign in → sample campaign → QR join from a phone → stage a map → roll.
- [x] Compendium check: the character creator ships SRD 5.2.1 only. The two PHB subclasses' feature text (Circle of Stars, Soulknife) is listed and granted only to `BOOTSTRAP_ADMIN_EMAILS` (Plan 77) — everyone else sees the SRD catalog.
- [x] Shippable art check (Plan 124): the sample campaign and the demo use the code-drawn sample map; no AI art ships. Your Czepeku/Dynamic-Dungeons imports live in *your* campaign and never seed anyone else's.

## 5. The post (draft)
**Title:** I built a free table tool for in-person D&D — a DM screen and initiative tracker, with each player's sheet on their own phone. No AI. Looking for DMs to break it.

Body beats: what it is (the loop in 4 sentences) · a 30-second clip of the HUD and a
player's phone in the same fight · players never pay, DMs free in the beta, no AI anywhere
(no art, no text) · link + the Guide
· what feedback you want (retention: "would you run your next session on it?").
Subreddit rules: r/DnD and r/DMAcademy require self-promo be under 10% of your
activity and value-first; r/VTT and r/dndnext are friendlier to tools. Post the
clip, not the pitch.

## 6. What "retention" looks like in the app after launch
- `users.last_seen_at` = weekly actives (query in Admin later).
- Sessions created per DM per month is the number that matters.
