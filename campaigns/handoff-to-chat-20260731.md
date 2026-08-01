# QUESTLAB HANDOFF — Claude Code → Claude Chat — 2026-07-31 (Fri)
**Context sync for campaign planning. Everything below is BUILT, DEPLOYED, and DM-verified unless marked otherwise. Session 5 = Sat 8/8. Hard freeze for all deploys: Thursday 8/7 night.**

## WHAT SHIPPED THIS WEEK (all live at quest-lab-tau.vercel.app, campaign `80b6f517-…`)

### 📣 The Town Crier — VERIFIED WORKING by the DM
- DM-only page (`/campaigns/{id}/crier`): pick channel → pick NPC identity → Discord-accurate preview → send. One webhook per channel carries unlimited identities; webhook URLs are server-side credentials, never in the client.
- Roster seeded with **real art in the house style**: The Tallyman (patchwork coat, honey lantern, too many teeth) · Sister Maren (candlelit page, unimpressed) · The Lutenist (a lute and a feathered cap, NO PERSON — the bit is preserved) · Blackreef Harbor (dusk narrator identity). Roster is editable; add identities anytime.
- ⚠ Every webhook post carries Discord's small **`APP` tag** — players will see it. Unavoidable, harmless.
- **CHAT ASK #1: Friday's in-character post copy is still unwritten.** The Tallyman is the planned voice. Canon constraints: ledger = name PAID · secret PAID · kind lie OUTSTANDING · sleepless night OUTSTANDING (banked; prep note says collect on the voyage). Price CONTENTS (the whispered name, Willa's secret) are DM-record only — never in a post.

### 🗺 Session 5 board stack
- Battle maps live in the library: **The Crossing** (ghost-ship deck, rails all sides, 5-ft grid) · **The Drowned Temple** (boss arena, chained lantern mass + prisoner platform, 4 markable hazard fog-zones: Cold Surge W/E, Leaning Water — South, The Glyph Ring) · **The Stair** (NEW today — descending steps between standing water walls).
- Scene presets (JSON import, per-browser): Open Water Night (0.68 dark) → The Crossing · The Stair (0.55) → The Stair · The Drowned Temple (0.6) → temple map. DM re-imports `campaigns/session-05-scenes.json` after any change.
- Hazard zones are the Lantern-Ford-style one-tap reveals. Placement still being tuned by the DM.

### 🕯 The Drowned Temple explorable — panel copy APPLIED
- Live artifact (private until shared): `https://claude.ai/code/artifact/51e93716-00cd-418e-8770-c526d816f4dd` · offline copy `campaigns/session-05-temple.html`.
- The copy handoff was applied verbatim: covenant stone (ASHMANTLE · DUNMORE · —ORWALE + oath), glyph wall (band decodes COMEHOME, archway HOLD, in **Maren's Table shapes exactly**; long passage is a distinct unknown script surfacing one H, one E, one H), sealed lantern (once-only reach, warm seam glow = only warm pixel), The Kept (Edrik, whisper only).
- **CHAT ASK #2: the DM wants to rework some temple lore.** When that lands, produce a fresh panel-copy handoff in the same format/rules (player surface, no secrets, glyph continuity: C=◆ O=● M=▲ E=✦ H=⬟ I=✚ L=◼ D=✱, plus T=▼ A=◐ R=⬢ S=✖ from the chapel blessing). Claude Code will apply it to the SAME artifact URL.

### 📓 The Session Notebook — NEW, live, the DM's primary prep surface now
- In-app writing/sketching notebook (`/campaigns/{id}/notebook`). Blocks: text · 📖 verbatim · 💬 prompt · 🗝 key · 🗂 card · 🖊 sketch (now sketches OVER maps) · image · divider. `@mentions` pin entity faces in the margin; `[[links]]` between pages; full-text search; read mode prints as a clean runbook; "Copy as markdown".
- **The four laws (respect these when planning):** (1) the page belongs to the DM — AI suggests in the margin only, no insert button, retyping is the point; (2) margin = context, never page content; (3) notebook content is scratch — NOTHING in it is canon or player-visible; the only promote is a page→runbook flag; (4) a finished page IS the session (paper fallback).
- Implication for Chat: master-script-style prep may increasingly be DRAFTED here by the DM himself. Chat handoffs remain the canon pipeline — the notebook promotes nothing into canon.

### 📚 Session 4 canon — logged everywhere it belongs
- `the-severance.md`: Session 4 log added (per the catch-up, no elaboration) · Tinkerman named (booming, rare; "I CAN HELP MOMMY") · **Mira = adoptive sister is now CANON** (Willa's adoption promoted from "likely"; open question narrowed to who the birth parents were) · Tallyman ledger table in the DM-only section · ferry-lantern origin note (party unaware).
- ⚠ **Two paid prices have NO recorded content**: Willa's true secret (live at table) and Nya's whispered name were never captured. Ledger says "record it if you have it." **CHAT ASK #3: prompt the DM to dictate these so they're written down somewhere DM-only.**
- App data: Willa's notes carry Wild Shape (dog) + Tinkerman · Nya's inventory lists "An old ferry-lantern (wickless)" PLAINLY — **discovered rule: in-app inventory notes are player-visible**, so the origin lives only in the DM file. Same rule stands for all future item placements.
- NPC cards created in-app (canon-only, player-safe): **Mira** (The Mooring, want: her people back) · **Sister Maren** (chapel, "hm") · **Captain Edrik Thorne** (status **Missing** — his card says NOTHING about the temple; keep it that way until played).

## STILL OPEN / PENDING VERIFICATION
- DM to verify: notebook **print output**, **stylus feel**, sketch-over-map pass, riff quality.
- Hazard-zone placements on the temple map (DM redraws, or sends Code rough positions).
- Session 5 master script / tech runsheet: NOT YET WRITTEN. When Chat drafts it, current live handles: maps The Crossing · The Stair · The Drowned Temple (with 4 zones) · presets as above · temple artifact URL above · crier ready for between/during-session posts · Session 4 puzzle links unchanged (key AELIM, untouched).

## RULES THAT BIND EVERYTHING (unchanged)
- Player-safe: Nya's full true name + Tallyman price contents = DM-record only, never any player-visible field or post.
- Claude Code does not invent lore; where handoffs are silent, it stays silent.
- Canon flows: table → Chat handoff → campaign files/app data. The notebook writes nowhere.
- Freeze: notebook bug fixes allowed through **Thu 8/7 night**; nothing deploys Fri 8/7–Sat 8/8. Paper fallbacks exist for everything.
