# Plan 00068 — Legend Cards + Nav Streamline

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-09-02
**Last updated:** 2026-09-02
**Implemented by:** Claude Code

---

## Purpose

Two asks from Justin's "Instagram scroll" review:

1. **The scroll-stopper.** What stops a thumb is a FACE + "wait, that's
   D&D?" — and the app already manufactures those: the forge renders.
   What's missing is the shareable unit. Legend Cards: one tap on the
   character screen composites a 1080×1920 story-ready card (their
   painted hero over their subclass art, name in Cinzel, class plate,
   campaign name, QuestLab wordmark) and hands it to the phone's native
   share sheet. Every forge becomes a post; every post is an ad with a
   friend's character on it.
2. **Nav streamline.** The sidebar had grown to ~20 flat entries.
   Regroup: nightly-loop core stays visible; World & Tools and the
   Compendium fold into collapsible groups (persisted); one-off session
   companions live inside World & Tools; Admin demotes to the footer.

---

## Progress
- [x] Step 1: Layout.tsx regroup (2026-09-02) — core (Dashboard, Campaigns,
      Adventures, Sessions, Encounters, Characters, Battle Maps),
      collapsible "World & Tools" (NPCs, Shops, Puzzles, Crier,
      Notebook, Map Builder, Temple, Restwater), collapsible
      "Compendium" (Monsters, Spells, Weapons, Magic Items), Admin →
      footer. localStorage-persisted collapse state.
- [x] Step 2: legendCard.ts canvas compositor (2026-09-02) (blob art CORS-safe,
      fonts preloaded, fallback gradient when no subclass art)
- [x] Step 3: CharacterView (2026-09-02) "📸 Legend card" — Web Share API with
      download fallback
- [x] Step 4: gate + ship + live verified 2026-09-02 — Creed's card
      generated on prod (despill v2 cleaned the shadow pool first)

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 09-02 | Card rendering | server (PIL) / client canvas | client canvas | zero backend, blob CORS is `*`, share sheet needs the file on-device anyway |
| 09-02 | Share affordance | copy link / native share | navigator.share(files) + download fallback | lands directly in Instagram stories from the phone |
| 09-02 | Nav grouping | new compendium page / collapsible groups | collapsible groups | zero route churn, muscle memory intact |

---

## Validation and Acceptance
- [x] Sidebar shows ≤9 items with a fresh campaign (core + 2 group headers)
- [x] Collapse state survives reload; tour id nav-campaigns intact
- [x] Legend card generates for a PC with forge art AND for one with
      only a portrait; share falls back to download on desktop
- [x] tsc + eslint + build + pytest green; live screenshots
