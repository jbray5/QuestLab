# Plan 00035 — Sign In / Out + Landing Page

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-17

---

## Purpose

Today, an unauthenticated visitor lands on `/` and sees the email gate
in-place inside the dashboard layout. There's no proper "front door",
no way to sign out, and no marketing surface for sharing the link.

Add:

1. `/welcome` — a standalone landing page (no DM chrome, no sidebar)
   with the QuestLab pitch, feature highlights, and the sign-in form.
2. An auth guard so any DM page (`/`, `/campaigns`, `/sessions`, etc.)
   redirects to `/welcome` when no DM email is set on the device.
3. A "Sign out" button in the sidebar that clears the email and
   navigates back to `/welcome`.

The Player View (`/play/:pcId`) is unchanged — players don't go through
DM auth.

---

## Progress

- [x] Step 1: Plan doc
- [ ] Step 2: `useAuthStore.signOut()` — clears localStorage and store
- [ ] Step 3: `pages/Welcome.tsx` — hero + sign-in form
- [ ] Step 4: Auth guard in Layout (redirect to /welcome when no email)
- [ ] Step 5: Sidebar — replace inline email input with "user@x — Sign out"
- [ ] Step 6: Dashboard — drop SetEmailGate (Welcome owns it now)
- [ ] Step 7: Quality gate + commit + push

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-17 | Auth model | Stay localStorage / move to cookie / add real OAuth | Stay localStorage | Same security model as Plan 25 — identity is an email the DM types and the device remembers. Real auth is a bigger plan (Plan 38+). |
| 2026-05-17 | Landing route | `/` always landing / `/welcome` separate | `/welcome` separate | Keeps `/` = dashboard so existing DM-bookmarked URLs still resolve. Unauth visit to `/` redirects to `/welcome`. |
| 2026-05-17 | Sign-out scope | Just clear email / clear all localStorage | Just email | Other state (dice prefs, active-campaign cache) survives so re-signing-in to the same device feels seamless. |
| 2026-05-17 | Landing copy | Generic marketing / project-specific | Project-specific | This is your tool, not a SaaS. The landing should describe what *you* built. |

---

## Files touched

**Frontend:**
- `frontend/src/stores/useAuthStore.ts` — add `signOut`
- `frontend/src/pages/Welcome.tsx` (new)
- `frontend/src/App.tsx` — register `/welcome` route
- `frontend/src/pages/Layout.tsx` — auth guard + sidebar sign-out
- `frontend/src/pages/Dashboard.tsx` — drop SetEmailGate (component moves
  inline to Welcome)

---

## Validation and Acceptance

- [ ] Fresh device → visit `/` → redirected to `/welcome`
- [ ] Enter email on Welcome → arrives at Dashboard
- [ ] Sidebar shows `you@example.com · Sign out`
- [ ] Click Sign out → back to `/welcome`, email cleared
- [ ] Visit `/play/<pcId>` while signed out → works (no redirect)

---

## Outcomes and Retrospective

**Shipped 2026-05-17:**

- `useAuthStore.signOut()` — clears `dm_email` from localStorage and
  resets the store. Other persisted state (dice prefs, active campaign
  cache) survives so re-signing-in on the same device stays seamless.
- `pages/Welcome.tsx` — standalone landing page (no Layout chrome) with
  hero (gold d20 + Cinzel title + Flourish), 6-feature grid (full
  sheets, live player view, live sync, AI everywhere, real-die first,
  DM screen), and a sign-in card. Reads `?next=` from the URL so the
  guard's redirect arrives at the originally-requested page.
- `pages/Layout.tsx` — added auth guard via `useEffect`: if no email,
  bounce to `/welcome?next=<encoded-path>`. Sidebar bottom replaced
  the inline email input with a clean "Signed in as <email> ↩ Sign out"
  block. Sign-out clears identity and routes to `/welcome`.
- `pages/Dashboard.tsx` — dropped `SetEmailGate` (Welcome owns it now)
  along with the unused `useAuthStore` import.
- `App.tsx` registered `/welcome` eagerly (small bundle, always
  needed) so first-load is fast.

**Surprises:** none.

**Tech debt:** none.
