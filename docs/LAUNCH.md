# Launch runbook — taking QuestLab public (Plan 73)

The app ships in **personal mode** by default (`AUTH_MODE=header`, `AI_GATE=off`) —
exactly how Justin's own deployment has always run. Flipping to public mode is
a handful of environment variables plus two OAuth apps. Nothing in the code path
changes until you set them.

## 0. Turn on accounts today (2 minutes, no OAuth needed)

Set **`APP_SECRET`** on Render (any long random string) and redeploy. That alone
enables the **Create account / Sign in** card on `/welcome` — name, email and
password (scrypt-hashed, stdlib). It works in personal mode too: your own
identity keeps working, and a new DM who signs up owns only what they create.
Password resets have no email path yet: a user who forgets can sign in with
Discord using the same email (once configured) or ask you to clear
`users.password_hash` for them. Rate-limit `/api/auth/login` at the edge.

## 1. Create the OAuth apps (15 minutes)

### Discord (identity — every DM has one)
1. https://discord.com/developers/applications → **New Application** → "QuestLab".
2. OAuth2 → **Redirects** → add `https://<API_HOST>/api/auth/discord/callback`
   (e.g. `https://questlab-api-9yhe.onrender.com/api/auth/discord/callback`).
3. Copy **Client ID** and **Client Secret**.

### Patreon (identity + membership = the AI paywall)
1. https://www.patreon.com/portal/registration/register-clients → **Create client**.
2. Redirect URI: `https://<API_HOST>/api/auth/patreon/callback`. Scopes are requested
   by the app: `identity identity[email] identity.memberships`.
3. Copy **Client ID**, **Client Secret**, and your **campaign id** (the number in
   `https://www.patreon.com/api/oauth2/v2/campaigns` while signed in, or from the
   creator dashboard URL).
4. Your public page URL (e.g. `https://www.patreon.com/questlab`) is what the
   paywall modal links to.

## 2. Set the environment on Render (API)

```
APP_SECRET=<long random string — `python -c "import secrets;print(secrets.token_urlsafe(48))"`>   # also enables email+password accounts
AUTH_MODE=oauth                 # header identity is IGNORED from now on
OAUTH_REDIRECT_BASE=https://<API_HOST>/api
FRONTEND_ORIGIN=https://<FRONTEND_HOST>
DISCORD_CLIENT_ID=…  DISCORD_CLIENT_SECRET=…
PATREON_CLIENT_ID=…  PATREON_CLIENT_SECRET=…  PATREON_CAMPAIGN_ID=…
PATREON_URL=https://www.patreon.com/<you>
AI_GATE=patreon                 # off = everyone; patreon = patrons/admins/allowlist
AI_DAILY_LIMIT=50               # per user per UTC day while AI_GATE=off; 0 = unlimited
AI_TIERS=                       # leave unset for the default ladder (see Pricing below)
RATE_LIMIT=on                   # per-IP throttle: 20/min auth + join, 120/min writes
AI_FREE_EMAILS=friend@x.com     # playtesters who get AI without Patreon
BOOTSTRAP_ADMIN_EMAILS=justinray5@outlook.com   # admins always get AI
```

**Your own account:** sign in with Discord using the same email as your campaigns
(`justinray5@outlook.com`) and everything you own is still yours — email is the
identity key. If your Discord email differs, sign in first with header mode
(`/api/auth/dev-token` mints a token for the header identity), or link accounts.

Order of operations: set `APP_SECRET` + provider vars first (deploy), sign in
with Discord while still in header mode to confirm, THEN set `AUTH_MODE=oauth`.

## Pricing (decided 2026-09-05, Plan 77)

Everything at the table is free forever. AI is what patrons pay for, and the
app enforces it by *kind*: text, art, pack.

| Patreon tier | Pledge | Unlocks | Allowance |
|---|---|---|---|
| **Hearth** | $5 / month | Text AI — NPCs with secrets, monster picks, briefs, runbooks, shop stock, item lore | 15 / day |
| **Lantern** | $12 / month | Hearth + art (portraits, standees, backdrops, props, world maps, the players' forge) + full Session Packs | 40 / day |
| **Table** | $25 / month | Lantern with 120 / day, a seat in the Discord, name in the credits | 120 / day |

**Set up the Patreon page with exactly these three tiers at $5, $12 and $25.**
The app reads the pledge amount from Patreon (`patron_tier_cents`) and maps
it to the highest tier whose minimum the pledge meets, so custom higher
pledges land correctly and you never have to paste tier ids anywhere. To
change the ladder later, set `AI_TIERS=cents:name:daily:scope,…` (scope is
`text` or `all`) and update the Guide copy to match. Admins and
`AI_FREE_EMAILS` bypass tiers and allowances. `GET /api/auth/plans` shows the
live table the paywall renders.

Cost basis: a text generation is cents; a session pack or an image is
$0.10–$1.50. Daily caps mean one heavy night can't exceed the month's pledge.

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
- [ ] Shippable art check: the sample campaign and demo use AI-generated maps only. Your Czepeku/Dynamic-Dungeons imports live in *your* campaign and never seed anyone else's.

## 5. The post (draft)
**Title:** I built a free table tool for in-person and hybrid D&D — living sheets on phones, a shared board on the TV, dice you shake. Looking for DMs to break it.

Body beats: what it is (the loop in 4 sentences) · a 30-second clip of shake-to-roll
landing on the projector · "free forever" for sheets/table/board; AI portraits, maps
and session packs are patron-only because they cost real money · link + the Guide
· what feedback you want (retention: "would you run your next session on it?").
Subreddit rules: r/DnD and r/DMAcademy require self-promo be under 10% of your
activity and value-first; r/VTT and r/dndnext are friendlier to tools. Post the
clip, not the pitch.

## 6. What "retention" looks like in the app after launch
- `/auth/me` shows AI allowance per user; `ai_usage` table = cost per DM per day.
- `users.last_seen_at` = weekly actives (query in Admin later).
- Sessions created per DM per month is the number that matters.
