# Plan 00097 — Full-bleed backgrounds on the player's phone sheet

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-09)

**Started:** 2026-09-09 · **Implemented by:** Claude Code

## Purpose
Justin: "redo the background images for my players … and they should take up
the full background on the player-facing phone character sheets." AI art was
explicitly fine for these.

## Shipped
- **`background_url` on player_characters** (migration 0047). The player sheet
  wears it edge to edge; on the phone the tint moves from the header block to
  the whole page. `CharacterView` uses the same backdrop.
- **`sheetBackground()`** in `frontend/src/lib/subclassArt.ts`: a character's
  own art wins, else the subclass gradient, so a character without art still
  looks deliberate rather than bare.
- **Four backgrounds**, one per party member — atmospheric places, not
  portraits. A face behind the sheet fights the text, and the character's own
  art already lives in the doll. Willa gets a stone circle under bright
  constellations; Nya a violet storm over scorched heath; Creed dawn on an
  overgrown chapel; Thane a fogged lantern-lit lane.

The art is **campaign data, not shipped product art**. Putting generated art
back into the subclass map would have re-armed exactly what Plan 86 removed.
Generated locally against the local key as usual; `AI_FEATURES` stayed off.

## Two things that had to be fixed after the first cut
1. **The gradient scrim crushed real art.** 0.62–0.86 black exists to make a
   flat CSS fill look deliberate; over a painting it left a mean luminance of
   15/255. Real art now gets its own 0.34–0.60 veil (`ART_SCRIM`); the panels
   and chips carry opaque backgrounds, so the scrim only protects loose header
   text.
2. **"Paint it bright" does not beat a night subject.** Re-prompting for
   luminous art returned 20 and 24 of 255 on two of four — a night clearing and
   a rain-wet alley are dark whatever you ask for. Fixed the way the dark
   battle-map art was fixed: a gamma lift applied after generation, chosen
   *per image* so each lands on the same target mean rather than one fixed
   gamma blowing out the picture that was already lit.

| Character | gamma | luma before | after | on the sheet |
|---|---|---|---|---|
| Willa | 0.36 | 21 | 100 | 57 |
| Nya | 0.62 | 61 | 102 | 59 |
| Creed | 0.98 | 102 | 104 | 62 |
| Thane | 0.38 | 24 | 94 | 55 |

## Verification
Full suite 895 passed; tsc, eslint and the Vite build clean. On prod: all four
characters carry a background, each URL returns 200, the unauthenticated
`/play/{id}` payload carries the field, and the softened scrim is in the live
bundle.

## Note
`PlayerCharacterRead` is never used as a `response_model`, so it does not
appear in the OpenAPI schema at all — a readiness check against it will always
fail. Check `PlayerCharacterUpdate` instead.
