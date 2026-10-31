# Plan 00121 — Lamplit: the whole-app visual redesign

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-10-30
**Last updated:** 2026-10-31
**Implemented by:** Claude Code

---

## Purpose
Justin (10/30): "the whole feel of the app feels very AI-generated. I'd love a complete UI
overhaul. Colors, everything is on the table." Four directions were mocked on a design canvas;
he liked "Console" (clean, readable) and "Lantern" (storytelling), and chose the blend,
**Lamplit**: tools set like software (IBM Plex Sans, mono numbers, flat panels, hairlines),
fiction set like a book (Alegreya), night-green ground, one lantern orange for what is live.
Then "Do it now". When done, no screen uses Cinzel, red/gold on purple-black, emoji icons or
glows; `/try` is the drawn night-scene landing (DM screen + tracker pitch, no VTT).
The full system is `docs/DESIGN.md`.

---

## Progress
- [x] 0 Design doc `docs/DESIGN.md`; this plan; "before" screenshots
- [x] 1 Tokens, fonts and base components in `frontend/src/index.css` (legacy tokens aliased)
- [x] 2 Hard-coded fonts swept (Cinzel → story, Garamond/Georgia → UI, Share Tech Mono → mono)
- [x] 3 Sidebar + top bar (`Layout.tsx`): line icons, story-set campaign name
- [x] 4 DM pages: Dashboard, Campaigns, CampaignSessions/Sessions, Characters, Encounters, NPCs, Adventures
- [x] 5 HUD + tracker: SessionHud, SessionRunner, hud/*, DM dock
- [x] 6 Player phone: PlayerView, character-sheet/*, LevelUpGuide, JoinView, DiceTray
- [ ] 7 Remaining pages + components (compendium, shops, notebook, puzzles, crier, admin, map builder, guide, TV views) — legacy tokens keep them readable; tracked as TD-121a
- [x] 8 Landing `/try` rebuilt (drawn night scene, parallax) + Welcome restyled
- [x] 9 Docs (README, ARCHITECTURE, QUALITY, SECURITY, TESTING, data dictionary), gates (1,042 tests, build, no new lint errors), after-screenshots
- [ ] 9b Justin approves the push (and the "No AI art. No AI-written story." line on /try)
- [ ] 10 Usability review of every DM surface against `docs/DESIGN.md` §0 (Justin: "the rest of the app needs this treatment"); big reworks → canvas designs first
- [x] 11 Player phone redesigned on the canvas (row F) → its own plan, 00122

---

## Surprises and Discoveries
- 10/30: four agents restyled DM and player pages in parallel; a commit's pre-commit stash briefly rolled their working files back (restored). Commit only when no agent is writing.
- 10/30: /welcome's reel and stills showed the private TV board in the old look; removed (public pages never pitch the 3D table).
- 10/30: `lucide-react` was already a dependency but unused — line icons need no new package.
- 10/30: scale: `var(--gold)` ×330 (151 as text color), emoji/symbols ×837 in 109 files,
  old font names ×300, ~1,300 hex literals (many in three.js/canvas code where `var()` can't work).

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 10-30 | Direction | A Console / B Rulebook / C Lantern / D blend | D Lamplit (Justin) | A's readability + C's storytelling |
| 10-30 | Legacy `--gold` | accent orange / warm parchment emphasis | warm parchment `#EFE3C8` | 151 gold texts turning orange would make everything "live"; pages promote real live/link uses to `--accent-text` as revisited |
| 10-30 | Root font size | keep 18px / 16px | 16px | Plex Sans x-height (0.52) ≫ Garamond (0.40): 16px Plex reads larger than 18px Garamond; rem layouts gain room |
| 10-30 | Icons | new icon package / hand SVGs / lucide-react | lucide-react | already installed; consistent stroke set |
| 10-30 | Hex literals in three.js / canvas / engine | sweep / leave | leave | `var()` doesn't resolve there; scene colors aren't UI |
| 10-30 | Scope | reskin only / reskin + usability | reskin + usability (Justin) | "Keep those principles as you review the entire app"; principles in DESIGN.md §0 |
| 10-30 | Landing art | 3D engine renders / drawn scene | drawn scene (seeded generator) | renders not hero-grade; Justin: 3D table + VTT are private, never pitched |

---

## Context and Orientation

### Files touched
- `docs/DESIGN.md` (new) — the system; `frontend/src/index.css` — tokens + base classes
- `frontend/src/pages/*.tsx`, `frontend/src/components/**/*.tsx` — inline styles, emoji → lucide icons
- `frontend/src/pages/TryLanding.tsx` + `frontend/src/components/landing/*` (new) — landing
- `tools/landing/gen_night_scene.py` (new) — writes `frontend/src/components/landing/nightScene.generated.ts`
- `README.md`, `ARCHITECTURE.md`, `docs/QUALITY.md`

### Architecture layers involved
Frontend only (React). No API, service, repo, domain or schema change.

### Key terms defined
- **Token**: a CSS custom property on `:root` (e.g. `--accent`) that pages reference as `var(--accent)`.
- **Story vs tool text**: fiction (names, read-aloud) uses Alegreya; everything else Plex Sans/Mono.
- **Live**: the one thing happening now (current turn, next session, Run) — the only orange.

---

## Concrete Steps

### Step 1: Tokens and base components
**File:** `frontend/src/index.css` — **Modify**
New `:root` palette and fonts per `docs/DESIGN.md` §2–3; legacy names aliased; Google Fonts
import → Alegreya, IBM Plex Sans, IBM Plex Mono; base `h1–h6`, `a`, `button`, inputs, `label`,
`.btn*`, `.card`, `.badge*`, `.nav-item`, `.read-aloud`, `.stat-block`, `.divider`, scrollbar,
focus ring, TV title/last-roll classes restyled; body glow + card hover lift/glow removed; new
`.story`, `.num`, `.eyebrow`, `.pill*`, `.ql-table`; `svg.lucide{stroke-width:1.8}`.
**Verify:** `npm run build`; screenshots of every tour page readable, no purple/red-gold left in chrome.

### Step 2: Font sweep
**Files:** every `frontend/src/**/*.tsx|ts` with a literal font family — **Modify**
`Cinzel*` → `var(--font-story)`; `EB Garamond`/`Georgia`/`Palatino` stacks → `var(--font-ui)`
(page passes set story text explicitly); `Share Tech Mono`/`monospace` stacks → `var(--font-mono)`.
Skip three.js/canvas text (`ctx.font`, drei `Text`).
**Verify:** `grep -r "Cinzel\|EB Garamond\|Share Tech" frontend/src` → only canvas/engine hits.

### Steps 3–7: Page passes
Per page: emoji icons → lucide; gold → `--text`/`--accent-text` by meaning; old hex → tokens;
fiction names → `.story`; numbers → `.num`; one primary button; status → pills.
**Verify:** tour screenshots at 1440×900, 1280×800 (HUD) and 390×844 (phone); no overflow.

### Step 8: Landing
`tools/landing/gen_night_scene.py` (seeded) writes the layer SVG strings; `TryLanding.tsx`
renders hero (parallax via CSS scroll timelines, fireflies, reduced-motion off-switch), DM
screen, tracker, prep, phone, promise, waitlist form (existing `joinWaitlist` + demo button kept).
**Verify:** `/try` at 1440 and 390, scroll shows parallax; waitlist still posts.

---

## Validation and Acceptance
- [ ] `npm run build` passes; `npm run lint` adds no new errors (MapBuilder's are pre-existing)
- [ ] `pytest -q` passes (unchanged backend)
- [ ] Tour screenshots after vs before: every page in Lamplit, nothing overflows at 390 px
- [ ] `grep` finds no Cinzel/Garamond outside canvas code; no emoji in `Layout.tsx`
- [ ] Justin approves the push (and the landing's "No AI art. No AI-written story." line)

---

## Idempotence and Recovery
Each step is its own commit; any page can be reverted alone. Legacy token aliases mean a page
not yet revisited still renders. No data or schema touched.

---

## Interfaces and Dependencies
**Produces:** design tokens + classes every page uses; `docs/DESIGN.md`.
**Depends on:** `lucide-react` (already installed); Google Fonts.

---

## Outcomes and Retrospective
_Fill in after completion._
