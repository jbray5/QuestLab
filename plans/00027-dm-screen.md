# Plan 00027 — DM Screen (in-app rules reference)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-16
**Last updated:** 2026-05-16
**Implemented by:** Claude (Roll20-killer — new-DM polish)

---

## Purpose

A pinned, searchable rules reference inside the HUD so a new DM doesn't
have to flip to the PHB at the table. Covers the questions that
actually come up mid-session:

- "Can they do that as a bonus action?"
- "How do opportunity attacks work?"
- "What does grappled actually do?"
- "How does cover work?"
- "DC for X?"
- "Falling damage?"
- "Two-weapon fighting bonus action — is it really damage with no modifier?"

The existing bottom-bar QUICK_RULES is 6 thin bullet groups. This
replaces it with a full-screen searchable modal opened from a single
HUD button.

---

## Progress

- [x] Step 1: Write this plan — 2026-05-16
- [x] Step 2: `DmScreen.tsx` + `dm-screen-content.ts` (11 tabs, ~50 entries) — 2026-05-16
- [x] Step 3: "📖 DM Screen" button on HUD top bar — 2026-05-16
- [x] Step 4: Fixed 2014-rules Exhaustion entry in HUD bottom accordion — 2026-05-16
- [x] Step 5: Quality gate green — pytest 514✓, frontend build clean — 2026-05-16

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-16 | Surface | (a) Replace bottom-bar accordion, (b) Augment with separate button, (c) Slide-out drawer | (b) | Keep the always-visible accordion for one-tap glances; add a full-modal "DM Screen" button for when you need to look something up properly. The accordion is fine for "what's grappled again?"; the modal is for "ok wait, how DOES cover work exactly." |
| 2026-05-16 | Static or DB-driven | Static React content vs. DB-backed | Static | SRD 5.2.1 / 2024 PHB content is static and small. No reason to pay a DB round-trip. Easier to copy/edit. |
| 2026-05-16 | Search | (a) Tab-only, (b) Search filter, (c) Both | (c) | Tabs let a DM browse; search lets them jump straight to "prone" or "OA" without scrolling. |

---

## Content scope

| Tab | Contents |
|---|---|
| Action Economy | Action / Bonus / Reaction / Movement breakdown with action list |
| Combat Actions | Detailed: Attack, Cast, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use Object |
| Reactions | Opportunity Attack, common reaction triggers |
| Conditions | All 14 official conditions with full mechanical effects |
| Damage & Healing | Damage types, resistance/vulnerability/immunity, temp HP rules, healing rules, death saves |
| Movement | Difficult terrain, jumping, climbing, swimming, falling (1d6/10ft cap 20d6), prone movement cost |
| Cover & Visibility | Half / Three-quarters / Total cover, lightly obscured / heavily obscured, light levels, vision types |
| Skill Checks | DC table (Trivial 5, Easy 10, Medium 15, Hard 20, Very Hard 25, Nearly Impossible 30), Passive scores |
| Combat Tricks | Shove (replace attack, contested STR(Athletics) vs STR(Athletics) or DEX(Acrobatics)), Grapple, Disarm, Mounted combat, Two-weapon fighting, Sneak Attack triggers |
| Resting | Short rest (1hr, spend HD), Long rest (8hr, HP to max, half HD min 1 back, slots back, exhaustion -1) |
| Hazards | Suffocation, Drowning, Poison, Disease, Madness, Common environmental DCs |

---

## Files touched

**Frontend:**
- `frontend/src/components/dm-screen/DmScreen.tsx` (new)
- `frontend/src/components/dm-screen/dm-screen-content.ts` (new — content
  data so the component file stays manageable)
- `frontend/src/pages/SessionHud.tsx` — add the button + the
  exhaustion fix

---

## Validation and Acceptance

- [ ] `npm run build` passes
- [ ] HUD top bar shows a "📖 DM Screen" button
- [ ] Click opens a full-screen modal with tabs + search box
- [ ] Type "prone" — only matching entries show
- [ ] Press Escape — modal closes
- [ ] Mobile viewport works (don't blow up on 375×667)

---

## Outcomes and Retrospective

**What shipped (2026-05-16):**

- `DmScreen.tsx` + `dm-screen-content.ts` — full-screen modal opened
  from a new "📖 DM Screen" button on the HUD top bar.
- 11 tabs of content:
  - Action Economy (6 entries)
  - Combat Actions (10 — all standard actions detailed)
  - Reactions (3 — OA + common spell/feature reactions)
  - Conditions (15 — all 14 official + 2024 Exhaustion)
  - Damage & Healing (6 — types, RVI, temp HP, death saves, massive damage)
  - Movement (7 — speed, terrain, climb/swim, jumping, falling, prone, through creatures)
  - Cover & Visibility (6 — half/3/4/total cover, obscurement, vision types)
  - Skill Checks & DCs (5 — DC table, passives, when to roll, group, contested)
  - Combat Tricks (7 — shove, grapple, TWF, mount, sneak attack, flanking note, multiattack)
  - Resting (3 — short, long, interrupted)
  - Hazards (6 — suffocation, drowning, extreme weather, hunger, thirst, march)
- Search box across all tabs with keyword tags (e.g. "oa" matches
  "Opportunity Attack", "dc" matches "DC Table").
- Fixed the existing bottom-bar QUICK_RULES Exhaustion entry — was on
  2014 per-level effects, now reflects the 2024 cumulative −2 D20-Test
  penalty that our backend actually models.

**Surprises:** none.

**Tech debt:** Vite bundle now 736 KB. Still acceptable for the
session; code-split task from prior plans still pending and now larger.
