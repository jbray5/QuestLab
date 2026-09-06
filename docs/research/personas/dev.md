# Persona test, run 2 — Dev Okonkwo-Reyes (Foundry power user, 5e 2024 rules-strict, reads the source)

Test window: 2026-09-05 20:46–21:04 CDT, 18 minutes. Campaign `Persona2 — Dev` under `persona2-dev@questlab.test`, driven API-first (`GET /openapi.json`: 252 routes, up from 246) with Python and the identity header, plus headless Chrome at 1440×900, 1280×800 (HUD) and 390×844 @2x (phone sheet, Arena, remote table). Twenty-one builds through `POST /play/join/{campaign}/characters`, six Arena fights, one session with a running fight and a long rest, one export, one delete; source read in `integrations/dnd_rules/` and `services/` wherever a rule mattered. AI budget: one NPC generation (13.3 s), zero images. Screenshots `dev_NN_*.png`.

## Since run 1

I failed it on eight things; all eight moved, and I re-verified each with the same build bodies (table below). Fixed outright: Channel Divinity uses, Elf Keen Senses, the Human skill loophole, long-rest residue, kit armor in the inventory, `combat_state` as a schema `Literal` with `"active"` → `running`, `PATCH level` granting features, and a per-campaign export. Campaign delete is 204 in 0.5 s with every child route 404 afterwards.

Still bites: the long rest fixes the PC row but not the combat tracker — with a fight running, the fighter I dropped to 0 shows 14/14 on his card and `▶ Brann Ironhand 0/14` on the initiative list and the players' remote table (`dev_20_hud_1280.png` vs `dev_22_remote_table_phone.png`). Monsters are still SRD 5.1. The export has no inventory, spells or features. 26 endpoints still take `body: object`.

Regressed: nothing I measured. New: an 8-PC cap per campaign (422 "Campaign already has 8 characters (maximum)") that my bench hit on build nine.

## First five minutes

`/welcome` 1165 ms (DOMContentLoaded 257 ms), email box → dashboard 1536 ms, `/guide` 829 ms, dashboard 730 ms (`dev_01`–`dev_04`). Landing still says "D&D 5e (2024)" and "SRD 5.2.1". The guide mentions the Arena; it has no engineer page and the word "export" is absent — I found the route in `openapi.json`.

## 1. The rules table, re-run

| Check (2024 RAW) | Expected | Actual | Run 1 → 2 |
|---|---|---|---|
| L1 Human Fighter, PB 15/14/13/8/12/10, Soldier, Tough, chain mail + shield | HP 14, AC 18, STR +5, Athletics +5, Savage Attacker + Tough, Second Wind 2 | identical | PASS → PASS |
| L3 Elf Wizard (Sage); L5 Dwarf Cleric (Acolyte) | HP 20 / AC 12 / DC 13 / slots 4/2; HP 43 / AC 15 / DC 14 / 4/3/2 | identical | PASS → PASS |
| Channel Divinity L2/5/6/18 | 2/2/3/4 | 2/2/3/4 | FAIL → PASS |
| Elf extra skill | Perception ok, Stealth 422 | as expected | FAIL → PASS |
| Human off-list skills | one 201, two 422 | 201 / 422 | FAIL → PASS |
| Kit armor in inventory | Chain Mail, Shield | present, equipped | FAIL → PASS |
| L20 Gnome Wizard | HP 122, DC 17, 4/3/3/3/3/2/2/1/1 | identical | PASS → PASS |
| Long rest: temp HP, pips, concentration | 5→0, 1✓3✗→0/0, Bless→null | cleared | FAIL → PASS |
| Long rest → combat tracker | 14/14, not defeated | 0/14 defeated | FAIL → **FAIL** |
| `combat_state` "active" / "brawling" | running / 422 | running / 422 | FAIL → PASS |
| `PATCH level` | Action Surge at 2 | granted; hp_max stays 14 at L5 | FAIL → PASS |
| Arc tier from party level | avg 2.75 → Tier1 | Tier1 | new PASS |
| Paladin L1 slots | 2 (half-casters cast from L1 in 2024) | `{}` | new **FAIL** |
| Fighter L5 Second Wind uses | 3 (3 at L4, 4 at L10) | 2 | new **FAIL** |
| Goblin block | 2024: HP 10, DEX 15 | HP 7, AC 15 (5.1) | FAIL → FAIL |

Arithmetic: perfect on every build, and the four validation rejections (point buy, array, +3 bonus, off-list Dwarf) all still 422. Three death-save failures are still a "signal" — a long rest revived him. What remains is two 2014-isms in the tables — `_HALF_CASTER_SLOTS[0] = {}` in `character_service.py` and `Second Wind` / `Rage` pinned at `FIXED_2` in `class_features_2024.py` — plus the tracker.

## 2. The Practice Arena's rules

`services/arena_service.py`, `SystemRandom`, no AI; the phone page loads in 790 ms (`dev_11`–`dev_14`). Right, from the logs: longsword +5 / 1d8+3 at L1, +6 at L5; Fire Bolt +5 / 1d10 at L1, +6 / 2d10 at L5; Fireball DC 14 DEX, 8d6, half on save; crit doubles dice not modifier (`2d8+3 → [2, 2]+3 = 7`, `dev_13`); a second attack in one turn is a 422; Dodge gave the goblin `disadvantage [11, 6] → 6`; Second Wind `1d10+5 = 13`; Action Surge bought a second swing; Rage halved a hit 8 → 4; a leveled spell consumed a slot; the real sheet was untouched afterwards.

Wrong versus 2024 RAW: Lay on Hands is an Action here (2024: Bonus Action) and at full HP it fired "+0 HP", spending the action and the only use. A L1 Paladin has no spells. No Extra Attack — my L5 Fighter got one swing per action. Magic Missile is a single `1d4+1` dart. Rage's +2 skipped the Handaxe (`[3]+3 = 6` while raging) because anything with a range counts as ranged, and Rage halves every damage type. Foes use every listed action each turn: the Gnoll, with no Multiattack, made Bite + Spear + Longbow in one round against a 14-HP fighter (`dev_12`). And the server is not the referee: the phone posts the whole state back, and a forged one (foe HP 1, my HP 999, nine slots) got a 200 and a "won" — harmless to the sheet, meaningless debrief.

## 3. API and data

Typed now: `combat_state`, the Arena bodies with `ArenaAction.kind` and `ArenaFeature.key` enums, `CharacterBuild`. Still `object`: damage, heal, death-save, hit dice, `/play/{pc}/state`, initiative, notes, runbook, pack, figure/portrait — 26 routes. I sent `{"roll": 5}` to death-save, got `422 "d20 must be 1..20"`, and had to read the router to learn the field is `d20`.

Export `GET /campaigns/{id}/export`: `questlab-campaign/1`, 17.5 KB. In: campaign, 8 characters (every column), NPCs, adventures with encounters and sessions with runbook, battle maps, notebooks, shops, puzzles. Out: character items (the wizard exports with `equipment: null`), character spells (`spells_known: null` — the builder writes the relational table, the export dumps the legacy column), features, combat roster, table state, custom monsters and items. No import route. The bundle cannot rebuild a wizard.

Delete: 204 in 0.51 s; `/campaigns`, `/play/{pc}`, `/play/join`, `/arena/foes`, `/sessions/{id}/combat`, `/export`, `/npcs` all 404. One leak: `GET /table/{deleted session}` returns 200 with an empty shell (`campaign_id: null`), so a TV left on that URL says "No map on the table" forever.

NPC name avoidance: PC "Hessa Cleft" + NPC "Ambrose" → "Corwin Vale" in 13.3 s, no reuse. Good prose, usable secret.

## 4. HUD at 1280 — the ten-minute scenario

`dev_20_hud_1280.png`: 3.6 s to a usable HUD, no horizontal scroll at 1280×800, party cards with AC, passives, DC, slot and feature pips. Run 1's ten minutes were "why doesn't the tracker follow HP?" — gone: with `combat_state: active` the 14-damage hit mirrored to `0/14 defeated` on the first read. The new version of that minute is the long rest during a running fight: card 14/14, initiative 0/14, and the players' `/table/<session>?pc=` window (`dev_22`, 2.2 s) agrees with the wrong one. End Combat clears it; nothing tells you to. The phone (`dev_21`) carries "⚔ It's your turn!", a 🗺 TABLE link and the ⚔️ ARENA button.

## Bugs

1. **Long rest leaves the tracker stale.** Fight running, PC at 0 → `POST /sessions/{id}/rest/long` → PC 14/14, tracker `0/14 defeated`. `rest_service.py::long_rest_pc` never calls `_sync_combatant_for_pc`.
2. **Half-casters have no L1 slots.** Paladin L1 → `/spell-slots` `{}`. `character_service.py` `_HALF_CASTER_SLOTS[0]` should be `{"1": 2}`.
3. **Second Wind / Rage uses don't scale.** L5 Fighter → 2, RAW 3. `class_features_2024.py` `FIXED_2`.
4. **Arena foe takes every action each turn.** `arena_service.py::_foe_turn`. `dev_12`.
5. **Arena Lay on Hands: Action, not Bonus Action; no full-HP guard.** `_FEATURE_KEYS`, `_feature`.
6. **Arena: no Extra Attack at L5.** `_spend_action`.
7. **Arena: Magic Missile one dart.** `_pc_attacks`.
8. **Arena: Rage bonus skipped on thrown weapons; resistance untyped.** `_pc_attacks` `ranged = bool(item.weapon_range)`; `_foe_turn`.
9. **Arena state is client-trusted.** `act()` accepts `ArenaActBody.state` unsigned.
10. **Export omits items, spells, features, combat, table state; no import.** `campaign_service.py::export_campaign`.
11. **`GET /table/{deleted session}` → 200.** Should 404.
12. **26 untyped bodies;** death-save field `d20` undocumented. Level PATCH never recomputes `hp_max`; monsters are SRD 5.1 under a 2024 banner.

## Scores (1–5)

- Onboarding: **4** — 1.2 s landing, 1.5 s sign-in, a guide that is a runbook; no engineer page.
- Table experience: **3** — HP mirrors and `combat_state` is honest; a long rest mid-fight still desyncs the tracker.
- Player experience: **4** — Table link, turn banner, and a free Arena whose dice are right for the loop it models.
- Prep: **3** — export exists and NPC names respect the roster; the export is half a sheet, the monsters are 2014.
- Value: **3** — free table tool, right arithmetic; my data still can't leave whole.

*Next session?* **Maybe** — a one-shot with the builder's pregens, yes; my six-year campaign, no, until the export carries inventory and spells and there is an import.

*Pay?* $5 Hearth: **maybe** — if it also bought complete export plus import, tonight; for NPC prose alone, no. $12 Lantern: **no**. $25 Table: **no**.

**The ONE thing:** finish `questlab-campaign/1` — items, spells, features, combat and table state in the bundle — and ship the matching import.

## Verdict

The owner fixed what I asked for in the order I'd have fixed it. The character math is still flawless across twenty-one builds, and the Arena is the first thing in this product that plays the rules instead of recording them — its dice are honest. But it plays 2014 in places (Lay on Hands, half-caster slots, no Extra Attack, foes with three actions) and trusts the phone's state; the tracker still forgets the fighter slept; the export is a sheet with the pockets cut out. Fix the half-caster table and the tracker sync, finish the bundle, give me import, and I'll run a one-shot on it and mean it.
