# Plan 00125 — The friends beta

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-31
**Last updated:** 2026-10-31
**Implemented by:** Claude Code

---

## Purpose
Justin (10/31): "What do you need next before I advertise this to my friends? Can we make a beta
program for them?"

His DM friends get a personal invite. They:
1. sign up with it;
2. see they're in a beta;
3. have a short "your first night" checklist;
4. can send feedback from any screen in two taps.

Justin sees in Admin who joined from which invite, how active they are, and every piece of
feedback. Feedback can optionally ping a Discord channel the moment it lands. Players never need
an account and are never asked for a code.

---

## Progress
- [x] B1 `beta_invites` table and `users.invite_code` (migration 0059). Invite service:
  - create (label, max uses);
  - list with uses;
  - revoke;
  - redeem.
- [x] B2 Sign-up gate, `BETA_INVITES=required|off` (default `required`):
  - password sign-up and first OAuth sign-in need a valid code to create a NEW account;
  - existing accounts and admins are unaffected;
  - a code can't be over-used, revoked or unknown;
  - the invite rides through OAuth in the signed state.
- [x] B3 `feedback` table (migration 0059):
  - `POST /api/feedback` (signed-in DM: kind, text, page, viewport);
  - optional Discord ping (`FEEDBACK_WEBHOOK_URL`) through `integrations/discord_webhook`;
  - admin list and "mark seen".
- [x] B4 Admin API:
  - `GET/POST /api/admin/invites`, `POST /api/admin/invites/{id}/revoke`;
  - `GET /api/admin/beta` (DMs: email, name, invite, joined, last seen, campaigns, sessions);
  - `GET /api/admin/feedback`, `POST /api/admin/feedback/{id}/seen`.
- [x] F1 `/welcome?invite=CODE`: the code is pre-filled and remembered for the session, sent with
  sign-up and OAuth start; plain words when a code is needed or wrong.
- [x] F2 A "Beta" pill by the brand, and a "Send feedback" button in the nav (desktop and the phone
  drawer) that opens a sheet with kind chips (Loved it · Confusing · Broken · Idea), text, and a send
  that confirms.
- [x] F3 A "Welcome to the beta" card on the Dashboard for new DMs: run the sample night, open a
  player's phone, run your own session, send feedback. It ticks itself off where it can and can be
  dismissed.
- [x] F4 Admin "Beta" tab: make an invite (who it's for, uses), copy its link, revoke; the DMs who
  joined, with activity; the feedback inbox.
- [x] T Tests for the gate, redeem limits, revoke, OAuth carry-through, feedback, admin-only access.
- [ ] D Docs (SECURITY, data dictionary, LAUNCH, README env), `.env.example` (`BETA_INVITES`,
  `FEEDBACK_WEBHOOK_URL`), the message Justin sends his friends.

---

## Surprises and Discoveries
- 10/31: the new-DM tour still pitched "a shared board on the TV" with emoji labels; rewritten to the
  public story (DM screen, tracker, phones) and to point at Send feedback.
- 10/31: a new friend sees the 8-step tour and the beta checklist at once; kept (the tour is modal and
  short, the checklist stays for later), to be judged by the persona run.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-31 | Who can sign up | open / invite-only | invite-only by default (`BETA_INVITES=required`), one env flip to open | A friends beta; safe-to-share means no strangers until Justin chooses |
| 10-31 | Code shape | one shared code / per-friend codes | per-friend codes with a use limit (default 3) | Shows who came via whom; a friend can bring a co-DM; revocable |
| 10-31 | Where feedback goes | email / DB / Discord | DB inbox in Admin, plus an optional Discord webhook | No email sender exists; Justin lives in Discord |
| 10-31 | Players | codes for players too / never | never | Players use capability links; asking them for anything breaks the table |

---

## Context and Orientation
Account creation lives in `services/auth_service.py`: `signup()` for passwords, `complete()` for
OAuth first sign-in. Admin is `BOOTSTRAP_ADMIN_EMAILS` (`require_admin`). Discord posting already
exists in `integrations/discord_webhook.py` (Town Crier).

Layers: `domain/beta.py` (new) → `db/repos/beta_repo.py` (new) → `services/beta_service.py` (new) →
`api/routers/beta.py` (new) plus `admin.py`; frontend `pages/Welcome.tsx`, `pages/Layout.tsx`,
`pages/Dashboard.tsx`, `pages/Admin.tsx`, `components/FeedbackSheet.tsx` (new), `api/beta.ts` (new).

---

## Validation and Acceptance
- [ ] With `BETA_INVITES=required`, a new email can't sign up without a code. With a valid code
  it can, and the code's uses go up. A revoked or used-up code is refused in plain words.
- [ ] An existing account signs in with no code. An admin can always sign up and sign in.
- [ ] Discord sign-in with `?invite=` creates the account; without one, a new Discord user is told
  to ask for a code.
- [ ] Feedback from the phone drawer and the desktop nav lands in Admin (and in Discord when the
  webhook is set).
- [ ] `pytest -q` green; build OK; no new lint errors.

---

## Idempotence and Recovery
Migration 0059 adds two tables and one nullable column. `BETA_INVITES=off` restores open sign-up
without a deploy of new code.

---

## Interfaces and Dependencies
**Produces:**
- `POST /api/feedback`;
- the admin invites, beta and feedback routes;
- `SignupRequest.invite_code`;
- `GET /api/auth/{provider}/start?invite=`.

**Depends on:** Plan 120 accounts; Plan 124 (AI removal touches `auth_service` and `Admin.tsx`
first).

---

## Outcomes and Retrospective
_Fill in after completion._
