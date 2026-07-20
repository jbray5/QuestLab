# Plan 00054 — Product Readiness (public beta on a Reddit link)

## Status
[x] Not started (roadmap)  [ ] In progress  [ ] Blocked  [ ] Complete

**Created:** 2026-07-19. Owner: "I want to start thinking about making this
app an actual product... share a link on DnD reddit for people to try out."
Concerns named: AI key abuse/charges, infrastructure, security.

## The honest audit (current state)

### 1. Authentication — the #1 blocker
Identity is a **spoofable HTTP header** (`X-MS-CLIENT-PRINCIPAL-NAME`,
sent by the frontend from localStorage). The design assumed Azure Front
Door + Entra injecting a verified header; prod today is Render + Vercel
with nothing in front. Anyone who reads the network tab can impersonate
any DM with one curl. Fine for one trusted user; disqualifying for a
public link.

### 2. AI cost exposure
- Every DM-authed AI endpoint (maps, backdrops, minifigs, shop art,
  stocking, briefs) bills the owner's OpenAI/Anthropic keys — and with
  (1), "DM-authed" currently means "anyone."
- Player capability URLs trigger paid generation (hero/loadout renders)
  guarded only by a 90s per-PC cooldown (~40 images/hr/PC if a link leaks).
- No per-user metering, no quotas, no global budget cap, no kill switch.

### 3. Tenancy
- `items` and `monster_stat_blocks` list endpoints are explicitly global
  ("required but not used for filtering") — every DM sees every other
  DM's custom/AI items. Campaigns/adventures/PCs are properly scoped by
  dm_email; the catalogs are not.
- Blob-stored images are public URLs on the owner's store (acceptable
  for images; worth per-tenant pathing later).

### 4. Infrastructure/ops
- Render free-tier web service: cold starts, 512MB, `--workers 1`
  (required: the SSE event bus is in-process; scaling past one instance
  silently breaks live sync — Redis pub/sub is the documented swap).
- **No staging** — development happens against the prod DB.
- CI red since 2026-06; deploys are not gated on tests.
- No error tracking (Sentry), no uptime monitoring, no rate limiting.
- CORS allows any `https://*.vercel.app` origin (preview convenience).

### 5. Licensing (the sleeper for a public D&D product)
- Seeded content is labeled SRD 5.5e/2024 (CC-BY-4.0): needs an
  attribution page; fine otherwise. Must audit that nothing PHB-only
  crept into features/spells/stat blocks.
- Naming/marketing: can't lead with "D&D" branding; nominative use only
  ("5e-compatible"). No WotC logos/art.
- ToS + privacy policy needed (emails + player names are PII; deletion
  path exists via cascade delete now).

## Recommended path — two-stage launch

### Stage A — "Demo weekend" (shippable in ~2 days, near-zero risk)
A public **demo sandbox** to gauge Reddit interest before building auth:
- A dedicated demo campaign on a **separate demo deployment** (own Render
  service + DB + keys) — prod (The Severance) never exposed.
- AI generation disabled or capped tiny (env kill switch, already
  trivial to add); demo resets nightly from a seed script.
- Landing page: what it is, GIFs of the 3D board/market/forge, demo
  link, waitlist email box.
This gets the Reddit post live while Stage B is built.

### Stage B — real multi-tenant beta (~1-2 weeks of focused work)
1. **Real auth** (biggest single item): Clerk (or Supabase Auth) —
   free tier covers a beta; React components + JWT verified in FastAPI
   middleware. Minimal migration: keep `dm_email` as the tenant key but
   derive it from the **verified JWT**, never a client header. Local-dev
   fallback stays env-gated.
2. **AI budget system**: usage ledger table (user, action, est. cost,
   ts); per-user monthly quotas (e.g. 20 images / 50 text gens) enforced
   in the AI call paths; friendly "budget spent" errors; admin usage
   dashboard; global env kill switch. Player-triggered renders count
   against the owning DM's quota + per-PC daily caps.
   Later option: BYO API keys (encrypted per user) for power users.
3. **Catalog tenancy**: `owner_email` (nullable = global/SRD) on items +
   monsters; list = global + mine. Migration + filter, small.
4. **Ops hardening**: staging environment (second Render service + DB);
   CI green + deploy gating; Sentry on API + frontend; rate limiting
   middleware (slowapi) on auth-free routes; tighten CORS to the real
   domains; custom domain; Render paid instance (no cold starts).
5. **Licensing/legal**: SRD attribution page, content audit, ToS +
   privacy page, "not affiliated with WotC" footer.
6. **Capability-link hygiene**: regenerate-link buttons for player/table
   URLs (leaked-link recovery) + rate limits on capability endpoints.

## Cost envelope (beta, ~100 active users)
Fixed: Render paid ~$25 + Postgres (already paid) + Vercel free/pro +
Clerk free + Sentry free + domain ~$15/yr → **~$30-50/mo**.
Variable: AI, bounded by quotas — 100 users × 20 images × ~$0.07 ≈
**$140/mo worst case**, dial the quota to taste. BYO keys → ~$0.

## Decisions the owner holds
1. Stage A demo first, or straight to Stage B?
2. Auth provider preference (Clerk recommended; Supabase fine).
3. Quotas vs BYO-keys (or quotas now, BYO later).
4. Product name/domain (can't lead with "D&D").
5. Beta shape: open signup vs invite codes from the Reddit post.
