# Persona test, run 2 — Bea Marsh (31, actual-play streamer, in-person cast of four, small loyal Twitch chat)

Tested Saturday 2026-09-05, 19:58–20:15 CDT on the live app as `persona2-bea@questlab.test` (true first-run account). One campaign, `Persona2 — Bea`: four PCs, one arc, one live session, a public-domain map staged from a URL (Wikimedia's Powis Castle plan) with three fog regions, and a seven-combatant fight. API for setup and DM actions; headless Chrome captures at 1920×1080 (the table, as OBS sees it), 390×844 @2x (phone), 1440×900 (DM pages) and 1366×768 (HUD). AI budget: one text NPC (14.1 s), zero images. Campaign deleted at the end (204 in 0.43 s; `/play/<pc>` 404s afterwards). Screenshots are `bea_NN_*.png`.

## Who I am and what I need

I stream a weekly in-person game with a camera on the table and a second capture of "the table screen", and my chat notices a clunky die before I do. AI-generated art is a hard no on my channel: it gets called out within seconds and costs me viewers, so anything that puts it on screen by default is disqualifying. What I want from a table screen is spectacle that reads at 1080p from across a room: the map reveal, the turn banner, a player's die landing with their name on it, a foe going down. Nothing DM-only may ever be in frame, and a join QR on stream is a real privacy question. And I want to know whether I can point an OBS browser source at it and forget about it.

## First five minutes

Landing at 1440×900 (`bea_01_landing_1440.png`, `bea_01b_landing_full.png`): TTFB 102 ms, DOM ready 280 ms, network-idle 1.1 s. "Free, forever, for the table", and under the reel "Maps drawn by code in an ink style. No AI art." Email box (`bea_02_signin_box.png`), Enter, dashboard in under 3 s (`bea_03_dashboard_first.png`). The tour fired on first sign-in, eight steps; step one says "None of it needs AI" (`bea_04_tour_step1.png`). The guide loaded in 0.97 s (`bea_05_guide_top.png`); its two "Watch it done" videos are still black boxes. The posters are near-black frames with clipped text.

## The table on camera

Idle with the QR up (`bea_10_tv_idle_qr.png`): a big cream code, "Scan to join the party". It encodes `/join/<campaignId>` with no code. Without a join code that is the whole roster and every sheet; with one set (Characters page) the join page asks first (`bea_45_join_with_code.png`) and the API refuses the roster without it or with a wrong one (403, 403, roster with the right code). A QR on stream is fine only with a join code, and nothing near the QR button says so. With the QR off, "No map on the table" sits mid-frame (`bea_11_tv_idle_noqr.png`).

Map reveal: staging reached the TV in 315 ms; the "YOU HAVE ARRIVED / Powis — Lower Ward" card (`bea_13_tv_map_fogged.png`) is big gold serif. Fog (`bea_14_tv_fog_reveal_outer.png`, `bea_15_tv_fog_reveal_hall.png`) has a soft feathered edge, but it is 94% opaque, so the plan is faintly legible through it, and tokens draw above it: my Gargoyle and two Smugglers sat in an unrevealed region at full brightness with name plates. The 3D board (`bea_31_tv_3d.png`) paints the unrevealed region opaque black.

Turn banner: End Turn to "YOUR TURN / Kestrel Vane" in 430 ms (`bea_17_tv_turn_banner.png`), a dark band bottom-left, name about 60 px tall; reads across a room. Foe down: PATCH to projection in under 1.4 s (polled once a second); red X and greyed plate (`bea_27_tv_foe_down.png`).

Legibility: token letters 36 px, name plates 15 px text; a size-1.5 token gets 54/21 px. Plates are marginal on a TV across a room; default PCs to 1.5. DM-only text: none; `?panel=1` (`bea_28_tv_panel_view.png`) shows party HP and "foe" for monsters, and clips the title card.

## The AI-art question

Where AI art is offered: the NPC card's "🎨 Generate Portrait", the player's `/play/<pc>/character` page, monster portraits and figures, battle-map backdrop/terrain/props, the players' forge. Every one is a button behind a 402 paywall (`frontend/src/components/PaywallModal.tsx`); nothing generates unasked. The DM's Characters page is upload-or-URL only (`bea_40_characters_page.png`), the phone sheet shows a class emoji placeholder (`bea_44_phone_sheet_full.png`), and my generated NPC came back `portrait_url: null`, `is_revealed: false`, invisible to `/play/<pc>/npcs` and to the table. I ran the whole night with zero AI pixels on screen.

Two exceptions. The sample campaign: `services/onboarding_service.py` says it outright ("SRD monsters and AI-generated art only", line 6; "AI-generated map from the demo world", line 182), a watercolour village green my chat would clock instantly, and "🎲 Run the sample night" is the big button on my dashboard. And the landing page's cockpit still (`bea_01b_landing_full.png`) shows a sidebar reading "AI Campaign Planner" and the same pixel wizard for a fighter, a rogue and a cleric. The reel and tavern stills look procedural and I believe them; the stale cockpit and the unlabelled sample map are the two screenshots a sceptic would post.

## The physical dice moment

Phone (`bea_20_phone_dice_tray.png`): d4–d100, a modifier, "Shake your phone to roll the d20!" with a tap fallback. Tap to die on the TV: 305, 487 and 260 ms over three throws. The die tumbles 2.1 s (`bea_21_tv_dice_tumble.png`), lands face-up, a gold plate stamps "D20 13 + 5 = 18" at 37 px and clears at 5.4 s (`bea_22_tv_dice_landed.png`); the phone says "13 + 5 — it landed on the table ✨" (`bea_23_phone_after_roll.png`). Unlike a dice-roller overlay, it lands on the map with the player's name. But the caption "Kestrel Vane rolls d20" is thin light italic with no plate and is unreadable over a bright map. The last-roll chip (`bea_24_tv_last_roll_chip.png`) is 187×54 px, 24 px total, 15 px name, and the 📱 QR chip overprints the K of Kestrel. My own rolls never reach the stream: the HUD's "Table roll" went to the phones ("DM'S ROLLS · Gargoyle claw · 17", `bea_26_phone_after_dm_roll.png`) and nothing appeared on the TV (`bea_25_tv_after_dm_roll.png`).

## Overlay potential

The page is `position: fixed; inset: 0`, so a browser source of any size fills it and letterboxes the map (`bea_30_tv_720p.png`). No auth: the session UUID is the key. Refresh keeps map, fog, tokens and turn state (`bea_29_tv_after_refresh.png`); the roll log and chip are client memory and vanish. There is no roll-log-only view; `?panel=1` is a 300 px side panel on the full board. The background is an opaque gradient, so it cannot sit over my camera feed without a key. Yes as a full-frame table-screen source; no as an overlay.

## Bugs

1. **Fog does not hide tokens (2D).** Foes in an unrevealed region. Expected: hidden. Actual: full-brightness tokens and labels over 94% fog (`bea_14_tv_fog_reveal_outer.png`). `frontend/src/components/table/MapCanvas.tsx` line 13 ("feathered fog → tokens"), fog rect `fillOpacity="0.94"` ~lines 239–249.
2. **Last-roll chip collides with the QR chip** (`bea_24_tv_last_roll_chip.png`). `frontend/src/index.css` `.ql-last-roll` (18 px, z 25) vs `JoinQr.tsx` `.qjqr-chip` (14 px, z 60).
3. **DM table rolls never reach the projector.** POST `/sessions/<id>/dice-roll`. Actual: phones only (`bea_25`, `bea_26`). `services/session_service.py` `broadcast_dice_roll` publishes to PC topics; `services/player_service.py` `throw_dice` uses `publish_table_roll`.
4. **Dice caption unreadable on bright maps** (`bea_22_tv_dice_landed.png`). `DiceCinematic.tsx` `.ql-dicecine-name`: #cfc2a4 italic, shadow only.
5. **Guide posters are black frames** with clipped text (`bea_05_guide_top.png`).
6. **Landing cockpit still is stale**: "AI Campaign Planner" sidebar, one wizard avatar for every class (`bea_01b_landing_full.png`; `Welcome.tsx` `STILL.cockpit`).
7. **Join code field clips**: `BEA4CAST` shows as `BEA4CAS` (`bea_40_characters_page.png`; `Characters.tsx` ~line 260).
8. **Sample night ships an AI map unlabelled** (`onboarding_service.py` lines 6, 182) under a landing page that says "No AI art".
9. **Idle text** "No map on the table" mid-frame with the QR off (`bea_11_tv_idle_noqr.png`); and a deleted session's table URL still answers 200 with an empty scene (`services/table_service.py` `get_projection`).

## Scores (1–5)

- **Onboarding: 4** — under 3 s to a dashboard and an honest "none of it needs AI" tour; black guide videos.
- **Table experience: 4** — 260–490 ms phone-to-TV, banner in 430 ms, all of it reads at 1080p; fog leaks tokens, two chips collide.
- **Player experience: 4** — the shake tray and "it landed on the table" are the beat a cast wants.
- **Prep: 3** — a URL map with fog regions took one call and the HUD Maps tab just worked; I did not test packs or the creator.
- **Value: 4** — the whole table screen is free and I never met a paywall I did not ask for.

*Would you use it for your next session?* Maybe: as the table-screen capture, once I have set a join code and kept foes out of the fog myself; not as an overlay. *Would you pay?* $5 Hearth: maybe, as a tip for keeping the table free, not for text AI I will not use on air. $12 Lantern: no, art is the thing I cannot show. $25 Table: no. **The ONE thing:** a transparent, fixed-size overlay mode (`/table/<id>?overlay=1`) with the dice cinematic, the turn banner and a persistent roll log including the DM's table rolls, nothing else, so it drops onto my camera feed in OBS.

## Verdict

The spectacle is real and fast: a die thrown from a phone is on the shared screen in a third of a second with a name on it. Nothing DM-only leaks, the QR is safe once you know to set a code, and I ran a full sequence without a single AI pixel. What keeps it off air tomorrow is small and specific: fog that hides the floor but not the monsters, a dice caption I cannot read on a bright map, my own rolls never reaching the board, and two marketing images that hand my chat the screenshot they want. Fix those and give me an overlay mode, and this is the first table screen I would trust in front of an audience.
