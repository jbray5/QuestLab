# SESSION 4 ADDENDUM — HARD-MODE PUZZLES + PUZZLE WORKBENCH SPEC

> Captured verbatim 2026-07-22. Replaces the master script's Section 7
> puzzle walkthrough and the AELIM contingency. Print and staple.
> App build spec (Section C) is being built as Plan 00055 — freeze Friday.

## A ▸ THE REFRAIN — HARD MODE

What changed: no word breaks, Maren knows only TWO sounds, and speaking a wrong reading aloud has a cost. The structure itself is the puzzle now — your smart players get a real cryptanalytic bite: find the repeat, hypothesize the boundaries, crack the words.

Setup — Maren spreads the pages: 📖 "Thirteen marks. Over and over, under everything else — the sea doesn't breathe where we do, so there are no breaks. I've matched what I can against the old blessing-texts. TWO sounds I'm sure of. Two."

🔲 TYPE into Teams chat (the glyph structure — repeats visible): ◆ ● ▲ ✦ ⬟ ● ▲ ✦ ◆ ⬟ ✚ ◼ ✱

🔲 TYPE (Maren's two knowns: ✦ = E, ⬟ = H): `_ _ _ E H _ _ E _ H _ _ _`

⚠️ THE GUESS-COST (say it before they start): 📖 Maren, not looking up: "One more thing. Mind what you READ ALOUD in this room. The pages hum when they're spoken near. Wrong words… carry." 🗝 Spelling letters aloud is safe. Speaking a full candidate READING aloud is the trigger. Each wrong spoken reading: the pages hum faintly (🔊 optional low swell) — and that night, narrate one consequence: the song swells a beat louder / one more sleeper is found at the tideline at dawn / a boat slips its mooring. Escalating, never blocking. Watch them start spelling everything like paranoid crossword players. That's the game working.

The solve path (expected order — don't lead, just confirm):
1. Someone spots the repeat: ● ▲ ✦ appears twice (positions 2–4 and 6–8), each preceded by a different mark (◆ then ⬟).
2. Boundary hypothesis: ◆●▲✦ | ⬟●▲✦ | ◆⬟✚◼✱ — two 4-mark words sharing their last three marks. A rhyming pair.
3. With H and E known, the second word is H__E → HOME lands → ● = O, ▲ = M lock everywhere.
4. First word becomes _OME with ◆ unknown → COME → ◆ = C locks.
5. Last word: C H ✚ ◼ ✱. Willa's single whisper (spotlight, no roll): 📖 "Willa — your fingers cross the third mark, and the whispering you've carried since the ghost ship rises like a tide. One sound surfaces: thin, like wind through a keyhole." → ✚ = I → C H I _ _.
6. They finish it: CHILD. 🗝 If anyone says "CHILL" aloud — Maren, flat: 📖 "Hm. The sea is not asking anyone to relax." (That counts as a wrong spoken reading. The pages hum. Enjoy.)

📖 Maren, flat, to no one: "…'Come home, child.' That's what the sea has been singing. Three weeks. Louder every night." 🗝 Say nothing else. Don't look at Willa. Let the TABLE look at Willa.

Stuck ladder (in order, only as needed):
1. Maren: 📖 "These two marks ◆ — they sit where sentences would START, if the sea used sentences."
2. Maren: 📖 "The second word rhymes with the first. Old songs do that."
3. The sprite drifts down, lands on the last three marks — and points at Willa. (A hint with a dagger in it.)
4. Floor: Maren cracks HOME herself overnight; the finished refrain becomes next session's cold open. The puzzle cannot stall the session.

## B ▸ THE CIPHER — TWO-LOCK HARD MODE

What changed: the word alone no longer hands them the answer. "The name is the key. It always was" is now DOUBLY true — the word wakes the page, and the word turns the cipher.

LOCK 1 — THE WARD (unchanged discovery, new result). The page can't even be transcribed — symbols swim. When someone speaks AELIM over it: 📖 "The marks go STILL. And they are letters now — plain letters — but letters in no order any tongue intended. The page has stopped fighting you. It has not started talking." 🗝 The stilled text = the actual printed prop's ciphertext. They've been holding the real puzzle since Session 2.

LOCK 2 — THE TURN. 📖 Maren: "Hm. Keyed twice — the careful bastard. The word WAKES it… and the word also TURNS it. This is wheel-cipher work. Old. Give me the square and give me the night — or give me your evening, and we turn the first lines together."

Optional table activity (10–15 min — offer it, don't force): decode line one by hand, players + Maren together. The method, said once: 📖 "Each letter steps BACKWARD by the key's letter. A steps nothing. E steps four. L steps eleven. I steps eight. M steps twelve. Then the key repeats. Skip nothing but spaces." 🗝 Worked opening (your crib — first words): TS HPAEZPZ… with key A-E-L-I-M repeating → T(−A=0)=T, S(−E=4)=O → "TO…" → the line resolves to "TO WHOEVER HOLDS THIS AFTER I AM GONE." If the table is eating it, keep going as long as they want; the moment energy dips, Maren takes over: 📖 "Good. You've taught me the turn. Sleep — I'll have the rest by morning." → full read (master script Appendix B) becomes next session's cold open. 🗝 Paper aid: any printed Vigenère square works; or the Workbench below handles alignment digitally.

🗝 THE TRACKING LINK now dies at a better moment: not at the ward-break, but when the first full sentence resolves — 📖 "And somewhere very far away — like a hair plucked from a sleeve — a thread goes slack. None of you know what that was." (Halve is now blind to the page, and doesn't know it's been read. Say nothing more.)

🗝 If they never try AELIM: Maren grinds archive key-words for days and gets nowhere. State it plainly through her: "It wants ITS word. Not mine." The word must come from them — that's the whole design.

## C ▸ CLAUDE CODE HANDOFF — "PUZZLE WORKBENCH"

Build THIS WEEK. Freeze Friday. Nothing deploys on game day.

**What it is:** A DM-driven puzzle module with a projector-safe player view (same pattern as the 3D table: DM route controls, player link displays). Two puzzle types, both data-configured — no hardcoded puzzles.

**Type 1 — GLYPH BOARD (the refrain):** Data (DM-configured per puzzle): ordered token list (glyph ids), optional pre-known letter map, answer string, hide_spaces toggle, glyph art per id (reuse the cipher-prop visual style; simple distinct shapes are fine as v1). Player view: the glyph tiles in sequence, large, projector-legible. Below: the letter line (`_ _ _ E H _ _ E _ H _ _ _`) updating live. Interaction: DM (or players via the shared link — DM toggle) taps a glyph → assigns a letter → propagates to every instance of that glyph → letter line updates. Assignments are removable. "Speak a reading" button (DM view): logs a guess attempt with timestamp (feeds the consequence ledger). On a wrong full answer: a subtle page-hum animation on the player view + optional low 🔊 swell. On the correct full answer: the glyphs kindle silver and the resolved refrain fades in slow. Seed data for Saturday: tokens [g1,g2,g3,g4,g5,g2,g3,g4,g1,g5,g6,g7,g8] · mapping C=g1 O=g2 M=g3 E=g4 H=g5 I=g6 L=g7 D=g8 · preknown {g4:"E", g5:"H"} · answer COMEHOMECHILD · spaces hidden.

**Type 2 — VIGENÈRE DECODER (the scroll):** States: WARDED → STILLED → SOLVED.
- WARDED: ciphertext letters drift/swim (subtle CSS animation), unselectable. A key-entry field (player view or DM view — DM's call). Correct key (server-validated, case-insensitive) → transition:
- STILLED: swim stops; ciphertext is selectable. Decode interaction: tap a cipher letter → UI shows the aligned key letter (auto-computed from position, skipping non-alpha) → player picks the plaintext letter from an A–Z picker → correct locks green, wrong shakes. Progress bar across the page.
- DM controls: reveal word · reveal line · reveal all · reset. One-time FX on first full sentence: a subtle "thread snaps" indicator on the DM view only (the tracking-link beat — never shown to players). Seed data: key AELIM · ciphertext + plaintext from the campaign's existing cipher file (the Session 2 prop text — it's already real and verified).

**Hard rules:**
- Answers and keys validate server-side — nothing guessable in the client bundle (players will open dev tools; assume it).
- DM route = control; player link = display-only unless DM enables touch.
- Works over screen-share AND direct on phones; projector-legible type.
- Reuse the existing session/preset architecture — this is a panel, not a new app.
- Freeze Friday night. Paper fallback exists (Sections A & B above are fully runnable with Teams chat + a printed square).

**Definition of done:** I can: load the refrain puzzle, show the player link on the projector, tap glyphs to assign letters and watch them propagate, log a wrong spoken reading and see the hum; switch to the scroll, watch it swim, enter AELIM, see it still, decode letters by hand with green locks, and reveal-all when the table's done. If any of that is shaky Friday — we run the Teams-chat version and lose nothing.
