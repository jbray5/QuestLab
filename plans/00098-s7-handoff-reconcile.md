# Plan 00098 — Session 7: reconciling the 9/1 handoff

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-10)

**Started:** 2026-09-10 · **Implemented by:** Claude Code

## Purpose
Justin supplied the fuller "Session 7 and the Greenreef build" handoff (written
9/1, maps 9/5, town locations 9/6) and asked where the build stands with the
session on Saturday 9/12. That document **predates** the 9/9 handoff that Plan
95 was built from, and the two disagree in four places.

## Closed today
- **The road** (1c): Roving Bridge day + dusk. The branch is cheap and now
  exists whether or not they go inland.
- **The point** (1d.6): Secret Cove day + night. The Session 8 fight happens
  at this waterline, so the night variant is loaded now.
- **LUNA day** variant beside the night board.
- **Sorrel's phase markers**: a reference card on the S7 beats — P1 from the
  start, P2 at 30 damage (52 HP), P3 at 60 (22 HP) or the gate, whichever
  comes first. It is a card rather than an auto-firing `hp_lte` beat because
  those bind to a tracker combatant and Sorrel is not on the tracker until
  initiative is rolled at the table.
- **Mira's two cards de-confused**: "Mira (ally)" AC 15 is her BASE and "Mira
  Thornwood (Large)" AC 12 is the temporary override. Plan 95 had wrongly
  marked the base superseded; each now carries a "Which card" trait.
- **Brimm** moved off "The Open Door", which this handoff cuts, to a
  placeholder.

## Already done before today
Greenreef harbor / LUNA / market street (built as "The Street") / the island,
the whole shop including the trade tier, and the Greenreef NPC cards. The shop
already had all 23 items with the rules text verbatim in the descriptions and
`cost_text` carrying the three barter prices — the "price type the marketplace
may not have" turned out to exist.

## The four conflicts with the 9/9 handoff
1. **The Attendant block.** This document says use the Thug (CR 1/2, AC 11,
   HP 32). The 9/9 document says explicitly **do not**, because three Thugs
   with Pack Tactics against four level-3 PCs killed the party in simulation,
   and replaces them with a custom CR 1/8 obstacle that deals no damage. The
   custom block is what is built. **This one materially changes the fight.**
2. **Reeve Damson** is a hobgoblin *man* here and a *woman* in the 9/9 doc.
   Built as a woman.
3. **The spring-gate token.** This document wants it on the board. Justin
   removed it live on 9/9 because a labelled object telegraphs "attack this".
   It stays off; the stat block remains as DM reference.
4. **Margarita-shire art.** This document offers Fey Tavern Original Day or
   Marketplace Bridge Sunset; the 9/9 doc offered Mossy Steps or Secret Cove.
   The placeholder is Mossy Steps.

## Open, needing Justin
- **#blackreef-cove is not a configured crier channel** (only #test,
  #the-hearth, #the-market). It needs a Discord webhook URL, which only he can
  create. The "Blackreef Harbor" identity exists with an avatar.
- **Margarita-shire** final art.
- **Restwater below the floor** and the handout letters: no player-facing
  document surface exists, and neither referenced file is in the repo, so both
  run from Discord/paper as the handoff allows.

## The two Town Crier questions, answered
- **Identity override between messages:** fixed. `build_payload` sets
  `username` unconditionally on every post from the selected NPC row, and
  `avatar_url` whenever that NPC has one, so nothing carries over server-side.
  The one way it can still *look* inherited: an identity with no avatar falls
  back to the webhook's default face. All four current identities have avatars.
- **Embed JSON parse:** shipped in 36fe242 (Plan 72). `_parse_embed` takes
  plain prose as a description or a pasted JSON embed object.
