# Plan 00129 — An honest start: no sample adventure, no in-app AI note, maps back in the pitch

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-10-31
**Last updated:** 2026-10-31
**Implemented by:** Claude Code

---

## Purpose
Justin's decisions after persona run 3 (10/31):

1. "Remove the sample adventure for now and references to it. We'll write one manually later."
   - Its prose was drafted with AI coding tools, which breaks the landing's "No AI-written story"
     promise.
2. The "built by a developer who uses AI coding tools" note is "just for my Discord message to my
   friends. Should not exist in the app."
   - The app keeps saying what's true of the product: nothing in it generates anything.
3. Maps and the online table go back in the pitch: "Yeah I think so. But not the immersive
   version."
   - The 2D battle map stays: upload a map, set the grid, paint fog, tokens on the TV, remote
     players moving their own token.
   - The immersive 3D set dressing stays private (Justin's own table).

---

## Progress
- [x] Sample night removed:
  - `POST /api/onboarding/starter`, `services/onboarding_service.py` and their tests;
  - the dashboard button and empty state;
  - the beta checklist step;
  - the tour step;
  - the Guide paragraph;
  - the invite email text;
  - LAUNCH copy.
  - Existing sample campaigns in DMs' accounts stay; they're the DMs' data to delete.
- [x] A new DM's first steps without a sample:
  - start a campaign;
  - share the join link or add the party;
  - plan a session;
  - run it.
- [x] The AI-coding-tools note removed from `/try`, Terms and the Guide. "No generative AI in
  QuestLab" stays.
- [x] Maps in the pitch: `/try`, the Guide and the tour describe the 2D battle map and the remote
  player's window.
- [x] "3D set dressing (immersive)" shown only to admins in the HUD's Player display menu.
- [x] Gates, docs, commit, push.

---

## Surprises and Discoveries
- **The landing page quoted the same AI-drafted story.** Its mock-ups had "The kettle on the
  hearth…", the Pale Steward and the Gilded Kettle titles (from the showcase campaign). Bea
  quoted one of them as sample prose. They are now plain placeholders that say what goes there
  ("Your opening words go here…"), because any replacement story I wrote would also be
  AI-written.
- **The sample map image (`/sample/mill-road.jpg`) stays.** Sample campaigns already in DMs'
  accounts point at it, and it is procedural art.

---

## Decision Log
- The sample-seeding code is deleted, not hidden. Git history keeps it, and Justin's manual
  one-shot will need its own content and probably its own shape.
- The procedural ink-map generator (`scripts/procgen_ink_maps.py`) stays. It's a tool, not the
  adventure.
- Only the immersive option is gated (admin-only). The 3D board for screen share stays for
  everyone; Justin excluded only "the immersive version".

---

## Context and Orientation
- Sample night: `api/routers/onboarding.py`, `services/onboarding_service.py`, `Dashboard.tsx`,
  `BetaWelcome.tsx`, `tour-steps.ts`, `GuidePage.tsx`.
- Disclosure: `TryLanding.tsx`, `TermsPage.tsx#no-ai`, `GuidePage.tsx`.
- Player display menu: `SessionHud.tsx` (around line 1635); `useAuthStore().profile.is_admin`.

---

## Validation and Acceptance
- No route or UI mentions the sample night (grep, outside history docs).
- A new DM's dashboard shows a clear first step.
- `/try` and the Guide mention maps, not 3D or immersive.
- The immersive entry is absent for a non-admin DM.
- Gates are green.

---

## Idempotence and Recovery
- No schema change.
- Sample campaigns already created remain usable. They are ordinary campaigns.

---

## Interfaces and Dependencies
- Removes `POST /api/onboarding/starter`. The only caller was the dashboard.

---

## Outcomes and Retrospective
Done 10/31.

**What changed:**
- The sample night, its route and its tests are gone.
- The dashboard's "Start your first campaign" button opens the New campaign form
  (`/campaigns?new=1`, added with Plan 130). The beta checklist walks a new DM through a first
  night. A four-step card was tried and cut, because it repeated the checklist.
- The beta checklist step is now "Bring your players".
- The tour has a maps step.
- The Guide has a "Battle maps, if you use them" section and better TV and remote-player text.
- The landing page has a maps section, drawn in CSS (no image), and its eyebrow reads "around one
  table or online".
- The AI-coding-tools note is out of `/try`, the Guide and Terms (`#no-ai` is now "No generative
  AI"). It lives in Justin's own posts.
- The immersive option and its HUD extras show to admins only.
- The landing page, Guide and Terms carry Plan 130's prices.

**Left open:**
- The demo world seed (`scripts/seed_demo_world.py`, for the broken `questlab-demo` service) reuses
  old blob portraits that may be AI art. Check it before reviving the demo.
- The Gilded Kettle showcase campaign in Justin's own account was written the same way. Justin
  decides whether to remove it.
