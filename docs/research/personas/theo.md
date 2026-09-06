# Persona test, run 2 — Theo Lindqvist (fully online DM, Owlbear Rodeo + Discord, five players in three time zones)

Tested 2026-09-05, 19:55–20:17 on the test machine's clock (CDT), against https://quest-lab-tau.vercel.app in personal mode as `persona2-theo@questlab.test`. Built campaign "Persona2 — Theo": one arc, one session, three level-1 PCs (Ines the Halfling Rogue and Brother Alm the Human Cleric via the join creator's endpoint, as players would; Kettil the Goliath Fighter added by me), a battle map from a public image URL (1600×1000, 100 px grid), and a fight against a Toll-wight and a Drowned ferryman. Headless Chrome via puppeteer-core: projector at 1440×900, three player tabs (`/table/<session>?pc=<id>`: one 390×844 @2x phone, two 1366×768), my HUD at 900×768 to simulate a 1366-wide laptop with Discord on the right third. Pushes and DOM changes were timestamped in-page. AI budget: one brief, no images, no pack. Both campaigns (mine and the sample night's) deleted at the end. Scripts in `scratchpad/personas2/theo/`.

## Who I am and what I need

I am 38, a backend developer in Gothenburg, and my group has never sat in the same room: Lisbon, Toronto, two here, one in Manila at 6 a.m. We run theatre of the mind on a Discord call, an Owlbear Rodeo room when a fight needs a map, dice bots in the channel, sheets on D&D Beyond. Foundry was too much to host and too much to teach. What would make me switch is one link per player that shows the same map and initiative in their own browser, lets them move their own token, and reflects my changes in under a second, with no installs and no accounts. Anything that assumes a TV in the room is noise, because there is no room.

## First five minutes

`/welcome` 1.46 s cold, `/guide` 0.89 s (theo_01_landing.png, theo_02_guide.png). Headline: "A shared board on the TV. A living sheet on every phone." "In person, online, or both" is one clause in the sub-line; the bullets talk about scanning a QR "on the TV". Sign-in is an email box; I left `/welcome` 41 ms after Enter (theo_03_signin_typed.png). The eight-step tour fired (theo_05_tour_1.png); three of its steps say TV or projector. The guide has one paragraph for me, "🎧 Online: TV for the room, link for the remote players", plus a line about the 🗺 Table link with initiative, party HP and roll log. That is the whole pitch for my group and it sits in section 6 (dashboard: theo_06_dashboard.png).

## The remote-player window as the whole table

Setup through the API took under two seconds (every call 117–291 ms). The join page on a phone loaded in 0.99 s and asked for nothing but a name (theo_07_join_phone.png). Player tabs loaded in 0.7–1.3 s, the projector in 0.9 s.

What a player sees (theo_11_kettil_laptop_table.png, theo_10_ines_phone_table.png): the map with tokens and a right-hand panel with initiative, "▶" on the active combatant, "· you" on their row, party HP bars, foes as "foe" with no HP, condition chips, a Rolls section, and "Drag your own token to move. Only yours moves." On the phone the panel takes 86 % of the width and hides the map; you toggle Map ▸ / ◂ Order, which is why my players would use laptops.

DM action to the DOM changing on each remote tab (the API call is 120–210 ms of that):

| Action | Push arrives | Visible on tabs |
|---|---|---|
| I move the Toll-wight | +141…371 ms | 400 / 536 / 686 / 855 ms |
| Kettil 7 → 5 HP | +202…417 ms | 360 / 619 / 765 ms |
| Alm gets Prone | +211…291 ms | 366 / 561 / 710 / 857 ms |
| End turn (→ Toll-wight; → Kettil) | +259…369 ms | 374 / 511 / 810; 451 / 601 / 908 ms |
| Scene title change | +167…310 ms | 282 / 428 / 583 / 706 ms |
| Alm drags his own token (mouse up) | +450 ms | 658 / 811 / 945 ms on the others |

Each `table.updated` push triggers a 114 ms refetch; the tail is rendering five tabs on one machine. Under a second every time. Owlbear feels faster on drags because it streams positions; QuestLab commits on release and everyone sees the jump. Kettil's turn flips his panel row and fires a splash (theo_17_kettil_your_turn.png). Kettil dragging Ines's token did nothing: the token stayed at (400, 700), zero `/table/move` requests, and the server refuses by `ref_id` in `services/player_service.py::move_own_token` (theo_15_kettil_tries_ines_token.png). Projector: theo_16_projector_after.png.

Can we fight from this without screen-share? Almost. Missing, in order: a ruler (Owlbear's is the tool we use most), player-side vision (fog is DM regions, everyone sees the same reveal), a player-side ping, and a text channel; Discord covers the last. The 3D view (theo_31_3d_table.png) loaded in 343 ms and shows whose turn it is, but a player cannot move there.

## The roll log and dice

The sheet has a 🗺 TABLE link (theo_20_ines_sheet_phone.png) and a 🎲 that posts `/play/<pc>/roll`; the server rolled `[18] +3 = 21` and it landed on the projector and Kettil's tab in 354–372 ms: a die tumbles and a chip "Ines Varga · STEALTH · 21" sits bottom-left (theo_22_projector_dice.png); the panel logs "Ines Varga 21 · Stealth · 1d20 [18] + 3" (theo_23_kettil_panel_roll_log.png). The chip survived 12 s and a later table update. Reloading the tab emptied the log; it is React state only.

Rolling to the players as the DM is where it breaks. The HUD's "📣 Table roll" posts `/sessions/<id>/dice-roll`, which reaches the phone *sheets* (Ines's showed it 432 ms later) but never the table windows or projector, which only listen for `table.roll`. And the HUD never shows a player's roll, so with no TV I must keep a table tab open beside the HUD to see that Ines rolled 21. Three surfaces, three logs, none persistent. A Discord dice bot is one log everyone reads.

## Running the whole night with no TV

At 900×768 the HUD fits without horizontal scroll (page height 1018 px) and the party cards, combat panel and map tab are all reachable (theo_12_hud_900x768.png, theo_26_hud_900_default.png). Two problems: "END COMBAT" is clipped under the floating "🎭 Cast" tab, and the tour's "📺" button does not exist; the HUD has "🗺 Table" and "📱 QR → projector". N opened notes (theo_27_hud_900_notes.png); 🎬 Script opened with "No runbook generated yet" (theo_28_hud_900_script.png); the 420×700 pop-out notes window (theo_29_notes_popout.png) would park nicely over Discord. "Run the sample night" reached a HUD in 352 ms with four pregens, a staged map and a three-scene runbook with decent read-aloud text (theo_30_sample_night_hud_900.png). The AI brief matched my session title: usable, not essential.

## Latency and reliability

No 5xx in roughly forty page loads and forty API calls. Cold context: projector DOMContentLoaded 251 ms, first token painted 968 ms; a phone sheet 1.62 s. Closing Kettil's tab and reopening: 1.37 s load, SSE open at +620 ms. The offline test was inconclusive: Chrome's offline mode blocked fetches but not the open SSE socket; the change appeared 124 ms after reconnect via React Query's refetch-on-reconnect, and I could not provoke `useEventStream`'s 4 s retry. A join code made the join list return 403 `join_code_required` for strangers while sheet and table links kept working, the right split; by default the list is open. After delete, `/table/<session>` still returns 200 with an empty scene.

## Bugs

1. **DM's table roll never reaches the table windows.** Repro: open `/table/<s>?pc=<id>`, then `POST /sessions/<s>/dice-roll` (HUD 📣 Table roll). Expected: appears in the Rolls panel. Actual: nothing; only sheets get `dice.rolled`. `frontend/src/pages/TableView.tsx` listens for `table.roll` only; the broadcast in `services/session_service.py` publishes to PC topics. theo_23_kettil_panel_roll_log.png.
2. **Player rolls never reach the HUD.** Repro: roll from a sheet with the HUD open. Expected: DM sees "Ines Varga 21 Stealth". Actual: no `table.roll` on the HUD (`frontend/src/pages/SessionHud.tsx`, `useEventStream` scopes).
3. **Roll log not persisted.** Reload any table tab, log is empty (`rollLog` state in `TableView.tsx`; no endpoint for past rolls).
4. **HUD at 900 px: "END COMBAT" clipped under the 🎭 Cast tab.** theo_12_hud_900x768.png.
5. **Tour vs HUD copy:** step 7 says "📺 opens the TV link"; no 📺 control exists. theo_05_tour_1.png, theo_26_hud_900_default.png.
6. **Deleted table answers 200** with an empty projection, so a dead player link says "Waiting for the DM" forever (`services/table_service.py::get_projection`).

## Scores (1–5)

- **Onboarding 3** — one keystroke to sign in and the tour fires, but every third sentence is about a TV I do not have.
- **Table experience 4** — sub-second sync on every action I measured, own-token drag enforced server-side; no ruler, no player vision.
- **Player experience 4** — one link, no account, initiative + HP + conditions + own roll in one window; on a phone it is panel-or-map.
- **Prep 3** — map from a URL and a fight in two calls; runbook and brief are fine, not why I would come.
- **Value 3** — replaces Owlbear plus half of D&D Beyond for a level-1 party, not the dice bot.

*Next session?* **Maybe.** The fight loop works and my players need zero setup; I would still run Discord dice because of bugs 1–3, and miss the ruler within ten minutes.

*Would you pay?* $5 Hearth: **maybe**, once the roll log is one log; the free table is the value. $12 Lantern: **no**, art does nothing on a call. $25 Table: **no**.

**The ONE thing:** one roll log. DM rolls and player rolls in the same list, shown in the HUD, the table windows and the sheets, surviving a reload. Once the dice are in Discord, the map may as well be in Owlbear.

## Verdict

As a remote-player window this is already what I asked for: players open a link, see the map, the order, their HP and conditions, drag their own token and nobody else's, and my changes land in 0.3–0.9 s with no installs. That is more than Owlbear gives me free, and it is welded to a sheet, which Owlbear never will be. What stops me switching is not polish: the dice are split three ways, the DM is blind to player rolls, and there is no ruler. Fix the rolls, add a ruler, put "Discord call, one link each, no accounts" above the fold, and I would run the Manila session on it next month.
