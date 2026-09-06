# Persona test, run 2 — Priya Raman (online DM, Roll20 refugee, four players on Discord video)

Tested 2026-09-05, 20:46–21:12 CDT, against https://quest-lab-tau.vercel.app as `persona2-priya@questlab.test` (true first-run account). I built "Persona2 — Priya": one arc, one session, four PCs (two via the DM API, two through the unauthenticated join creator as a phone player would), a map from a public URL (`/demo-map.svg`, 2100×1500, grid 70) with three fog regions, one lit. Headless Chrome via puppeteer-core: the HUD at 1366×768, four `/table/<session>?pc=<id>` windows at 1366×768, four phones at 390×844@2x. Latency is my click in node → the SSE event stamped inside each player page → the DOM showing the change, polled over CDP so background tabs could not throttle it. AI budget: one brief (65 s), zero images, zero packs. Both campaigns (mine and the sample-night one) deleted at the end; every GET 404s.

## Since run 1

Last time I scored prep 2, said "maybe", and listed six things. Here is where they stand.

- **Remote-player window — fixed, and it is the thing I asked for.** `/table/<session>?pc=<id>` gave each of my four players a panel with the initiative order, a "· you" tag on their row, party HP bars, foes as "foe" with no HP (correct), condition chips and a roll log (priya_10_remote_initiative_round1.png, priya_17_remote_oren_round3.png). Four windows open at once, 1.1–1.3 s from navigation to panel. Each player can drag only their own token: Kavi's drag moved on the server (378,1185 → 515,1118) and reached the other three windows in 753–833 ms; dragging Mira's token from Kavi's window left it exactly where it was (priya_14_remote_player_dragged_own_token.png).
- **Party tokens in the fog — fixed.** "+ Party" from the HUD put all four at y=1185, x 378–672, inside the lit "Entry hall" (priya_08_remote_party_in_light.png); 139–216 ms to the four windows' SSE, 264–712 ms to their DOM.
- **Conditions not reaching the shared link — fixed.** Prone from the party card: her phone 659 ms (SSE) / 803 ms (banner), both remote windows 550–628 ms / 804–867 ms (priya_24_remote_mira_sees_tallow_prone.png, priya_25_phone_tallow_prone.png).
- **Dice result vanishes — fixed.** With the panel closed, a last-roll chip ("Tallow Underbough · STEALTH · 20") appeared in 409 ms and was still there at 20 s (priya_29_remote_panel_closed_roll_chip.png). With the panel open the log keeps 14 rolls.
- **No roll log — half fixed.** See Players' dice below: live viewers get it; the DM, the other phones, and anyone who refreshes do not.
- **N typing into notes — could not reproduce.** Focus on the body: N toggled the dock, typed nothing. Caret in notes: it typed, as it should. The guard in `frontend/src/components/dm/DmDock.tsx` (INPUT/TEXTAREA/contentEditable) is the right fix.
- **Regressed / new:** party-card HP changes do not push to the remote windows (bug 1). The board is still a ~240 px strip at 1366×768 with the dock open (priya_16_hud_midfight_1366.png).

## First five minutes

Welcome: 1,244 ms to network-idle, `load` at 358 ms (priya_01_welcome_1366.png). It says "online" once; still no "Discord" and no picture of a remote player's screen. Email → Enter → dashboard in 80 ms. The first-run tour fired this time (8 steps, priya_03_tour_step1.png). Guide: 848 ms; the sign-in copy now matches the sign-in page, and the "Remote players" note describes the window I tested (priya_04_guide_top.png). The Online paragraph still says "share the projector link"; it should say "send each player the 🗺 Table link from their sheet" — that is the one with the panel.

## The remote fight

Six in the order (four PCs, Ghoul, Drowned One), three full rounds, eighteen End Turns from the HUD, zero timeouts. Medians: End Turn → the remote window's "▶ name" 515 ms; → the next player's phone SSE 334 ms; → the phone's "It's your turn" banner 381 ms. Roll Init → the four windows' "Initiative" header 406–1,000 ms. The first-turn banner after Roll Init was the outlier: 14.2 s on the first sample (SSE arrived in 156 ms; the sheet took 14 s to show it), 1.7 s on a second sample. Worth one look — it is the moment the whole table is waiting on.

Do players know it is their turn without me saying so? Yes, twice over: the phone banner (priya_11_phone_your_turn_banner.png) and the gold "▶ Tallow Underbough" row on the window (priya_10). Three rapid −1 HP taps on Kavi's card all landed (12 → 9 on the server; Plan 82 holds), his phone got the push in 1.14 s — but neither remote window received any event in 12 s (bug 1). A DM token drag I could not measure: ＋ Add puts a foe in the tracker but never on the board (priya_09_hud_foes_added.png).

What players still lack: a ruler (the window has two controls — "Hide the panel" and the QR), fog of their own, and a ping (`POST /sessions/{id}/table/ping` is 401 for a player). The map is a small letterboxed strip in a 1366-wide window (priya_15_remote_mira_midfight.png).

## Players' dice

Each player tapped 🎲 → d20 → Roll on the phone (priya_18_phone_dice_tray.png). Every roll reached all four windows in 249–743 ms; the log shows roller, total and "1d20 [8]" (priya_19_remote_roll_log_after_4_rolls.png). But the HUD received no event — the DM does not see player rolls (priya_20_hud_after_player_rolls.png); the other phones received nothing; a window opened afterwards shows "Rolls land here as they happen" (priya_21_remote_late_joiner_log.png); and my `/dice-roll` broadcast reached the phones in 426–504 ms but never the windows. Two roll channels that do not meet. The phone tray is still die + a ± stepper: the "STEALTH · +3" came from the API, not a sheet button.

## Prep without a TV

"🎲 Run the sample night" landed me in a HUD with the script drawer open in 341 ms: four pregens, a staged map, a runbook with 3 scenes, 2 NPC dialogues, 1 encounter flow (priya_30_sample_night_hud_script_1366.png). I could run that tonight from the laptop. My own brief took 64.9 s but was good: a cold open I would read aloud, six beats, all four PCs by name, no owner-world names, and it obeyed my notes (ghoul, drowned thing, sluice gate). My session's script drawer falls back to the brief's cold open (priya_31_hud_my_brief_1366.png, priya_32_hud_my_script_drawer_empty.png). Prep from the laptop alone is now adequate; the 65 s wait needs a progress line.

## Bugs

1. **Party-card HP change does not reach the remote windows.** Repro: combat running; on the HUD party card tap "−1 HP" three times on Kavi. Expected: his phone and every `/table/…?pc=` window show 9/12 within a second. Actual: phone `pc.combat.updated` in 1,141 ms; the two remote windows got no SSE event and still showed 12/12 after 12 s (priya_26_hud_1366_after_hp_cond.png). The condition path from the same card does publish, so the damage path is missing the table publish. Look where `/characters/{id}/damage` updates the combatant versus `services/table_service.py` `initiative` (line ~276 reads combatant `hp_current`).
2. **＋ Add (tracker) does not place a foe token.** Repro: ＋ Add → Name "Ghoul" → + Add. Expected: Ghoul on the board. Actual: in the order, no token; `/table` tokens = four PCs (priya_09). A DM has to add every foe twice.
3. **Roll log is not shared with the DM, other phones, or late joiners.** Repro: player rolls from the phone; open the HUD and a fresh `?pc=` window. Actual: HUD receives nothing; new window says "Rolls land here as they happen". The log lives only in `TableView.tsx` state (`setRollLog`, capped at 14). Needs a server-side ring buffer in the projection.
4. **DM `/dice-roll` broadcasts do not appear in the remote window** (phones 426–504 ms; windows: nothing). Same split as bug 3.
5. **First "your turn" banner after Roll Init took 14.2 s** on one sample (1.7 s on the second); the SSE arrived in 156 ms.
6. **`/table/{session}` returns 200 with an empty projection after the campaign is deleted** (session, sheet, character 404 correctly). A player left on the link waits forever instead of seeing "this table is gone".
7. **Live board ~240 px tall at 1366×768** with the dock open (priya_16).
8. **Brief generation 64.9 s, no progress indication.**

## Scores (1–5)

- **Onboarding: 4.** Tour fires, guide copy matches the sign-in, sample night is one click; still no "Discord" on the landing page.
- **Table experience: 4.** Every DM action I timed reached four remote windows and four phones under a second, eighteen turns without a miss; loses a point for bugs 1 and 2 and the strip-sized board.
- **Player experience: 4.** The window I asked for exists and they can move themselves; the roll log's three holes and no sheet-driven rolls keep it from 5.
- **Prep: 3** (was 2). Sample night is real; the brief is good but slow; foes still need placing twice.
- **Value: 4.** Everything I used is free; the paid tier is the brief.

*Would you use it for your next session?* **Yes** — one session, next to Discord, with Roll20 open in another tab for the roll log.

*Would you pay?* $5 Hearth: **maybe** — for briefs like tonight's, once the roll log is shared. $12 Lantern: **no**, art is not my problem. $25 Table: **no**.

**The ONE thing:** one roll log, server-side, that the HUD, every phone and every remote window read from — with the sheet's skill and save buttons feeding it.

## Verdict

Last time I said turn the projector link into a remote-player window; you did, and it works at the speeds I measured — half a second from my End Turn to four windows and four phones, tokens my players move themselves. The remaining gaps are all one shape: things that happen on one screen and not the others (party-card damage, player rolls, my rolls, foes I add). Close that and I stop paying Roll20 for a chat box.
