# Persona test — Dev (Foundry power user, 5e 2024 rules-strict)

Test window: 2026-09-05 20:47–21:07 (about 20 minutes wall clock). Campaign "Persona test — Dev" created, exercised through the API and headless Chrome (desktop 1280/1440/1600, phone 390×844 @2x), then deleted. One text generation used (NPC), zero images. Screenshots in `personas/shots/dev_*.png`.

## 1. First five minutes

Landing (`dev_01_welcome.png`) says the right things for me in the first screen: "D&D 5e (2024)", "SRD 5.2.1 under CC-BY 4.0", "free forever for the table", AI prep behind Patreon. No marketing fog; I knew what the product was in ten seconds. Sign-in in personal mode is an email box with no password ("your email stays on this device") — fine for a self-hosted-style setup, would be a hard no for a public deployment, and the guide says the public mode uses Discord/Patreon OAuth instead. The dashboard (`dev_04_after_signin.png`) is a campaign grid with counts; it loaded in under two seconds.

The guide (`dev_02_guide.png`) is a real runbook — "button by button", two narrated recordings, an honest maps-and-licensing section, and a "what rules does it use" answer. It is the best onboarding doc I've seen from an indie VTT. What it does not have: any "for engineers" page. I had to fetch `/openapi.json` myself (246 routes, decent summaries, several `body: dict` endpoints with no schema).

The rules engine is readable Python and I read it: `integrations/dnd_rules/srd_character_options_2024.py` (species, backgrounds, 10 origin feats, 12 classes with one SRD subclass each, point-buy table, armor table), `services/character_builder_service.py` (derivation), `services/rest_service.py`, `services/spellcasting_service.py`, `services/character_service.py`. SRD-honest things: exactly the 9 SRD 5.2.1 species, 4 backgrounds, 10 origin feats, one subclass per class, and a "not in the SRD — traits are yours to track" warning for anything else. Not honest: the monster compendium is **SRD 5.1** (the page header admits it; the landing page does not) — the Goblin is HP 7 / 2d6 / DEX 14, i.e. the 2014 block, not the 2024 Goblin Warrior (HP 10, DEX 15).

## 2. Rules correctness

Built via `POST /play/join/{campaign}/characters`, verified with `GET /characters/{id}`, `/saving-throws`, `/skill-bonuses`, `/spell-slots`, `/spellcasting-stats`, `/features`.

| Check | Expected (2024 RAW) | Actual | Result | Where |
|---|---|---|---|---|
| L1 Human Fighter, point buy 15/14/13/8/12/10 + Soldier (+2 STR/+1 CON), Tough, chain mail + shield | HP 10+2+2 = 14; AC 16+0+2 = 18 | 14 / 18 | PASS | |
| Same — saves | STR +5, CON +4, DEX +2, INT -1, WIS +1, CHA 0 | identical | PASS | |
| Same — skills (Soldier: Athletics, Intimidation; class: Perception, Survival; Human Skillful: Insight) | Athletics +5, Perception +3, Survival +3, Insight +3, Intimidation +2 | identical | PASS | |
| Same — feats | Savage Attacker (Soldier) + Tough (Versatile) | `["Savage Attacker","Tough"]` | PASS | |
| Same — Second Wind | 2 uses, regain one per short rest | max_uses 2, recovery `short_one` | PASS | |
| L3 Elf Wizard, standard array, Sage (+2 INT/+1 CON) | HP 6+2+(4+2)×2 = 20; AC 12; DC 13; atk +5; slots 4/2; INT save +5, WIS +3 | all identical | PASS | |
| Wizard cantrips/prepared caps at L3 | 3 cantrips / 6 prepared | caps 3 / 6; Fireball (L3) rejected with "above your spell level" | PASS | |
| Elf Keen Senses (Insight/Perception/Survival prof) and lineage cantrip | one extra skill + one cantrip | neither granted; only text in `notes` | **FAIL** | `srd_character_options_2024.py` Elf row has no `bonus_skill_choices`; builder has no lineage cantrip hook |
| L5 Dwarf Cleric, point buy, Acolyte (+2 WIS/+1 CON), chain shirt + shield | HP 8+2+(5+2)×4+5 (Dwarven Toughness) = 43; AC 13+0+2 = 15; PB +3; WIS save +6, CHA +3; DC 14; slots 4/3/2; 4 cantrips / 9 prepared | all identical; 10th spell dropped with a warning | PASS | |
| Cleric Channel Divinity uses at L5 | 2 (3 at L6, 4 at L18) | **3** (formula = proficiency bonus) | **FAIL** | `integrations/dnd_rules/class_features_2024.py` L64 `UsesFormula.PROF_BONUS` |
| L20 Gnome Wizard | HP 122; slots 4/3/3/3/3/2/2/1/1; PB +6; DC 17 | identical | PASS (but no ASIs/feats past L1 are modelled — a level-20 build with INT 17 is accepted silently) | |
| Point buy over budget (six 15s) | reject | 422 "Point buy spends 54 of 27 points." | PASS | |
| Standard array with wrong numbers | reject | 422 | PASS | |
| Background bonus +3 to one score | reject | 422 "+2 and +1, or +1 to three" | PASS | |
| Off-list skill (Dwarf Fighter picks Arcana) | reject | 422 "Arcana isn't on the Fighter skill list." | PASS | |
| **Human Fighter picks five off-list skills** (Arcana, Nature, Religion, Medicine, Stealth) | reject (Skillful grants ONE any-skill; class picks must be on the list) | **201 — all five granted**, sheet has 7 proficiencies | **FAIL** | `services/character_builder_service.py` skill validation: the `extra_allowed` branch skips the on-list check and never counts off-list picks |
| Starting kit → inventory | chain mail, shield, mace/longsword in inventory | AC is right but "Not in the catalog yet: Chain Mail, Shield / Chain Shirt, Shield" on every Fighter and Cleric build | **FAIL** (data) | item catalog lacks the SRD armors the kits reference |
| Damage waterfall (temp HP first) | 5 temp + 9 dmg → temp 0, HP -4 | correct | PASS | |
| Death saves: 5 → fail, 15 → success, 1 → two fails, 20 → 1 HP, heal resets | correct incl. 422 when HP > 0 | correct | PASS | 3 failures is a "signal"; nobody is marked dead |
| Short rest | regain one Second Wind / one CD use; no HP; slots untouched (non-Warlock) | correct | PASS | |
| Long rest — HP, slots, hit dice (half, min 1), exhaustion -1 | all | HP full, slots full, HD 1→0, exhaustion 2→1 | PASS | |
| Long rest — temp HP cleared, death-save pips cleared | both | **temp HP 5 remained; pips 1✓/1✗ remained at 14/14 HP**; concentration label also survived the night | **FAIL** | `services/rest_service.py::long_rest_pc` sets `hp_current = hp_max` directly, never touches temp_hp / death saves, and does not call `_sync_combatant_for_pc` |
| Level-up via `PATCH /characters {level: 2}` | HP max should become 24 and Action Surge appear | hp_max stayed 14; Action Surge only after a separate `POST /features/sync` | manual | `character_service.update_character` |
| Concentration on damage | prompt a CON save DC 10 (half damage) | nothing; label persists | manual | there is a "Concentration (CON save)" button on the sheet and a Drop button on the phone |
| Goblin stat block | 2024 Goblin Warrior HP 10, DEX 15 | HP 7, 2d6, DEX 14 (2014) | **FAIL** vs. the "2024" claim | monster seed is SRD 5.1; page header says so |
| Fireball text | 2024 wording | 2024 wording ("20-foot-radius Sphere", "Fire damage") | PASS | |

Net: the arithmetic (HP, AC, saves, skills, slots, DC, PB, point buy) is right for every build I threw at it, including level 20. The failures are all in the second ring — species traits, feature use counts, rest side effects, and one validation hole. That's better than Roll20's sheet and about where Foundry's core is *before* modules.

## 3. Automation audit

**Automated and correct:** HP/AC/save/skill derivation at build time; temp-HP waterfall; death-save resolution with nat 1/20 rules and reset on heal; slot expend/restore with proper 422s ("no level 3 slots at all"); feature use pips with the 2024 regain-one-on-short-rest pattern; long-rest HP/slot/HD/exhaustion; DM damage lands on the phone and the combat tracker via SSE; conditions set on a combatant show on the phone banner (`dev_30_phone_wizard.png`), on the HUD card and as pips/rings on the 3D table; active turn and defeated state are projected to the table ("Thora's turn", greyed Brann); player-scope PATCH is whitelisted server-side (a player trying `hp_max/level/ac` gets 403 — good).

**Manual (you do it, the tool records it):** hit-die healing (you roll, you type the heal), concentration checks, condition durations and mechanical effects (Poisoned does not give disadvantage anywhere; Prone does nothing), "dead" state after three failures, level-up HP, exhaustion effects, Second Wind healing amount, spell effects of any kind, monster HP roll vs. average, initiative (you type it or press Roll Init).

**Wrong:** long rest leaves stale death-save pips and temp HP and leaves the combat tracker showing the fighter at 0/defeated; Channel Divinity uses; combat_state silently coerced — I sent `"active"` and got `"idle"` back with a 200, and because the tracker sync only fires when `combat_state == "running"`, the fighter I dropped to 0 stayed at 14/14 in the tracker until I re-PUT the roster with the magic string. That one cost me ten minutes and would cost a real DM a fight.

Conditions are free strings with no vocabulary check (`["Hexed","grappled"]` accepted) and no durations. Fifteen looks are defined in `frontend/src/lib/conditions.ts`; anything else gets a three-letter pip.

The HUD itself (`dev_11_hud_live.png`) is genuinely good at 1280 wide: party cards with passive Perception/Insight, spell DC, slot pips, feature pips, concentration chip, death-save chip; the combat strip; the live board; notes; a rules strip (Actions / Death Saves / Concentration / Conditions / Advantage / Exhaustion 2024). Keyboard: N for notes, T/Y/A/[ ]/Del/Esc on the board. No hotkeys for End Turn or damage that I found.

## 4. API and data

- **Export:** `GET /api/admin/export/campaigns` returned 8 KB for 12 campaigns — campaign rows only (id, name, setting, tone, notes). No characters, sessions, maps, combat, notebooks. That is not an export. **Import:** none. This is the dealbreaker for data ownership; my Foundry world is a folder I can zip.
- **Scripting:** the API is usable and the header-identity model makes curl trivial in personal mode. SSE streams (`/stream/pc`, `/stream/table`, `/stream/campaign`) are a real asset for scripting overlays. Hurts: `body: dict` endpoints with `additionalProperties: true` (damage, heal, death-save, spend-hit-dice, state) — no schema, so no generated client; `combat_state` is a bare string with silent coercion instead of an enum; `attack-preview` takes `character_id` as a query param while everything else takes bodies; `PUT /combat` replaces the roster and drops conditions unless you round-trip them yourself.
- **Auth model:** player routes are unauthenticated by design (the PC UUID is the bearer). The `/join/{campaign}` page lists every PC (`dev_32_phone_join.png`), so any player can open any other player's sheet and apply damage, spend slots, or set concentration. Fine for my group, not fine for a public table.
- **Delete is not transactional:** `DELETE /campaigns/{id}` returned **500** twice. Characters had already been deleted and committed; the campaign, the session, the table state and the battle map were still there. The cascade in `services/campaign_service.py::delete_campaign` doesn't know about battle maps or combat/table state. I had to delete combat and the battle map by hand before the campaign would go.
- What I'd want: a full JSON (or SQLite) export/import per campaign, a versioned API with typed bodies and enums, API keys for the public mode, a webhook or at least a documented SSE event catalogue, and a "compendium as data" endpoint I can diff against the SRD.

## 5. Against Foundry (my stack: 40 modules, midi-qol, DAE, Monk's Tokenbar, DFreds)

**Wins for QuestLab:** zero setup, zero module breakage; the character builder produces correct 2024 numbers with no homebrew leakage; players on phones with no accounts and no app; damage-to-phone latency ~1 s; the 3D table ran at 144 fps in headless Chrome and the d20 physically tumbles with the caster's name and label; the HUD is a better single-screen cockpit than my Foundry layout; the source is readable and the rules are in one file.

**Losses:** no active effects (conditions do nothing mechanically); no attack/save automation at all (I type damage); no dynamic lighting, walls, vision, or measurement (fog is a reveal brush); no compendium import (no D&D Beyond, no Foundry JSON, no 5etools); monsters are 2014 stat blocks; no macros, no scripting hooks in the client; no real export; a three-failure death is not tracked; no multi-class, no ASIs/feats above L1 in the builder.

**Dealbreakers today:** export/import; non-transactional delete; stale state after long rest. Any one of those is a "not with my campaign" from me.

## 6. Bugs

1. **Campaign delete 500 with partial cascade.** `POST /campaigns`, build a PC, create adventure+session, upload a map and `POST /campaigns/{id}/battle-maps`, `PATCH /sessions/{id}/table` with the map, `PUT /sessions/{id}/combat`. `DELETE /campaigns/{id}` → 500. Then `GET /characters/{pc}` → 404 but `GET /campaigns/{id}` → 200. Deleting the battle map and combat state manually lets the delete succeed. `services/campaign_service.py::delete_campaign`.
2. **Human skill loophole.** Join build: species Human, class Fighter, `skills: ["Arcana","Nature","Religion","Medicine","Stealth"]` → 201, all five granted. `services/character_builder_service.py`, skill validation block.
3. **Cleric Channel Divinity = proficiency bonus.** L5 Cleric → `max_uses: 3`. RAW 2. `integrations/dnd_rules/class_features_2024.py` L64.
4. **Long rest leaves state behind.** Fighter at 0 HP with 1✓/1✗ → `POST /sessions/{id}/rest/long` → 14/14 HP, pips still 1✓/1✗ (`dev_11_hud_live.png` shows the chip; after rest the values were re-read via API). Wizard with 5 temp HP keeps 5 temp HP. Combat tracker still shows fighter 0/14 defeated. `services/rest_service.py::long_rest_pc`.
5. **`combat_state` silently coerced.** `PUT /sessions/{id}/combat {"combat_state":"active"}` → 200 with `"idle"`; PC HP changes then don't mirror to the tracker. `services/session_service.py::_normalize_combat_state`; schema has no enum.
6. **Elf traits not applied** (Keen Senses skill, lineage cantrip). Build B: Elf Wizard has Perception +1 and no lineage cantrip. Same class of issue for every species trait that isn't speed or the Dwarf HP bonus.
7. **Kit armor missing from the item catalog.** Every Fighter/Cleric build returns "Not in the catalog yet: Chain Mail, Shield". AC is computed right; inventory is wrong.
8. **Hex grid on a square map by default.** Uploaded a 96 px square-grid map; the DM board opened with HEX selected and the 3D table shows a hex overlay (`dev_23_board2d.png`, `dev_22_table3d_dice_landed.png`).
9. **Monster compendium is SRD 5.1** while the landing/guide claim 2024 / SRD 5.2.1 (`dev_40_monsters.png` header vs. `dev_01_welcome.png` footer). Goblin HP 7 / DEX 14.
10. **Level PATCH doesn't recompute HP or sync features.** `PATCH /characters/{id} {"level":2}` → hp_max unchanged; Action Surge only after `POST /features/sync`.
11. **Free-text conditions accepted** (`"Hexed"`) with no vocabulary or duration.
12. **Die clears fast.** The d20 was visible tumbling at 0.9 s with the caption "Thora Deepdelve rolls d20 — Guiding Bolt" (`dev_21_table3d_dice_tumble.png`) and gone by 4.9 s with no pinned result on the TV (`dev_22_table3d_dice_landed.png`). Look away and you missed it.
13. Cosmetic: every PC gets the same wizard emoji as a portrait placeholder, including the fighter (`dev_30_phone_fighter.png`).

## 7. Scores (1–5)

- Onboarding: **4** — email box, a guide that's actually a runbook, and a join builder that gets the math right.
- Table experience: **3** — the HUD is excellent; the automation stops at bookkeeping and the rest/tracker desyncs are the kind of bug that bites mid-fight.
- Player experience: **4** — the phone sheet is one-handed, big targets, death-save pips, spell slots, conditions banner, concentration Drop; `dev_30_phone_*.png`. Anyone with the join link can open anyone's sheet.
- Prep: **2** — no importer, 2014 monsters, no compendium beyond the SRD, encounter builder exists. The NPC generation I tried (11.9 s) was genuinely good prose with a usable secret and hooks, but I don't buy AI prep.
- Value: **3** — the free tier is the whole table tool, which is generous; but I'd be paying with my data's portability.

Would I run my next session on it? **No** — maybe for a one-shot with pregens on a TV, where it would honestly beat Foundry on setup time.

Would I pay $5 / $12 / $25 for the AI tier? **No / No / No.** I'd pay $5 a month for export/import and a typed API before I'd pay for NPC prose.

The ONE thing that would make me switch: **a real campaign export/import (characters, sessions, maps, combat) plus condition/rest state that stays consistent** — until my data can leave, none of the rest matters.

## 8. Verdict

The character math is right and the table plumbing (phones, TV, HUD) is better than anything I've bolted onto Foundry, but it's a bookkeeping tool wearing an automation costume — conditions do nothing, rests leave crumbs, and a delete that half-succeeds with a 500 tells me the persistence layer isn't ready for my six-year campaign. Fix export, make state transitions transactional and rule-complete, ship enums in the schema, and I'll bring my group for a one-shot.
