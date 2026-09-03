# Plan 00072 — Session 7 + the Greenreef build

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (ready for 9/12; live edits welcome)

**Started:** 2026-09-02 · **Session:** Saturday 2026-09-12 · **Implemented by:** Claude Code

Source: Justin's handoff "SESSION 7 AND THE GREENREEF BUILD" (chat, 9/2).
Rules: no invented lore; where the doc is silent, leave a placeholder;
player-facing surfaces contain no secrets; paper fallbacks exist for all.

## Priority order (from the doc) and status
1. [x] Restwater board (S7 86b85efd staged; verified on the projector): sluice object (AC 15 HP 25, immune poison/psychic),
       Sorrel regen/phase cues, five house fighters, round-one positions,
       Mira Large override, sealed-door markers, one-click house stand-down
2. [x] Greenreef board with four findable locations + beached boats
       (Czepeku Tropical Island Village "No Boat Day" — SVG not on disk;
       Justin cleared Czepeku replacements) — markers/boats placed on S7
       table state when staged; "Greenreef — Night" imported for S8
3. [x] Shop, gold tier, rules verbatim in descriptions
4. [x] Greenreef NPC cards (6 + Sael placeholder; Tavish paragraph only)
5. [x] Road boards: Forest road (Czepeku Forest Pass) imported; coast road +
       crossroads generated (S6 style prompts) — Justin may swap
6. [x] Shop, trade tier (cost_text → storefront shows the price text and
       Buy defers to the table; DM rules on it)
7. [x] Dusk variant: darkness dial on Greenreef (+ Night board as backup)

## Code shipped for this session
- Token `group` + one-click **stand down** (kind monster → custom for a
  whole group; the fight is won at the gate)
- Town Crier: embed field accepts a JSON embed object (parse fix) +
  test that every send carries its own username/avatar (identity)

## Placeholders left for Justin
- Sael Amakiir location (town or road); attendant/dryad names (blank —
  players may name them); road maps if he sends his own picks;
  Drip_HarborNotice text is his to send.

## Not done on purpose
- Summer Court, finale, Yarnspinner, Tavish stat block, leveling.
