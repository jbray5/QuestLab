# Plan 00137 — Spells that aren't in the free rules

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-11-05
**Last updated:** 2026-11-05
**Implemented by:** Claude

---

## Purpose
A player levelling a 2024 Paladin to 4 wanted Compelled Duel, and it wasn't on the list. It isn't a data bug: Compelled Duel, Thunderous Smite and Wrathful Smite aren't in SRD 5.2.1 (checked against the PDF), and QuestLab doesn't ship text from outside the SRD.

The way through already existed: the DM makes the spell as homebrew, and it appears on the character's list. Nothing told anyone that, and the guide promised something untrue.

## What changed
- **The guide's note** now says why a spell can be missing and who can add it.
- **The promise is now true.** The guide said an open pick was "recorded", but it was only a warning on the last screen. It now goes in the level's note on the sheet ("Still to pick: 1 spell").
- **The DM's sheet.** A spell search with no match says to make the spell under Spells, with the class ticked.
- **Tests:** a homebrew Paladin spell is offered on the level-up and lands on the sheet; an open pick is noted on the sheet.

## Not in scope
- Shipping names or text from outside the SRD.
- A player typing their own spell: the catalog is the DM's.

## Validation
`pytest -q`, black, isort, flake8, interrogate, tsc, eslint, vite build.
