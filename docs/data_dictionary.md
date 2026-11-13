# QuestLab — Data Dictionary

Every table, column, type, constraint, and enum value used in the QuestLab schema.
Schema source of truth: Postgres (via Alembic). DuckDB is used for local tests only.

---

## Enums

All enum values are stored as `VARCHAR` in Postgres (not native Postgres ENUMs).

### Ruleset (Plan 131)
`2024 | 2014`. Stored as the plain value (`'2024'`), not the enum name. Every edition-aware column below is `VARCHAR(4)`.

### CharacterClass
`Barbarian | Bard | Cleric | Druid | Fighter | Monk | Paladin | Ranger | Rogue | Sorcerer | Warlock | Wizard | Artificer`

### AbilityScore
`STR | DEX | CON | INT | WIS | CHA`

### DamageType
`Acid | Bludgeoning | Cold | Fire | Force | Lightning | Necrotic | Piercing | Poison | Psychic | Radiant | Slashing | Thunder`

### CreatureSize
`Tiny | Small | Medium | Large | Huge | Gargantuan`

### CreatureType
`Aberration | Beast | Celestial | Construct | Dragon | Elemental | Fey | Fiend | Giant | Humanoid | Monstrosity | Ooze | Plant | Undead`

### EncounterDifficulty
`Low | Moderate | High | Deadly`

### AdventureTier
| Value | Level Range |
|---|---|
| Tier1 | 1–4 |
| Tier2 | 5–10 |
| Tier3 | 11–16 |
| Tier4 | 17–20 |

### SpellSchool
`Abjuration | Conjuration | Divination | Enchantment | Evocation | Illusion | Necromancy | Transmutation`

### ItemRarity
`Common | Uncommon | Rare | VeryRare | Legendary | Artifact`

### MapNodeType
`Room | Corridor | Outdoor | Settlement | Dungeon | Lair`

### SessionStatus
`Draft | Ready | InProgress | Complete`

---

## Tables

### campaigns
Top-level container owned by a DM.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | Generated UUID4 |
| name | VARCHAR(200) | No | | Campaign title |
| setting | VARCHAR(200) | No | | World or setting name |
| tone | VARCHAR(200) | No | | Narrative tone |
| world_notes | TEXT | Yes | | Free-form world-building |
| dm_email | VARCHAR | No | INDEX | Owning DM email (lowercased) |
| allow_player_signup | BOOLEAN | No | default true | Plan 74 — anyone with the join link may build a character |
| join_code | VARCHAR(12) | Yes | | Plan 83 — upper-case code the join page asks for before listing the party; NULL = open |
| ruleset | VARCHAR(4) | No | DEFAULT '2024' | Plan 131 — `2024` or `2014`. Every PC in the campaign follows it. Locked once the campaign has a character (`campaign_service.update_campaign` raises `RulesetLockedError`, which the API returns as 409) |
| created_at | TIMESTAMP | No | | UTC creation time |
| updated_at | TIMESTAMP | No | | Updated on every PATCH |

---

### adventures
A story arc within a Campaign.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| campaign_id | UUID | No | FK → campaigns.id, INDEX | |
| title | VARCHAR(200) | No | | |
| synopsis | TEXT | Yes | | 1–3 sentence story summary |
| tier | VARCHAR(10) | No | | AdventureTier enum value |
| act_count | INTEGER | No | DEFAULT 3 | 1–5 |
| location_notes | TEXT | Yes | | |
| created_at | TIMESTAMP | No | | |
| npc_roster | JSON | Yes | | `[{name, role, description, stat_block_id}]` |

---

### player_characters
Full 2024 5e character sheet, belonging to a Campaign.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| campaign_id | UUID | No | FK → campaigns.id, INDEX | |
| player_name | VARCHAR(100) | No | | Real-world player name. The player can set it from the phone (`PATCH /play/{key}/state`, 1–100 characters once trimmed, Plan 128) |
| character_name | VARCHAR(100) | No | | In-game character name |
| race | VARCHAR(100) | No | | |
| character_class | VARCHAR(50) | No | | CharacterClass enum |
| ruleset | VARCHAR(4) | No | DEFAULT '2024' | Plan 131 — copied from the campaign at creation and never changed after (invariant: equals `campaigns.ruleset`) |
| subclass | VARCHAR(100) | Yes | | |
| level | INTEGER | No | 1–20 | |
| background | VARCHAR(100) | Yes | | |
| alignment | VARCHAR(50) | Yes | | |
| score_str | INTEGER | No | 1–30 | Strength |
| score_dex | INTEGER | No | 1–30 | Dexterity |
| score_con | INTEGER | No | 1–30 | Constitution |
| score_int | INTEGER | No | 1–30 | Intelligence |
| score_wis | INTEGER | No | 1–30 | Wisdom |
| score_cha | INTEGER | No | 1–30 | Charisma |
| hp_max | INTEGER | No | ≥ 1 | Maximum hit points |
| hp_current | INTEGER | No | ≥ 0 | Current HP (0 = unconscious) |
| ac | INTEGER | No | 1–30 | Armour class |
| speed | INTEGER | No | ≥ 0 | Walk speed in feet |
| portrait_url | VARCHAR(500) | Yes | | Image URL, typed in or uploaded. Since Plan 128 an upload in production is a Vercel Blob URL under `portraits/`; older uploads are `/uploads/…` paths, which `lib/portrait.ts` resolves against the API |
| figure_url | VARCHAR(500) | Yes | | Full-body standee for the 3D board (Plan 45) |
| model_url | VARCHAR(500) | Yes | | Rigged `.glb` the immersive table walks (Plan 111); height comes from `race` |
| backstory | TEXT | Yes | | |
| notes | TEXT | Yes | | DM/player session notes |
| saving_throw_proficiencies | JSON | Yes | | `[AbilityScore, ...]` |
| skill_proficiencies | JSON | Yes | | `{skill_name: "proficient"|"expertise"}` |
| feats | JSON | Yes | | `["feat name", ...]`. Class choices from the wizard are stored here too, as "Label: Choice" ("Divine Order: Protector", "Weapon Mastery: Longsword"); a Fighting Style feat goes in by its name (Plan 128). No screen displays this list yet (TD-128d) |
| equipment | JSON | Yes | | `[{name, quantity, notes}]` |
| spells_known | JSON | Yes | | `[{name, level, school, prepared}]` |
| spell_slots | JSON | Yes | | `{level: {total, used}}` |
| pending_level | INTEGER | Yes | 1–20 | Plan 115 — level the DM granted; the player's level-up guide raises `level` toward it, cleared on arrival (migration 0054) |
| player_notes | TEXT | Yes | ≤ 4,000 chars (request body) | Plan 122 — the player's own notes, written from the phone (`PUT /play/{pc}/notes`); the DM's screens don't show them, but anyone holding the player link can read them, and the phone says so (Plan 128); distinct from the DM's `notes`, which the player link never returns (migration 0055) |
| conditions | JSON | Yes | ≤ 20 names | UX-001 — conditions the DM set ("Poisoned"), kept between fights; trimmed and de-duplicated ignoring case; the running fight's tracker row mirrors them; the phone lists them (migration 0058) |
| play_token | VARCHAR(64) | Yes | UNIQUE | SEC-002 — the player link's secret (`/play/{play_token}`), 22 URL-safe characters, set at creation; replaced by the DM's "Reset link"; never in a player payload; only the owning DM's reads carry it (migration 0057) |
| legacy_uuid_until | TIMESTAMPTZ | Yes | | SEC-002 — PCs made before tokens still open by `/play/{id}` until this moment (2026-12-01 UTC for every existing row); NULL for new PCs and after a reset (migration 0057) |
| claimed_at | TIMESTAMPTZ | Yes | | Plan 139 — when a player first used this character on a phone, or built it on the join page. Once set, the join roster returns `key: null` for it. Only the DM's release route clears it; Reset link leaves it. Migration 0067 set it on existing rows with a real player name. |
| created_at | TIMESTAMP | No | | |
| updated_at | TIMESTAMP | No | | |

**Computed field** (not stored): `proficiency_bonus = (level - 1) // 4 + 2`

---

### class_features
The tracked class-feature catalog (Plan 21, migration 0012): features with limited uses that the table spends and a rest brings back. The rows come from `integrations/dnd_rules/class_features_2024.py`. At startup `feature_service.seed_and_backfill` inserts any row a database lacks, matched on name + class + subclass, and grants only those new rows to the PCs who qualify (Plan 128). Existing rows keep their id; only `uses_formula` and `recovery` are kept in step. Seeding never deletes, so rows dropped from the catalog (Song of Rest) stay (TD-128g).

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| name | VARCHAR(80) | No | | |
| character_class | VARCHAR(40) | No | INDEX | CharacterClass enum |
| subclass | VARCHAR(80) | Yes | | NULL for class features |
| level_acquired | INTEGER | No | 1–20 | |
| recovery | VARCHAR(20) | No | | RecoveryType enum: short, long, short_one (regain one use on a Short Rest, all on a Long Rest: Rage, Wild Shape, Second Wind), none, per_turn |
| uses_formula | VARCHAR(20) | No | | UsesFormula enum. Some features scale with level in the rules module instead (`scaled_uses`: Action Surge, Indomitable, Wild Shape, the Paladin's Channel Divinity); Lay on Hands is a pool of 5 × Paladin level |
| description | TEXT | No | | Our own words, not book text |
| source | VARCHAR(60) | No | DEFAULT 'SRD 5.5e / 2024 PHB' | |
| ruleset | VARCHAR(4) | No | DEFAULT '2024' | Plan 131 — which edition's catalog this row belongs to. The 2014 rows (`class_features_2014.py`, source 'SRD 5.1 (2014)') sit beside the 2024 ones; the catalog key is name + class + subclass + ruleset, and a PC is only granted rows of its own edition |

### character_features
A PC's copy of a catalog feature, with its uses spent (migration 0012).

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| character_id | UUID | No | FK → player_characters.id, INDEX | |
| feature_id | UUID | No | FK → class_features.id, INDEX | |
| uses_spent | INTEGER | No | ≥ 0, DEFAULT 0 | Clamped to the max. For a pool (Lay on Hands) it counts points; `spend`/`restore` take `?amount=` 1–100 (Plan 128) |
| notes | VARCHAR(300) | Yes | | |

`max_uses`, `feature_name` and `recovery` are worked out when the row is read (`CharacterFeatureRead`), never stored.

---

### monster_stat_blocks
2024 5e monster definitions. SRD monsters seeded on first run; custom monsters added by DMs.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| name | VARCHAR(200) | No | | |
| source | VARCHAR(50) | No | DEFAULT 'SRD' | SRD or custom |
| size | VARCHAR(20) | No | | CreatureSize enum |
| creature_type | VARCHAR(30) | No | | CreatureType enum |
| alignment | VARCHAR(100) | Yes | | |
| ac | INTEGER | No | 1–30 | Armour class |
| ac_notes | VARCHAR(200) | Yes | | e.g. "natural armour" |
| hp_average | INTEGER | No | ≥ 1 | |
| hp_formula | VARCHAR(50) | No | | e.g. "10d10+30" |
| score_str/dex/con/int/wis/cha | INTEGER | No | 1–30 | Six ability scores |
| challenge_rating | VARCHAR(5) | No | | "0", "1/8", "1/4", "1/2", "1"–"30" |
| xp | INTEGER | No | ≥ 0 | XP award value |
| proficiency_bonus | INTEGER | No | 2–9 | |
| languages | VARCHAR(500) | Yes | | |
| is_custom | BOOLEAN | No | DEFAULT false | |
| created_by_email | VARCHAR(200) | Yes | | Set for custom monsters |
| image_url | VARCHAR(500) | Yes | | Portrait |
| figure_url | VARCHAR(500) | Yes | | Full-body standee for the 3D board (Plan 45) |
| model_url | VARCHAR(500) | Yes | | Rigged `.glb` the immersive table walks (Plan 111); height comes from `size` |
| speed | JSON | Yes | | `{walk, fly, swim, burrow, climb}` ft |
| saving_throws | JSON | Yes | | `{ability: bonus}` |
| skills | JSON | Yes | | `{skill_name: bonus}` |
| senses | JSON | Yes | | `{darkvision: 60, passive_perception: 11, ...}` |
| damage_resistances | JSON | Yes | | `[DamageType, ...]` |
| damage_immunities | JSON | Yes | | `[DamageType, ...]` |
| condition_immunities | JSON | Yes | | `["poisoned", ...]` |
| traits | JSON | Yes | | `[{name, description}]` |
| actions | JSON | Yes | | `[{name, description, attack_bonus, damage}]` |
| bonus_actions | JSON | Yes | | `[{name, description}]` |
| reactions | JSON | Yes | | `[{name, description}]` |
| legendary_actions | JSON | Yes | | `[{name, description}]` |
| lair_actions | JSON | Yes | | `[{name, description}]` |

---

### loot_tables
Randomisable loot definitions for an Adventure.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| adventure_id | UUID | No | FK → adventures.id, INDEX | |
| name | VARCHAR(200) | No | | |
| tier | VARCHAR(10) | No | | AdventureTier enum |
| entries | JSON | Yes | | `[{item_id|gold_range, weight, quantity}]` |

---

### items
Magic and mundane items referenced in loot tables and character equipment.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| name | VARCHAR(200) | No | | |
| rarity | VARCHAR(20) | No | | ItemRarity enum |
| item_type | VARCHAR(100) | No | | e.g. Weapon, Armour, Wondrous |
| description | TEXT | Yes | | |
| attunement_required | BOOLEAN | No | DEFAULT false | |
| value_gp | INTEGER | No | DEFAULT 0, ≥ 0 | Value in gold pieces |
| is_magic | BOOLEAN | No | DEFAULT false | |
| properties | JSON | Yes | | Arbitrary properties (damage dice, charges, etc.) |
| created_by_email | VARCHAR(200) | Yes | INDEX | SEC-003 — the DM who authored a homebrew item (listed only for them; only they or an admin may change it). NULL = the shared catalog, admin-only to change (migration 0056). `spells.created_by_email` works the same way; `monster_stat_blocks` already had it (with `is_custom`) |

---

### encounters
A combat or social challenge within an Adventure.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| adventure_id | UUID | No | FK → adventures.id, INDEX | |
| name | VARCHAR(200) | No | | |
| description | TEXT | Yes | | |
| difficulty | VARCHAR(20) | No | DEFAULT 'Moderate' | EncounterDifficulty enum |
| xp_budget | INTEGER | No | DEFAULT 0, ≥ 0 | Total XP budget (2024 method) |
| terrain_notes | TEXT | Yes | | |
| read_aloud_text | TEXT | Yes | | DM reads this when encounter starts |
| dm_notes | TEXT | Yes | | Private DM tactics notes |
| reward_xp | INTEGER | No | DEFAULT 0, ≥ 0 | XP awarded on completion |
| loot_table_id | UUID | Yes | FK → loot_tables.id | |
| monster_roster | JSON | Yes | | `[{monster_id, count, hp_override}]` |

---

### maps
A node-graph map (dungeon or overworld) for an Adventure.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| adventure_id | UUID | No | FK → adventures.id, INDEX | |
| name | VARCHAR(200) | No | | |
| grid_width | INTEGER | No | DEFAULT 20, 5–100 | Grid columns |
| grid_height | INTEGER | No | DEFAULT 20, 5–100 | Grid rows |
| background_color | VARCHAR(20) | No | DEFAULT '#1a1a2e' | CSS hex colour |

---

### map_nodes
Individual nodes (rooms, areas) on a Map.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| map_id | UUID | No | FK → maps.id, INDEX | |
| label | VARCHAR(100) | No | | Display name |
| node_type | VARCHAR(20) | No | | MapNodeType enum |
| x | INTEGER | No | ≥ 0 | Grid column |
| y | INTEGER | No | ≥ 0 | Grid row |
| description | TEXT | Yes | | |
| encounter_id | UUID | Yes | FK → encounters.id | Optional linked encounter |
| loot_table_id | UUID | Yes | FK → loot_tables.id | Optional linked loot |
| notes | TEXT | Yes | | DM notes for this node |

---

### map_edges
Directed connections between MapNodes.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| map_id | UUID | No | FK → maps.id, INDEX | |
| from_node_id | UUID | No | FK → map_nodes.id | Source node |
| to_node_id | UUID | No | FK → map_nodes.id | Target node |
| label | VARCHAR(100) | Yes | | e.g. "locked door", "secret passage" |
| is_secret | BOOLEAN | No | DEFAULT false | Hidden from player-facing view |

---

### sessions
A single game session within an Adventure.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| adventure_id | UUID | No | FK → adventures.id, INDEX | |
| session_number | INTEGER | No | ≥ 1 | Sequential within adventure |
| title | VARCHAR(200) | No | | |
| date_planned | DATE | Yes | | Planned play date |
| status | VARCHAR(20) | No | DEFAULT 'Draft' | SessionStatus enum |
| actual_notes | TEXT | Yes | | DM notes written during/after play |
| attending_pc_ids | JSON | Yes | | `[UUID, ...]` — deduped on write |

---

### session_runbooks
The DM's session runbook (scenes, read-aloud, notes). One-to-one with Session (unique constraint on session_id). Older rows may have been AI-generated before Plan 86; new ones start blank.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| session_id | UUID | No | FK → sessions.id, UNIQUE, INDEX | 1:1 with session |
| model_used | VARCHAR(100) | No | | Where the runbook came from: `manual`, `starter`, or a model id on pre-Plan-86 rows |
| opening_scene | TEXT | No | | Read-aloud opening text |
| generated_at | TIMESTAMP | No | | UTC time the runbook was created |
| closing_hooks | TEXT | Yes | | Adventure hooks for next session |
| scenes | JSON | Yes | | `[{title, read_aloud, dm_notes, encounter_id}]`. `encounter_id` is optional: the fight the HUD can load. On save it is kept only when it names an encounter in the session's arc, otherwise set to null (`session_service._link_scene_encounters`, Plan 128; no schema change) |
| npc_dialog | JSON | Yes | | `[{npc_name, quotes:[str], improv_hooks:[str]}]` |
| encounter_flows | JSON | Yes | | `[{encounter_id, round_by_round_notes}]` |
| xp_awards | JSON | Yes | | `{pc_id: xp_amount}` |
| loot_awards | JSON | Yes | | `[{item_name, recipient_pc_id}]` |

### duels

A duel fought across separate devices (Plan 104). The Practice Arena is
otherwise stateless — a solo spar and a hot-seat duel live entirely on one
phone as a sealed JSON document — but two phones need an authority, so that
kind of fight gets a row. The rules engine is unchanged; this is only where the
document rests between turns.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | UUID | No | uuid4 | PK |
| campaign_id | UUID | No | | FK → campaigns.id, ON DELETE CASCADE |
| host_pc_id | UUID | No | | FK → player_characters.id, ON DELETE CASCADE — who called it |
| seat_ids | JSON | Yes | | `list[str]` of character ids in the ring. Holding one of those characters' links is what grants read and act |
| state | JSON | Yes | | The HMAC-sealed `ArenaState`, exactly as the referee last signed it |
| phase | VARCHAR(12) | No | `live` | `live` \| `over` |
| created_at | TIMESTAMPTZ | No | now | |
| updated_at | TIMESTAMPTZ | No | now | Bumped on every turn; a duel untouched for 4h stops showing as a challenge |

Authorization: a seat may read; only the seat whose turn it is may act. Enforced
in `services/duel_service.py`, never in the UI alone.

---

### beta_invites
Friends-beta invite codes (Plan 125, migration 0059). Admin-made; a new DM account needs one while `BETA_INVITES=required`.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| code | VARCHAR(40) | No | UNIQUE | `QL-` + 6 characters without look-alikes; matched case-insensitively |
| label | VARCHAR(120) | No | | Who it is for; greets them on the sign-up page |
| max_uses | INTEGER | No | 1–100, DEFAULT 3 | Accounts it may start |
| uses | INTEGER | No | DEFAULT 0 | Spent only when an account really starts |
| revoked | BOOLEAN | No | DEFAULT false | Stops new accounts; existing ones stay |
| created_by_email | VARCHAR(320) | No | | The admin who made it |
| created_at | TIMESTAMPTZ | No | | |

### feedback
Notes DMs send from the app's "Send feedback" sheet (Plan 125, migration 0059), and, since Plan 128, notes players send from their phone (`POST /api/play/{key}/feedback`).

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| email | VARCHAR(320) | No | INDEX | The sending DM (PII), or `player:<pc id>` for a player's note (the character's identity, never its link key); a player's text starts "From <character>'s phone:" |
| kind | VARCHAR(20) | No | | `loved` · `confusing` · `broken` · `idea` |
| text | TEXT | No | ≤ 4,000 chars | |
| page | VARCHAR(300) | No | | The app path it was sent from |
| viewport | VARCHAR(40) | No | | Screen size, e.g. `390×844` |
| seen | BOOLEAN | No | DEFAULT false | Admin inbox state |
| created_at | TIMESTAMPTZ | No | | |

`users.invite_code` (VARCHAR(40), nullable, indexed, migration 0059) records which invite started an account.

### uploads
The uploads ledger (Plan 130, migration 0060): one row per file a DM uploaded through `/api/uploads`, `/api/uploads/map` or `/api/uploads/model`. A DM's storage use is the sum of `size_bytes`, which the Free plan caps at 250 MB when `PRICING=on`. Files uploaded before the ledger have no row, so they count as 0. Rows aren't removed when a picture is replaced or a campaign deleted (TD-130a). They will feed the orphan sweep.

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| owner_email | VARCHAR(320) | No | INDEX | The uploading DM (PII) |
| url | VARCHAR(1000) | No | | Vercel Blob URL, or `/uploads/<file>` in local dev |
| size_bytes | BIGINT | No | DEFAULT 0 | |
| kind | VARCHAR(20) | No | DEFAULT 'portrait' | `portrait` (also notebook pictures) · `map` · `model` |
| created_at | TIMESTAMPTZ | No | | |

### users: plan columns (Plan 130)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| patreon_id | VARCHAR(64) | Yes | Linked Patreon user id (sign-in or "Link your Patreon"); one QuestLab account per Patreon id |
| patron_active | BOOLEAN | No | Patreon said `active_patron` at the last check |
| patron_tier_cents | INTEGER | No | The membership's monthly-equivalent cents at the last check: the larger of the entitled tier's price and the amount paid (a yearly payment counts at $40/year = $4/month). Patron needs ≥ 400 |
| patron_checked_at | TIMESTAMP (naive UTC) | Yes | The last Patreon check. A membership counts for 40 days after it |
| patron_comped | BOOLEAN | No | DEFAULT false, migration 0060. An admin gave this DM Patron |

---

### spells: ruleset (Plan 131)
`spells.ruleset` VARCHAR(4), nullable, indexed. `'2024'` for the SRD 5.2.1 rows, `'2014'` for the SRD 5.1 rows (generated into `integrations/dnd_rules/srd_spells_2014.py` by `scripts/build_srd51_spells.py`), NULL for a DM's homebrew, which is valid in both editions. Migration 0061 stamped the existing shared rows `'2024'`. At startup `spell_service.seed_srd_spells` inserts each edition while it has no rows. Lookups pass the PC's or campaign's ruleset (`SpellRepo.list_all(ruleset=)`, `get_by_name(ruleset=)`), so a name like "Fireball" resolves within one edition.

### Homebrew (Plan 132)
DM-made rows in `monster_stat_blocks`, `items` and `spells` carry `created_by_email` (SEC-003). The rules:
- Only the owner and admins see or change them. Lists filter with `auth_service.catalog_visible`, and so do the level-up guide, `learn_spell` and inventory adds.
- **Names must be unique** within what the DM can see (shared rows plus their own), because the builder, kits, shops and the level-up guide look things up by name. A clash returns 409.
- **Deleting:** `DELETE /api/monsters|items|spells/{id}` refuses (409, in plain words) while the row is in use:
  - monsters: in an encounter, or linked to an NPC;
  - items: in an inventory, a shop or a loot table;
  - spells: on a character's spell list.
- **Kits** match only shared rows, and a shop's name match prefers the shared row.
- **Magic weapons:** `items.properties.bonus` (e.g. `"+1"`, 0–3) is added to the attack and damage of a magic weapon by `attack_service.compute_attack` (Plan 132; the PHB seed already stored it).
- **Missing SRD 5.1 magic weapons** (Plan 135): `item_service.seed_missing_magic_items` adds the entries of `magic_items.SRD51_MAGIC_WEAPONS` at startup, by name. It counts only shared rows and never changes an existing row.

### Homebrew character options (Plans 133, 135)
A DM's own races, subclasses and feats. Each row belongs to its author (`created_by_email`, indexed; SEC-003) and is listed only to them. Every character in the author's campaigns can pick it (`homebrew_service.for_campaign` / `feats_for_campaign`).
- `ruleset` is `'2024'`, `'2014'` or NULL (both editions).
- Characters store the choice by name (`player_characters.race`, `.subclass`, `.feats`), so a row in use can't be deleted, renamed or narrowed to the other edition (409).
- Names may not repeat an SRD race, subclass or feat of either edition.
- The JSON shapes are validated in `domain/homebrew.py`.

| Table | Column | Type | Notes |
|---|---|---|---|
| homebrew_races (0062) | size, speed, ability_bonuses, ability_choice, skills, skill_choice, traits, languages, hp_per_level, darkvision | various | Plan 133. `ability_bonuses` applies to 2014 only. A race gives at most +6 in all |
| homebrew_races | speeds | JSON NULL | Plan 135 (0063). `{"fly": 30, "swim": 40}`, kinds fly/swim/climb/burrow, 5–120 ft in steps of 5. The builder copies it to `player_characters.speeds` |
| homebrew_races | natural_weapons | JSON NOT NULL `[]` | Plan 135. Up to 4 `{name, damage ("1d6" or flat "1"), damage_type, ability (STR/DEX/best), note}`. Computed into attacks (always proficient) by `attack_service.natural_attacks`, on the sheet and the phone's turn kit |
| homebrew_subclasses (0062) | character_class, features, always_prepared, blurb | various | Plan 133. `character_class` is the class name ("Paladin"), not the enum name |
| homebrew_subclasses | resources | JSON NOT NULL `[]` | Plan 135. Up to 4 counters `{name, level, recovery short/long, uses {level: n} XOR uses_formula, die {level: "d8"}, text}`; `SubclassResource.state_at` gives (max, die) at a PC level |
| homebrew_feats (0063) | name, ruleset, category, blurb, description, prerequisite, asi_options, repeatable, power_attack | various | Plan 135. `category`: general / origin / fighting_style / epic_boon. `asi_options`: NULL, `"any"` or ability codes (the +1, max 20). `prerequisite` is shown, not enforced. `power_attack`: `{to_hit −1..−10, damage 1..20, weapons ranged/heavy/melee/any}`, a toggle on the attacks it fits |
| campaigns | custom_origin | BOOLEAN NOT NULL DEFAULT false | Plan 133 (0062). Tasha's custom origin, 2014 campaigns only |
| player_characters | speeds | JSON NULL | Plan 135 (0063). Speeds besides walking; edited on the DM's sheet form |

### character_resources (Plan 135, 0064)
Per-PC counters: a homebrew subclass's counters plus hand-made ones (e.g. a book Battle Master's Superiority Dice). They refill on rests (`resource_service.refill_on_rest`).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | No | PK. A subclass counter's id is `uuid5(character id + lowercased name)`, so it can be spent before its row exists |
| character_id | UUID | No | FK → player_characters.id, indexed. Deleted with the PC (`CharacterRepo.delete`) |
| source | VARCHAR(10) | No | `custom` or `subclass` |
| name | VARCHAR(80) | No | Unique per sheet, ignoring case, subclass counters included (service-enforced, TD-135h) |
| max_uses | INTEGER | Yes | Custom only (1–100). NULL on a subclass row: its max is computed at read time from the PC's level |
| die | VARCHAR(3) | Yes | Custom only: d4–d12 or NULL. NULL on a subclass row: its die comes from the by-level table |
| recovery | VARCHAR(5) | No | `short`, `long` or `none` |
| uses_spent | INTEGER | No | 0 = full; rests reset it; clamped to the max on read |
| notes | VARCHAR(300) | Yes | |
| created_at | TIMESTAMPTZ | No | |

### Side quests (Plan 136, 0065)
A quest a DM writes in the Quest creator, and each character's private run through it. The shapes are validated in `domain/side_quest.py`.

**`side_quests`**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | No | PK |
| campaign_id | UUID | No | FK → campaigns.id, indexed. Deleted with the campaign |
| title | VARCHAR(120) | No | |
| teaser | VARCHAR(200) | No | DEFAULT ''. Shown on the phone before the quest is opened |
| steps | JSON | No | A list of `QuestStep`, at most 40: `id`, `kind` (read, choice, check, reply, end), `text` (≤ 4000, plain), `image_url`, `next`, `options` (`{label, next}`), `skills`, `dc`, `pass_next`, `fail_next`, `gp` (−1000 to 10000, paid on arrival; negative is a cost), `item_ids`, `party_sees` (Plan 140, choice steps: everyone on the quest sees the others' names on the options they picked; can change after sending), `damage` (Plan 141: dice like `1d4` or a flat number up to 99, taken on arrival, temp HP first, never below 1 HP; frozen once sent), `text_for` (Plan 141: character id → that character's own words in place of `text`, at most 12; words, so they can change after sending), `no_roll` (Plan 143, check steps: character ids who pass without rolling, at most 12; a ruling, so it can change after sending). **DM-only**: it holds the DCs, the links and every later step |
| start_step | VARCHAR(40) | Yes | The first step's id |
| status | VARCHAR(10) | No | `draft` or `sent`. Once sent, only words and pictures can change |
| created_at, updated_at | TIMESTAMPTZ | No | |
| sent_at | TIMESTAMPTZ | Yes | |

**`side_quest_runs`**: unique on (`quest_id`, `character_id`).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | No | PK |
| quest_id | UUID | No | FK → side_quests.id, indexed |
| character_id | UUID | No | FK → player_characters.id, indexed. Deleted with the character (`CharacterRepo.delete`) |
| step_id | VARCHAR(40) | No | The current step. Moved only by a compare-and-swap (`SideQuestRunRepo.claim_step`) |
| status | VARCHAR(10) | No | `new`, `active` or `done` |
| log | JSON | No | What the player did and got: `step_id`, `kind`, `at`, `option`, `skill`, `die`, `bonus`, `total`, `passed`, `real`, `reply`, `gp`, `items`, and on a choice `option_index` and `party` (Plan 140: true if the party could see the pick when it was made; only those picks show), and `damage` (Plan 141: HP actually lost, temp HP included), and `auto` (Plan 143: a check passed without a roll). Plan 143: an entry with `kind` `again` marks where the DM let them play again: everything before it is the earlier try, kept for the DM; the phone, the party's names and recaps read only what comes after. It records `taken_gp` (gold taken back; negative if a cost was given back), `taken_items`, `kept_items` (items no longer on the sheet, so not taken) and `recap` (what they had told the party). A reply is the player's own words: treat it like the character's notes |
| created_at | TIMESTAMPTZ | No | |
| opened_at, finished_at | TIMESTAMPTZ | Yes | |
| recap | TEXT | Yes | Plan 138. What the player told the party, up to 1500 characters. Their own words, shared by them with the whole campaign. May not match the log |
| recap_at | TIMESTAMPTZ | Yes | First shared. A correction keeps it |
| practice | BOOLEAN | No | DEFAULT false. Plan 142, migration 0068. The DM trying the quest as this character: pays and hurts nothing, never in another phone's "who picked what", no recap, can start over. Sending the quest to the character replaces it with a real run |

Deleting a quest removes its runs. Gold and items already paid stay on the sheet.

## PII Fields

| Table | Column | Classification |
|---|---|---|
| campaigns | dm_email | PII — DM identity |
| player_characters | player_name | PII — real person name |
| monster_stat_blocks | created_by_email | PII — creator identity |
| feedback | email | PII — DM identity (a player's note carries `player:<pc id>` instead) |
| uploads | owner_email | PII — DM identity |
| users | patreon_id, patron_* | Personal — the DM's Patreon account id and membership snapshot |

Do not log, export without authorisation, or include in error messages.

---

## Index Summary

| Table | Index | Columns |
|---|---|---|
| campaigns | ix_campaigns_dm_email | dm_email |
| adventures | ix_adventures_campaign_id | campaign_id |
| player_characters | ix_player_characters_campaign_id | campaign_id |
| player_characters | ix_player_characters_play_token (unique; Postgres only, since DuckDB drops it in `db.base.relax_duckdb_indexes`, Plan 128) | play_token |
| class_features | ix_class_features_character_class | character_class |
| character_features | ix_character_features_character_id | character_id |
| character_features | ix_character_features_feature_id | feature_id |
| items | ix_items_created_by_email | created_by_email |
| spells | ix_spells_created_by_email | created_by_email |
| spells | ix_spells_ruleset | ruleset (Plan 131) |
| loot_tables | ix_loot_tables_adventure_id | adventure_id |
| encounters | ix_encounters_adventure_id | adventure_id |
| maps | ix_maps_adventure_id | adventure_id |
| map_nodes | ix_map_nodes_map_id | map_id |
| map_edges | ix_map_edges_map_id | map_id |
| sessions | ix_sessions_adventure_id | adventure_id |
| session_runbooks | ix_session_runbooks_session_id | session_id |
| duels | ix_duels_campaign_id | campaign_id |
| duels | ix_duels_host_pc_id | host_pc_id |
| uploads | ix_uploads_owner_email | owner_email |
