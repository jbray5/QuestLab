# The Six-DM Field Test (2026-09-05)

Six constructed Dungeon Masters, each grounded in what real DMs say they need
(EN World and D&D Beyond forum threads on TV-table and hybrid play, busy-DM VTT
comparisons, the AI-ethics discourse; Reddit blocks the crawler), each ran the
live app end to end in a throwaway campaign and wrote a report in their own
voice. Reports: [personas/](personas/). Published page: The Six-DM Field Test
artifact (link in the session).

## The read
- **What lands:** the live table. Damage to a phone in 0.4–0.6 s, a map to a
  remote screen in 0.3 s, the "IT'S YOUR TURN" banner cited by five of six.
- **What blocks:** trust bugs, not missing features. 6/6 hit the campaign
  delete 500; 4/6 a silent dead Next in the creator; 4/6 the board shrinking to
  a sliver at laptop size.
- **Who it's for:** the in-person / hybrid table with phones and a TV. That
  segment scored highest and said "maybe" for its next session. Online-only
  groups and power users named specific gaps.

## Scores (1–5)
| Persona | Onboarding | Table | Players | Prep | Value | Next session | $5 · $12 · $25 |
|---|---|---|---|---|---|---|---|
| Marcus (in-person purist) | 3 | 4 | 4 | 3 | 4 | maybe | no · no · no |
| Priya (online, Roll20) | 3 | 3 | 4 | 2 | 4 | maybe | no · no · no |
| Dev (Foundry power user) | 4 | 3 | 4 | 2 | 3 | no | no · no · no |
| Jess (new DM) | 2 | 3 | 3 | 2 | 4 | maybe | maybe · no · no |
| Tom (busy hybrid) | 4 | 3 | 4 | 3 | 3 | maybe | yes · no · no |
| Rosa (worldbuilder) | 2 | 2 | 3 | 3* | 2 | no | maybe · no · no |
| **Average** | 3.0 | 3.0 | 3.7 | 2.5 | 3.3 | 0 yes · 4 maybe · 2 no | 1 yes 3 maybe · 0 · 0 |

*Rosa's "world tools".

## What broke (how many hit it)
- Campaign delete → 500, half-cascade — 6/6
- Creator: Next disabled with no reason — 4/6
- Guide "Continue with Discord" vs email sign-in — 4/6
- Live board a sliver at laptop heights — 4/6
- Join page lists every sheet to anyone with the link — 4/6
- Uploaded map arrives gridless — 3/6 · black video posters — 3/6 · tour spotlights an empty sidebar, AI-heavy copy — 3/6
- Conditions don't reach the table/phone via the strip path — 2/6 · foes don't land first try — 2/6 · hex grid on square maps — 2/6 · no roll log — 2/6

## Fix list
**P0 (trust, days):** transactional campaign delete; board min-height at laptop sizes + strip auto-collapse; conditions publish to table stream and phone from every path; refetch combat before placing foes, queue rapid HP taps; creator counters/reasons, class-aware standard array; Session Pack never pulls custom monsters from other campaigns, creates the antagonist it names, no AI art by default, text defects; scrub owner-world placeholders (Thane, Restwater, Auntie Sorrel), guide sign-in copy follows providers, real video posters, QR retires when a map is staged, grid inferred on upload.
**P1 (conversion, weeks):** "Run tonight" page for the sample campaign; remote-player window (initiative, HP, names, roll log, move own token); NPC record as source of truth (reveal state on cards, table panels fall back to prep fields, briefs may not contradict stored secrets); join code / claim-your-sheet; tour rewrite, sidebar from URL, campaign-level encounters route, class placeholder avatars.
**P2 (depth):** Channel Divinity uses, Human skill loophole, long-rest residue, Elf traits, kit armor in catalog, 2024 monster blocks, typed combat_state, campaign export/import.

## Pricing finding
Nobody would pay for art. Four of six would pay $5 for four different things
(packs, briefs, keeping the table free + a roll log, export). $12 and $25
converted no one. **Move Session Packs (text) into the $5 Hearth tier** with a
lower cap; keep Lantern as the art tier.

## Opportunities
- **Practice Arena** (player-side): a player at the owner's table spent four
  days practising his paladin in a chat, pasting his sheet by hand. Start from
  the real sheet, derive legal actions per turn, keep the math server-side,
  debrief at the end.
- **Remote-player window**: the same screen Priya, Tom and Dev described.

## Caveats
Shared owner account (personas saw each other's characters; no true first-run
tour); personal-mode deployment (the "email is the key" objection is a flag,
not the public build); two personas' automation stalled on heavy 3D pages,
timings are from clean runs; constructed DMs are thorough and consistent, and
worse than real people at being surprised.
