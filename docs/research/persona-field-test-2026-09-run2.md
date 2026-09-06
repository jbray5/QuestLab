# The Twelve-Persona Field Test, run 2 (2026-09-05)

Twelve constructed testers, each on their own first-run account, each driving
the live app end to end in a throwaway campaign and writing a report in their
own voice. Six returned from [run 1](persona-field-test-2026-09.md) to check
what shipped (Plans 82–84); six are new, chosen to cover what run 1 could not:
a brand-new player, an online-only DM, a library teen club, a West Marches
organizer, an actual-play streamer, and a low-vision keyboard-first DM.
Reports: [personas/](personas/) (run 1 archived in [personas/run1/](personas/run1/)).

Everything the twelve asked for that fit one push shipped the same night as
[Plan 85](../../plans/00085-twelve-persona-fixes.md); the two things they
argued about most — generative AI and the arena's rules — became
[Plan 86 (no generative AI)](../../plans/00086-no-generative-ai.md) and
[Plan 87 (the arena's rules engine)](../../plans/00087-arena-rules-review.md).

## The read
- **The live table converted.** Run 1 had zero "yes, next session"; run 2
  has five (Nina, Theo's "maybe" leaning yes, Priya, Tom, Jess, Marcus).
  Damage to a phone in 0.3–0.8 s, a token drag to every remote window in
  0.7–0.9 s, the "IT'S YOUR TURN" banner in 0.4–0.7 s, measured by six of
  them independently.
- **The remote-player window is the second product.** Theo, Priya and Tom ran
  whole fights with no screen-share. What they still lack: a server-side roll
  log everywhere, distance, their own fog. (The roll log shipped in Plan 85.)
- **The arena landed with new players and teens** — and was immediately caught
  on rules by the veterans (Divine Smite, Lay on Hands, Paladin slots, Extra
  Attack, foes using every action). Plan 87 is the answer.
- **AI never sold.** Across twelve testers, art converted no one; text
  converted two at $5 for one thing each (a pack, a brief). Bea's audience
  would have called out the sample map; Adaeze's library couldn't pay; Rosa's
  briefs contradicted her canon twice. Justin's call — **no generative AI in
  the product** — is the launch stance, and the numbers agree with it.

## Scores (1–5)
| Persona | Onboarding | Table | Players | Prep | Value | Next session | $5 · $12 · $25 |
|---|---|---|---|---|---|---|---|
| Nina (new player) | 3 | 4 | 3 | 3 | 4 | yes | — |
| Theo (online only) | 3 | 4 | 4 | 3 | 3 | maybe | maybe · no · no |
| Adaeze (library teens) | 4 | 3 | 3 | 3 | 4 | maybe | no · no · no |
| Hal (West Marches) | 4 | 3 | 3 | 2 | 2 | no | no · no · no |
| Bea (streamer) | 4 | 4 | 4 | 3 | 4 | maybe | maybe · no · no |
| Sam (low vision) | 3 | 3 | 4 | 2 | 3 | maybe | maybe · no · no |
| Marcus (in-person) | 4 | 4 | 4 | 3 | 4 | **yes** (was maybe) | no · no · no |
| Priya (online, Roll20) | 4 | 4 | 4 | 3 (was 2) | 4 | **yes** (was maybe) | maybe · no · no |
| Dev (Foundry, rules) | 4 | 3 | 4 | 3 | 3 | maybe (was no) | maybe · no · no |
| Jess (new DM) | 3 (was 2) | 3 | 3 | 3 (was 2) | 4 | **yes** (was maybe) | yes · no · no |
| Tom (busy hybrid) | 4 | 4 | 4 | 3 | 4 | **yes** (was maybe) | yes · no · no |
| Rosa (worldbuilder) | 3 | 3 | 3 | 3 | 3 (was 2) | maybe (was no) | maybe · no · no |
| **Average** | 3.6 (3.0) | 3.6 (3.0) | 3.6 (3.7) | 2.8 (2.5) | 3.5 (3.3) | 4 yes · 6 maybe · 1 no | 2 yes · 6 maybe · 0 · 0 |

(Run-1 averages in parentheses. Nina is a player and doesn't buy.)

## What run 1 asked for, verified fixed by the people who asked
Campaign delete (6/6 → 0), conditions to every screen, foes first try, HP
taps, laptop board, QR retiring, grid guess, creator hints, Session Pack
hygiene, owner-world scrub, sample night with script and NPCs, remote-player
window with own-token drag, join code, NPC prep fields on cards, hidden badge,
Channel Divinity, Elf Keen Senses, Human skill loophole, long-rest residue,
kit armor, typed combat_state, level PATCH granting features, sidebar from URL,
encounters route, arc tier, class avatars, tour rewrite, export.

## What run 2 found (how many hit it) → where it went
- Brief contradicts stored NPC secrets / the pack it sits beside — 3 → Plan 85
  (canon block on the brief); moot under Plan 86.
- Sample pregens with no gear, spells or features — 4 → Plan 85.
- Foe tokens visible under unrevealed fog on the projector — 2 → Plan 85.
- Roll log client-only; DM rolls don't reach the projector; player rolls
  don't reach the HUD — 4 → Plan 85.
- Dead table link returns an empty 200 forever — 5 → Plan 85 (404).
- Standard array class-blind unless the chip is re-tapped — 2 → Plan 85.
- Party-card HP taps don't reach remote windows; rapid taps still drop — 2 → Plan 85.
- 8-PC cap — 2 → Plan 85 (30).
- Paladin/Ranger no slots at L1; Second Wind / Rage uses fixed; Lay on Hands
  as an action; foes take every listed action; forged arena state accepted — 2 → Plan 85.
- Divine Smite not a bonus action after a hit; Soulknife has nothing; no
  Sneak Attack; no Extra Attack — Justin + Dev → Plan 87.
- Contrast token 4.3:1; no End Turn hotkey; Admin nav for everyone; DM board
  hex default; senses labels; deleted campaign's characters → 500 — 3 → Plan 85.
- Join-built characters don't attend the sample session; phone silent when it
  isn't your turn — 2 → Plan 85.
- The sample map was AI-generated; the landing still offered AI tiers — 2 → Plan 86.

## Still open (P2)
- **Encounter meter counts the whole roster, not the attending PCs** (Hal).
- **Co-DM access** — a members table and a widened owner check (Hal).
- **Claim-your-sheet PIN** — with a join code, any player can open any sheet (Adaeze, Theo).
- **Session log / recap** — where what happened goes (Rosa, Hal, Jess).
- **Export completeness + import** — items, spells, features, briefs (Dev, Hal, Rosa).
- **Accessibility** — 17 unlabeled fields on the character form, no landmarks
  on player pages, the tour and drawers don't move focus, no
  `forced-colors` CSS (Sam; the contrast token is fixed).
- **Ruler, player-side fog, ping** for the remote window (Theo, Priya).
- **OBS overlay mode** for the table (`?overlay=1`) (Bea).
- **HUD at 900 px**: END COMBAT clipped under the Cast tab (Theo, Priya).
- **"Run this fight" from the script's encounter flow** — scene two takes six
  clicks (Adaeze, Jess).
- **Guide videos** still black until played (Marcus).
- **Level PATCH doesn't recompute HP** (Dev).

## Pricing, after the pivot
With no generative AI there is nothing to gate. The twelve say what they'd
back: a table that works (Tom, Jess, Priya at $5 "if it means the thing keeps
working"). Patreon is support — Discord, credits, a say in the roadmap — and
the copy now says so. Nobody in either run would have paid for art.

## Caveats
Personal-mode deployment (any email signs in; AI was still on during the
test); headless Chrome throttles background tabs, so two testers' worst
latencies (a 15–20 s projector update, a 14 s first banner) are tooling
artifacts against six others' sub-second measurements; constructed testers
are thorough and consistent, and worse than real people at being surprised.
