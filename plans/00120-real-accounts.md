# Plan 00120 — Real accounts: close the "type any email" door

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-30
**Last updated:** 2026-10-30
**Implemented by:** Claude Code

---

## Purpose
Review item 4 found prod trusts `X-MS-CLIENT-PRINCIPAL-NAME` from anyone (no Azure Front Door; Render
is public): typing a DM's email on /welcome is being that DM, and Justin's email is in 12 files of
the public repo. Justin (10/30): "Real accounts now". Plan 73 already built signed sessions, password
accounts and Discord/Patreon sign-in behind `APP_SECRET` + `AUTH_MODE=oauth`; three latent takeover
bugs (audit) must close before turning them on. After this, with Render set to
`APP_SECRET` + `AUTH_MODE=oauth` + a one-time `ACCOUNT_CLAIM_CODE`, only a password/session token
proves who a DM is; Justin claims his existing campaigns once with the claim code. Player capability
links are unchanged.

---

## Progress
- [x] 1 Signup can't take over an email that already has campaigns/a user row unless it carries the server's `ACCOUNT_CLAIM_CODE`
- [x] 2 OAuth links/creates by email only when the provider says the email is verified (Discord `verified`, Patreon `is_email_verified`)
- [x] 3 `/auth/dev-token` only when `ENV` is development/test; `CURRENT_USER_EMAIL` fallback never in production
- [x] 4 Frontend: one `authHeaders()` for every fetch (uploads, table upload, notebooks, admin export used the header only, and relative `/api` paths that Vercel rewrites to index.html); a 401 without a session clears the stale email and returns to /welcome; claim-code field on Create account
- [x] 5 Tests; docs (SECURITY.md honest model + route access summary for item 4, LAUNCH.md switch-over steps, .env.example)
- [ ] 6 Justin: set Render env, deploy, claim, verify header is ignored on prod

---

## Surprises and Discoveries
- 10/30: signup on an email with no `users` row but existing campaigns (every header-era DM, Justin included) handed the campaigns to whoever signed up first — campaigns key on `dm_email`, not on the users table.
- 10/30: `ImageUpload` and the admin export fetch relative `/api/...`; on Vercel every path rewrites to index.html, so those were already broken in prod.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-30 | Lock-down approach | passkey stopgap / real accounts / edge auth | real accounts (Justin) | Already built; what a public launch needs |
| 10-30 | How an existing DM claims their email | email verification / admin script on prod / one-time server claim code / Discord verified email | claim code env var (Discord verified email also works once configured) | No email sender exists; no prod shell needed; secret stays server-side; remove the var after claiming |
| 10-30 | Unverified OAuth email | link anyway / refuse | refuse to link or create | Provider email unverified = no proof of ownership |

---

## Validation and Acceptance
- [x] Signup on an email with campaigns: refused without the code, accepted with it; a fresh email signs up freely
- [x] OAuth with `verified: false` never attaches to an existing account
- [x] `AUTH_MODE=oauth`: header-only request → 401; bearer → 200 (existing test)
- [x] dev-token 404 in production
- [ ] Prod after Justin's switch: header with his email → 401

---

## Idempotence and Recovery
No schema change. Rolling back = unset `AUTH_MODE` on Render (header mode returns, with its hole).

---

## Outcomes and Retrospective
2026-10-30: code done and verified locally in oauth mode (ENV=production): the DM's email in the header → 401; dev-token refused; a browser holding a bare email lands on /welcome; Create account with the DM's email is refused in plain words without the claim code and lands on the campaigns with it. 1026 tests pass. **Not closed until Justin sets the Render env (LAUNCH.md §0) and step 6 is checked on prod.**
