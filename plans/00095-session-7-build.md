# Plan 00095 — Session 7 build (Restwater → Greenreef → the envoy)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-09)

**Started:** 2026-09-09 · **Implemented by:** Claude Code

## Purpose
Build the Session 7 handoff for Saturday 9/12. No lore invented; where the
handoff is silent the field is left blank with a visible ⬜ placeholder.

## Boards (§1)
Six Czepeku boards cut from the purchased zips on `F:\DnD\`, only the named
variant loaded. Every one is gridless art whose square count comes from the
zip's bracket, so `grid_size` is derived from real pixel width — all six
landed on exactly **140 px/square with 0% vertical drift**, which is a good
sign the bracket and the art agree.

| Board | Source variant | Pixels | Squares |
|---|---|---|---|
| Greenreef — The Street (Day) | `GL_MarketplaceBridge_Original_Day` | 3920×4900 | 28×35 |
| Greenreef — The Street (Sunset, envoy) | `GL_MarketplaceBridge_Sunset` | 3920×4900 | 28×35 |
| Greenreef — The Harbor (Low Tide) | `GL_TradingPort_Low_Tide` | 6440×4620 | 46×33 |
| Greenreef — LUNA | `GL_FeyTavern_Luna_Night` | 4060×8120 | 29×58 |
| Margarita-shire (placeholder — Mossy Steps) | `GL_MossySteps_Original_Day` | 3080×5180 | 22×37 |
| The Island (view only) | `GL_LighthouseIsle_No_Ships_Day` | 7700×6020 | 55×43 |

City Hall (§1f) has no board by design. Nothing was built from the §1h
reserved set.

### Animated variants
The purchased library has loops for exactly three maps — Fey Tavern, Chained
Dragon and Elven Magitech Portal — and they sit *beside* the zips, not inside
them. Only the Fey Tavern is a Session 7 board.

Two catches, both now handled:

1. **Czepeku renders these loops sideways.** All three are 3840-wide landscape
   files whose aspect is the exact inverse of their portrait map, with an
   identity display matrix — so a player draws the map on its side. Confirmed
   by pulling a frame in headless Chrome. Fixed by rewriting the video track's
   3×3 display matrix to 270° and swapping the track's display dimensions
   (`scratchpad/rotate_mp4.py`): a container edit, no re-encode, no quality
   loss. Re-checked in Chrome — the moth is back at the top over the bar.
2. **The loop is the *Original* variant, not Luna.** Czepeku only animated
   Original Day/Night, and that variant's moth is a blue eyespot moth, not the
   pale green luna moth the club is named after. So the animated version went
   in as a **second board**, `Greenreef — LUNA (animated)`, beside the still —
   the still keeps the right moth, the animated one moves. DM's pick.

The same rotation trick will be needed for Chained Dragon (Session 8+) and the
Magitech Portal if either is ever built.

## Restwater (§1a) — verified, two gaps closed
Verified working: three sealable doorways (the HOUSE ACTIONS beat), Sorrel's
REGEN card with its dismiss button, Mira flagged Large (token size 2.0), and
**Stand Down: House** — both Dryads *and* all three Attendants carry
`group: "house"`, so one click flips the whole staff.

The **spring-gate is deliberately not on the board.** It was added as a token
(the handoff's verify list asked for one) and then removed at Justin's call: a
big labelled object on the shared screen telegraphs "attack this" and gives the
puzzle away. He tracks its 25 HP on paper. The `Spring-gate (sluice)` stat
block stays in the catalog as the DM's reference for AC 15 / HP 25 / immune to
poison and psychic — it is DM-facing only and never renders to players.

Also wired the standees made in Plan 94 onto the Mira, Edrik and Tinkerman
tokens, put Sorrel's hag art on hers (she has revealed herself by the time
this board is up), and set **Tinkerman to Tiny** (0.5) per §3.

### Art re-cuts (post-build, at the table's request)
- **Mira** re-cut swashbuckling: cutlass drawn, laced vest, sash, cuffed
  boots, hand on hip, smirking.
- **The Dryad** re-cut striking and otherworldly: bark-toned skin, leaf-fall
  hair, flowering branch, knowing half-smile.
- **The Attendants** modelled on a cultist reference Justin supplied —
  charcoal sackcloth robes, deep hoods, crescent mark on brow and breast,
  bare wet feet. Three *different* townspeople, one per token, since all three
  stand together. Their hands are open and empty rather than holding the
  reference's sickle: they deal no damage and apologise while they grapple, so
  a raised blade would read as a threat at exactly the wrong moment.

Every token bakes its art URL in at placement time, so re-cutting a standee
means repointing the tokens too — done for all of the above.

## Stat blocks (§2)
- **Attendant** — created, CR 1/8, AC 12, HP 16. Get In The Way (+3, no
  damage, Grappled escape DC 11) and Please Don't. Traits carry both "She Has
  Our Years" and an explicit "do NOT run these as Thugs" warning.
- **Dryad** — already correct in the catalog (CR 1, AC 11, HP 22, as printed).
- **Green Hag** — already corrected to the 2024 block in Plan 92.
- **Spring-gate (sluice)** — already correct: AC 15, HP 25, immune to poison
  and psychic.

## Two-state ally cards (§5a)
The app cannot hold two stat sets behind one toggle, and adding that was the
lowest priority with an explicit paper fallback. Built with existing
machinery instead: **Edrik Thorne (before Restwater)** AC 15 / HP 45 and
**Edrik Thorne (after Restwater)** AC 12 / HP 22 / speed 20 are two blocks;
the DM swaps which one is on the tracker at the break. Same pattern for
**Mira Thornwood (Large)** and **Tinkerman**.

## NPC cards (§3, §4)
Reeve Damson, Sael Amakiir and The Lutenist updated to the handoff's wording.
Created **The moth bartender** (name deliberately blank, noted on the card)
and **Summer Court Representative** (race blank, marked non-combatant, notes
carry the sylvan option list). Mira, Edrik, Tinkerman and Sorrel are linked to
their stat blocks.

## App change
"+ NPC" on the table console previously listed only NPCs that already had
art, which conflicts with §3's "build the token slots now, art arrives
separately". It now lists every NPC and shows a neutral dashed chip where art
is missing, so an unfilled slot places as a labelled token rather than being
unavailable.

## Not built, on purpose
- **Restwater — Filled** (§1a): needs a pools-full repaint of the map, which
  is art. The handoff permits skipping; the DM narrates the rain.
- **The chamber below** (§1a): needs a scene image. Awaiting the art handoff.
- **Handouts** (§5b): QuestLab has no player-facing document view, so this is
  the no-op the handoff anticipated — paste into Discord.
- **Margarita-shire image**: built from Mossy Steps (the ★ pick) as a
  placeholder; Secret Cove is the alternative if Justin prefers it.

## Flagged for Justin
- **Willa's AC**: the handoff says 16, her sheet says 12. Not changed — a
  sheet edit is his call.
- Two older blocks, "Mira (ally)" (AC 15) and "Edrik (ally)" (AC 10/HP 15),
  predate this handoff and now disagree with it. Not deleted; each carries a
  **Superseded** trait naming the block Session 7 uses instead.
