# Plan 00029 — Wow Factor & Polish

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-05-16
**Last updated:** 2026-05-16

---

## Purpose

The app works. It needs to *feel* good. Take Plans 17–28's mechanics
and dress them in the kind of detail that makes a brand-new player at
the table go "wait, this is cool." The polish opportunities cluster
into four buckets — animations, identity, surprise-and-delight, and
empty-state polish — plus one tech-debt cleanup (bundle splitting).

---

## Progress

- [x] Step 1: Write this plan — 2026-05-16
- [x] Step 2: Foundation — `public/d20.svg` favicon, OG/Twitter meta in
  `index.html`, parchment radial gradient body bg, `Flourish` component,
  animations.css keyframes (fade-in, modal-in, ripple, shake, confetti,
  crit-pulse, damage-flash) + `prefers-reduced-motion` guard — 2026-05-16
- [x] Step 3: Polish — modals get `ql-modal-in` (CharacterSheet, DmScreen,
  toast cards, 404). Card hover lift via global `.card:hover` rule.
  Dashboard restructured with centered hero + Flourish; SetEmailGate
  redesigned as a hero card with d20 mark — 2026-05-16
- [x] Step 4: Wow moments — `Confetti` component (36 colored squares
  with CSS keyframes) on nat 20 in RollHelper, plus a "CRITICAL!"
  pulse banner. Nat 1 shakes the dialog. `ToastProvider` global error
  surface bridges window events from `api/client.ts`. 404 page now
  themed (d20 mark with subtle shake, Flourish, in-character copy) — 2026-05-16
- [x] Step 5: Code-split — every page route is `React.lazy` with a
  themed Suspense loader. Result: 742 KB single bundle → 283 KB main +
  31 KB PlayerView chunk + per-feature chunks. ~58% smaller download
  for the player view. — 2026-05-16
- [x] Step 6: Quality gate green — pytest 522✓, frontend build clean — 2026-05-16

---

## Scope

### Animations
- Modals fade + scale-in on open (currently they pop)
- Card hover lift (dashboard campaign tiles)
- HP bar width transitions when damaged/healed, with a red flash overlay
  on damage
- Spell-slot pips ripple when clicked
- TurnBanner already shimmers (Plan 28) — leave as-is
- Page transitions kept minimal (route change fade)

### D&D identity
- Custom SVG favicon (a stylized d20)
- Open-graph + Twitter meta in `index.html` so shared links unfurl
  with a proper title + description
- Subtle parchment-toned body background (radial gradient, very low
  opacity — no busy texture)
- Reusable `Flourish` SVG divider component

### Surprise-and-delight
- **Nat 20** in RollHelper → brief gold confetti + "CRITICAL!" pulse
- **Nat 1** in RollHelper → screen shudder
- Global toast for API errors so transient failures don't silently
  disappear

### Empty states + 404
- 404 page with a "you wandered into the mist" vibe and a link home
- (Dashboard empty state already works via the SetEmailGate; leave it.)

### Tech debt
- `React.lazy` + `Suspense` for `SessionHud` and `PlayerView` so the
  player view's JS download doesn't include the DM HUD code.

---

## Decisions

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-05-16 | Confetti | (a) Library (canvas-confetti ~8KB), (b) Hand-rolled CSS | (b) | 12 colored squares with CSS keyframes is ~30 lines. Avoids a dep + better matches the gold theme. |
| 2026-05-16 | Toast system | (a) react-hot-toast dep, (b) Custom provider | (b) | Tiny custom provider; we only need one shape (error). Skips another dep. |
| 2026-05-16 | Body background | (a) Image texture, (b) CSS gradient | (b) | Stays under bundle weight + scales to any viewport + theme-friendly. |
| 2026-05-16 | Code splitting | (a) Skip, (b) Lazy-load page-level routes | (b) | Bundle is 738 KB. Lazy-loading PlayerView in particular gets the player phone's payload down. |

---

## Outcomes and Retrospective

**Shipped 2026-05-16:**

Visual identity
- Custom d20 SVG favicon (gold-on-dark, with "20" centered).
- Open Graph + Twitter card meta in `index.html` so shared links unfurl
  with proper title / description / image.
- Body now sits on a subtle parchment-tone radial gradient (gold up top,
  crimson bottom — both very low opacity so it reads as ambient glow).
- Reusable `Flourish` SVG component (gold diamond with tapered lines).

Animations & polish
- Global `.fade-in` and `.ql-modal-in` keyframes; modals now arrive with
  a 200ms scale-from-98.5% + fade.
- `.card` hover lift (translateY -2px + gold outline glow).
- `prefers-reduced-motion` guards everything.

Wow moments
- `Confetti` component fires 36 gold-themed particles on nat 20 in
  RollHelper, alongside a pulsing "CRITICAL!" gradient banner.
- Nat 1 shakes the dialog (CSS keyframe, 500ms) and shows a darker
  red gradient miss banner.
- `ToastProvider` mounted at the app root; `api/client.ts` dispatches
  `ql:api-error` window events on non-401 failures so transient API
  errors always surface (and 401s stay quiet on first load).
- 404 page restyled with the d20 mark (subtle shake), Flourish,
  in-character copy ("The path you sought lies beyond the map's edge…"),
  and a single "↩ Return to the keep" CTA.
- Dashboard reframed: centered "QuestLab" title with Flourish, italic
  invitation copy.
- SetEmailGate (first-load welcome) redesigned as a hero card with the
  d20 mark, branded tagline, and "Enter the lab →" CTA.

Bundle splitting
- Every page route is now `React.lazy` + `Suspense` (themed loader).
- Bundle before: **742 KB** single chunk (218 KB gzip).
- Bundle after: **283 KB** main + per-page chunks (PlayerView is its
  own 31 KB chunk, MapBuilder its own 209 KB, etc.).
- Player phones now download ~314 KB total instead of 742 KB —
  ~58% smaller download on the player view.

**Surprises:** none — animations.css single-source pattern worked the
first time. CSS keyframes for confetti/shake are kinder to mobile than
JS-driven animation libs.

**Tech debt:** none introduced. Bundle warning is gone. Consider in a
future plan: lazy-loading the heavy modals (CharacterSheet, DmScreen)
behind `React.lazy` too — those are still in the SessionHud chunk
right now.
