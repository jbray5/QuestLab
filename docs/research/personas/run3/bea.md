# Persona test, run 3: Bea Marsh (actual-play streamer)

Tested Saturday 2026-10-31 on the local build (`localhost:5173` / `:8000`) as `persona3-bea@questlab.test`, signed up through my invite link (`QL-GEBVZA`). I ran the sample night, then made my own campaign, `Persona3 — Bea: Saturday Stream`, with a level-1 Bard and a level-5 Fighter from the guided wizard, a session, and a map with tokens. I captured headless Chrome at 1920×1080 and 1280×720 (what OBS sees), 1280×800 (DM pages) and 390×844 @2x (phone). I sent one Send feedback note.

All screenshots are in `F:\Temp\claude\c--Users-justi-OneDrive-Projects-questlab\f74a91d3-757b-451c-8465-a81ce92909b9\scratchpad\personas3\bea\shots\` (named `bNN_*.png` below).

## 1. Who I am

I stream a weekly in-person game with a camera on the table and a second capture of the table screen. My chat notices a clunky die before I do. AI-generated art is a hard no on my channel: it gets called out within seconds and costs me viewers. Anything on that screen has to read at 720p and look like a person made it.

## 2. Since last time

**Fixed, and they were the ones that mattered to me:**
- **The sample night's map.** It was a watercolour AI village green; now it's a pen-and-ink map drawn by code (`b12_tv_idle_1920.png`; `scripts/procgen_ink_maps.py`, Plan 86).
- **The landing cockpit still** with "AI Campaign Planner" in its sidebar is gone. `/try` has no `<img>` or `<video>` at all now; the night scene and the mock cards are drawn in the page.
- **Every generate button is gone.** I looked on the HUD, the character pages and the phone and found nothing that makes art or text.
- **The dice caption** "Tessa Quickfoot rolls d20 — Dagger attack" now sits on a dark pill, so it reads over a bright map (`b22_tv_roll_1920_1000.png`). Last time it was thin italic with no plate.
- **The last-roll chip survives a TV refresh.** A freshly loaded table page shows "Tessa Quickfoot · Dagger attack · 8".
- **Chip collision gone.** The last-roll chip and the QR glyph are in opposite corners now.

**Worse:**
- **The HUD's "Table roll" now fails with Internal Server Error.** Last time it at least reached the phones; now nothing reaches anything (bug 2).
- **The die can show the wrong number.** Plan 80 dropped the stamp over the die, so the landed face is the only number on it, and the camera angle makes the wrong face the big one (bug 1).

**Still the same:**
- No overlay mode.
- Tokens on the TV are letters.

**Not retested:** the fog-hides-tokens issue from run 2.

## 3. First five minutes

- **`/try`** reached network-idle in 1.5 s at 1080p (`b01_try_1920.png`, full page `b01b_try_full.png`). It's a lantern-lit house on a hill over a lake, trees and fireflies, all flat shapes. Nobody in my chat will call that AI: it looks like a designer's vector scene, because it is one.
- **The invite link** greeted me by name: "You're invited to the QuestLab beta, Bea. Create your account below and the invite comes with you." (`b05_welcome_invite.png`). Name, email, password, Enter: on the dashboard in 0.19 s.
- **The first tour step** says "There is no generative AI in it." (`b07_dashboard_first.png`). The friends-beta checklist ("0 of 5 done") is clear, and "Tell Justin how it went" is a nice human touch.
- **"Run the sample night"** dropped me on the HUD in 2–4 s, with the ink map already live on the table.

One mixed message: the landing's header button says "Join the beta", but the bottom card says "The beta is coming. Leave an email and you'll be first in." (`b01b_try_full.png`).

## 4. The AI hunt (what my chat would screenshot)

Page by page:
- **`/try` and `/welcome`:**
  - No raster art at all. The scene is CSS/SVG; the "screenshots" are live HTML cards with fake parties (Sable Quickstep, Bram Oakhelm).
  - `/welcome` floats a few die numbers (6, 16, 4, 20) as decoration.
  - Clean.
- **The dashboard and campaign pages:** no art. Characters without a picture get a crest, or initials if there's no class.
- **The class crests** (`b15_hud_fight.png`, `b37_own_hud_1280.png`):
  - Crossed swords for the Fighter, a lyre for the Bard, a wizard's hat, a hooded rogue.
  - Crisp single-colour silhouettes on a dark tile.
  - Terms credits them to Lorc and Delapouite at game-icons.net, CC BY 3.0, "drawn by people, not generated". Gamers know game-icons.net on sight; that credit line will shut down any "is that AI?" in one link.
  - These are the best thing in this build for me.
- **The sample map:**
  - Pen-and-ink parchment, scalloped trees with hatching, a river, a plank bridge.
  - It reads as procedural: the trees are visibly the same shape repeated. "Clip-arty" is the worst a viewer could say, not "AI".
  - The generator script is in the repo, which is the best possible receipt.
- **The copy's tone:**
  - Plain and warm, and it doesn't oversell. But the rhythm is what chat calls "ChatGPT voice": stacks of short paired lines ("Run the table. Tell the story." / "Minutes to the first roll. Nothing to refresh. One screen to run from.").
  - There are em dashes everywhere: Terms, the HUD notes placeholder ("Tonight's notes — what happened, what they said, what you owe them next time"), and "Roll for the table — every player's phone shows the result".
  - None of that is evidence of anything. But a hostile chat goes for the cadence first, then asks who wrote it.
  - The sample adventure's prose ("The kettle on the hearth has not gone cold in forty years…", Aldous Fenwright "hasn't slept in three days") is good, and someone will ask whether a person wrote it. The sample used to ship AI art, so have that answer ready.

**The disclosure:**
- On `/try`, under "No AI art. No AI-written story.", in small grey text: "Honest note: it's built by a developer who uses AI coding tools to write the software, as most developers do now. Nothing in the app itself generates anything."
- Terms #no-ai expands it: AI assistants help write and test the code, "a person reviews and tests every change, and nothing in the app you use runs a model" (`b03_terms_noai.png`).

**Would my chat accept it?** Mostly yes, and I'd much rather have it than not. The repo is public and the commits are co-authored by an AI assistant, so somebody would find that within a week. Saying it first turns a gotcha into a shrug. The people who come after AI art care about stolen art and slop writing, and this draws the line in exactly that place.

Two edits would make it bulletproof:
1. Drop "as most developers do now". It reads as a defensive shrug, and it's the phrase that gets clipped and mocked.
2. Add one sentence saying who made the words and pictures, e.g. "Every word on these pages and in the sample adventure was written by a person; the maps are drawn by code; the class icons are by game-icons.net artists." That covers the copy-tone and sample-prose questions before they're asked.

## 5. The TV view on stream

**Readability:**
- The map is letterboxed with black bars at both sizes (`b12_tv_idle_1920.png`, `b38_own_tv_1280.png`), which is fine for a full-frame capture.
- Token letters render 44 px tall at 1080p and 29 px at 720p, so they read.
- Name plates render 17 px at 1080p and 12 px at 720p (`b16_tv_turn_1280_a.png`, `b38_own_tv_1280.png`). At 720p "Brother Aldous" is a grey smear.
- The title card ("Saturday at the Mill", big Alegreya over the map) is lovely and reads at any size.

**Tokens:**
- The TV still draws letters, not the crests. The sample party shows "B, L, T, B": Bram and Brother Aldous are indistinguishable across a room (`b12_tv_idle_1920.png`).
- The crests are right there on the HUD. Putting them on the tokens would make the TV look as good as the DM screen.

**Turn order:**
- "Start the fight" put a banner on the TV within 0.45 s: a letterspaced "YOUR TURN" eyebrow, then "Lira Vell" in light Plex about 50 px tall at 1080p (`b14_tv_fight_1920_1.png`).
- The banner lives about 2.6–3.2 s, then clears (sampled every 0.5 s at 720p).
- It's a dark band across the lower third of the board, and it covers the token row. At 720p it sits right over the four name plates (`b16_tv_turn_1280_a.png`).
- The TV has no persistent initiative strip, so once the banner fades, a viewer who looked away can't tell whose turn it is.

**Rolls landing:**
- I rolled from Tessa's phone: Roll on Dagger, then "Roll it".
- The die was tumbling on the TV by the 1 s capture. The pill caption names the roller and the attack.
- A gold-rimmed plate stamped "D20 3 + 5 = 8" at about 2 s (`b22_tv_roll_1920_2000.png`).
- By about 3.5 s the die and plate were gone; only the small corner chip remained (`b22z_3200_crop.png`). The result is on screen for about a second and a half, which is a short beat for a stream.
- The plate also lands on top of the roller's own token: it covered Tessa's "T".

**The clunky moment:**
- Zoomed in (`b22z_die_crop.png`), the landed d20 has a big "6" on the face toward the camera, and a smaller "3" on the top face jammed against it.
- The result was 3. The die is showing the right face per the code (result face up, `Dice3D.tsx` ~line 220), but the camera sits at about 52° (`camera.position.set(0, 7.2, 5.6)`), so the front face is bigger and brighter than the top face.
- My chat will type "it rolled a 6??" or "36 lol" before the plate even arrives. That's the exact thing they notice before I do.

**The DM's roll:** HUD → Table roll → d20 gave "Internal Server Error" in the panel and a red toast, and nothing on the TV (`b24_hud_after_tableroll.png`, `b25_tv720_dm_roll_1500.png`).

**Polish:**
- Motion is smooth and the timing is snappy.
- The QR overlay ("Scan to join the party", cream code, `b27_tv_qr_1280.png`) is big and clean.
- There's a 📱 emoji glyph in the bottom-left corner of the TV at all times (`b12_tv_idle_1920.png`). On stream it's a stray emoji in a no-emoji design.
- "YOUR TURN" is letterspaced caps, and so is the tour's "STEP 1 / 8", in a house style that says no all-caps.

## 6. Crests instead of art (my two new characters)

**The wizard:**
- It's fast and genuinely good. Every step explains itself ("Level 5: proficiency bonus +3, and Ability Score Improvements to choose"), and the review shows its maths ("Levels 2–5: 4 × (6 + Constitution +1) = 28; Dwarven Toughness +5").
- The improvement step for the level-5 Fighter is clear: popular feats for a Fighter, then "+2 to one / +1 to two" (`b29_fighter_06.png`, `b34_fighter_asi_done.png`).
- Wren the Bard (Halfling, Acolyte): HP 10, AC 12, CHA 16 (`b31_bard_review.png`).
- Garrick the Fighter (Dwarf, Acolyte): HP 44, AC 16, STR 17 after +2 (`b35_fighter_review.png`).

**But the "rules-checked" builder let three things through without a word:**
1. **Wren has no spells.** The review says "Spells: None yet" and `spells_known` is null. Next never blocked: the Spells step shows 33 chips and no hint (`b40_bard2_spells_2500.png`). Entering that step first flashes the whole wizard to "Opening the character builder…" (`b29_bard_06.png`, `b40_bard2_spells_300.png`).
2. **Both have "Magic Initiate" from Acolyte, and neither was asked for its spells.** The Fighter's Spells step says "A Fighter doesn't cast spells, so there's nothing to pick here. Tap Next." (`b40_fighter_spells_2500.png`).
3. **A level-5 Fighter with no subclass.** `subclass` is null, and the review doesn't mention it.

**On the HUD** (`b37_own_hud_1280.png`): the swords and lyre crests sit on the party cards and look deliberate and handsome. Nobody would think "missing picture".

**On the TV** (`b38_own_tv_1280.png`): they're "G" and "W" in gold-on-black circles. Fine, but generic. The crest is the part I'd want on stream.

**On the phone:** Tessa's sheet header shows the hooded rogue crest (`b26_phone_after_dm_roll.png`). The roll sheet is excellent: "1d20 +5 · shows on the TV", "+5 is your Dexterity +3 plus +2 because you're trained with it", then "8. The DM will tell you whether 8 hits", and an "Add Sneak Attack +1d6" checkbox.

## 7. Bugs (ranked by how much they'd hurt at my table)

Screenshot folder: `F:\Temp\claude\c--Users-justi-OneDrive-Projects-questlab\f74a91d3-757b-451c-8465-a81ce92909b9\scratchpad\personas3\bea\shots\`

1. **The TV die shows the wrong number to the camera.**
   - Repro:
     1. Dashboard → Run the sample night.
     2. Open `/table/<session>` at 1920×1080.
     3. Open Tessa's `/play/<key>` on a phone → Roll (Dagger) → Roll it.
     4. Look at the TV about 2 s later.
   - Expected: the number the die shows is the result.
   - Actual: the result 3 is on the top face, foreshortened. The face toward the viewer reads "6" and dominates, so it reads as 6 or "36".
   - Screenshots: `...\shots\b22z_die_crop.png`, `...\shots\b22_tv_roll_1920_2000.png`.
   - Cause: `frontend/src/components/table/Dice3D.tsx` lays the result face up (~line 220) under a camera at (0, 7.2, 5.6). Either point the result face at the camera or look more nearly straight down.
2. **The HUD's "Table roll" returns 500, and DM rolls never reach the TV.**
   - Repro: sample HUD → Table roll → d20.
   - Actual: "Internal Server Error" in the panel, an error toast, and no die on the TV.
   - Also reproduces with curl: `POST /api/sessions/<sid>/dice-roll` with `{"label":"1d20","total":14,"detail":"[14]","roller":"DM"}` gives HTTP 500.
   - Screenshots: `...\shots\b24_hud_after_tableroll.png`, `...\shots\b25_tv720_dm_roll_1500.png`.
   - The code path is `services/session_service.py` `broadcast_dice_roll` (publishes to the phones, then `publish_table_roll`).
3. **The wizard creates spell-less casters, ignores Magic Initiate, and skips the subclass.**
   - Repro:
     1. Characters → Add character.
     2. Level 1, Halfling, Bard, first background (Acolyte), standard array, 3 skills.
     3. On Spells, tap Next without picking: allowed. Create.
   - Same with a level-5 Dwarf Fighter: no subclass prompt, and Magic Initiate gets no spell step.
   - Screenshots: `...\shots\b31_bard_review.png`, `...\shots\b40_bard2_spells_2500.png`, `...\shots\b40_fighter_spells_2500.png`, `...\shots\b35_fighter_review.png`.
4. **The Spells step blanks the wizard to "Opening the character builder…" for up to about 2 s.** A quick tapper hits Next on a half-loaded step, which is how my Bard got through.
   - Screenshots: `...\shots\b29_bard_06.png`, `...\shots\b40_bard2_spells_300.png`.
5. **TV tokens are letters, and same initials collide.** The sample shows two gold "B"s (Bram Oakhelm, Brother Aldous). The crests exist and should be on the tokens.
   - Screenshot: `...\shots\b12_tv_idle_1920.png`.
6. **The turn banner and the roll plate cover the tokens.**
   - The banner band hides the party row for about 3 s, worse at 720p.
   - The result plate lands on the roller's own token.
   - There's no persistent "whose turn" on the TV after the banner fades.
   - Screenshots: `...\shots\b16_tv_turn_1280_a.png`, `...\shots\b14_tv_fight_1920_1.png`, `...\shots\b22_tv_roll_1920_2000.png`.
7. **Name plates are unreadable at 720p** (12 px rendered text).
   - Screenshot: `...\shots\b38_own_tv_1280.png`.
8. **The roll beat is short.** The result plate is up for about 1.5 s, and the die is gone by about 3.5 s.
   - Screenshot: `...\shots\b22z_3200_crop.png`.
9. **Style slips on stream.**
   - A 📱 emoji sits in the TV's corner at all times.
   - "YOUR TURN" and "STEP 1 / 8" are all-caps.
   - Screenshots: `...\shots\b12_tv_idle_1920.png`, `...\shots\b07_dashboard_first.png`.
10. **The sidebar shows "Signed in as dm@questlab.local" on my account.**
    - It happens in any browser context opened with only the `ql_token`, and it persisted even after I set `dm_email` in localStorage.
    - `/api/auth/me` correctly says `persona3-bea@questlab.test`.
    - The label comes from `useAuthStore` with the `VITE_DM_EMAIL` dev fallback (`frontend/src/api/client.ts` line 37), not from `/auth/me`. It's probably dev-only, but it's someone else's email on my DM screen.
    - Screenshots: `...\shots\b15_hud_fight.png`, `...\shots\b37_own_hud_1280.png`.
11. **The landing contradicts itself:** "Join the beta" in the header, "The beta is coming. Leave an email" at the bottom.
    - Screenshot: `...\shots\b01b_try_full.png`.
12. **The local build's sample map loads from production** (`image_url` = `https://quest-lab-tau.vercel.app/sample/mill-road.jpg`, via `public_web_url()` in `services/onboarding_service.py`). It's harmless, but local tests depend on the live site.

Dev-only, not counted: the TanStack Query devtools palm-tree button sits in the bottom-right of every local page and covers the end of the last-roll chip.

## 8. Scores (1–5)

- **Onboarding: 4.** The invite greets me by name, the account takes 0.2 s, the tour leads with "no generative AI", and the checklist is clear. One beta mixed message.
- **Table: 3.** Fast and pretty, but the die misreads on camera, the DM's roll errors out, tokens are letters, and the plates vanish at 720p.
- **Players: 4.** The phone roll sheet explains the maths, sends it to the TV, and offers Sneak Attack in one tap.
- **Prep: 3.** The wizard is quick and well written, but it lets a Bard start with no spells and a level-5 Fighter with no subclass.
- **Looks: 4.** Lamplit is calm and cohesive, the crests are lovely, and the ink map is honestly procedural. A corner emoji and two all-caps labels slip.
- **Value: 4.** Everything I need for a table screen, no paywalls met, no AI.

- **Next session:** maybe. It's clean as a full-frame table capture, but I won't put that die on stream until the result faces the camera.
- **Would I pay $4/month:** yes. It's the only table screen I've used where I never had to check whether something on screen was generated, and the honesty is worth backing.
- **"I'd send this to another DM":** yes. The no-AI line, the credited crests and the upfront disclosure are the cleanest I've seen, and the phone sheet sells itself.

## 9. The ONE thing

Make the landed die show its result to the camera, big. Then put the class crests on the TV tokens. The die is the single most-watched object on my table screen, and right now it can show my chat a 6 when the roll was a 3.

## 10. Verdict

This build passes the AI hunt that run 2 failed. The AI village map is now an ink map drawn by code, the stale "AI Campaign Planner" still is gone, and the crests are credited human-drawn game-icons. The disclosure about AI coding tools is the right call: it's honest, specific, and draws the line where my audience draws it. Trim "as most developers do now" and add a line on who wrote the words, and it holds up to a hostile chat. What keeps it off air is the table screen itself. A d20 that lands showing the wrong face to the camera, a DM roll that 500s, letter tokens with colliding initials, and plates too small for 720p are all small, specific, fixable things. Fix the die and give the TV the crests, and I'd run it next Saturday.
