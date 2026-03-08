# QuestLab — Data Dictionary

Every table, column, type, constraint, and enum value used in the QuestLab schema.
Schema source of truth: Postgres (via Alembic). DuckDB is used for local tests only.

---

## Enums

All enum values are stored as `VARCHAR` in Postgres (not native Postgres ENUMs).

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
| player_name | VARCHAR(100) | No | | Real-world player name |
| character_name | VARCHAR(100) | No | | In-game character name |
| race | VARCHAR(100) | No | | |
| character_class | VARCHAR(50) | No | | CharacterClass enum |
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
| portrait_url | VARCHAR(500) | Yes | | External image URL |
| backstory | TEXT | Yes | | |
| notes | TEXT | Yes | | DM/player session notes |
| saving_throw_proficiencies | JSON | Yes | | `[AbilityScore, ...]` |
| skill_proficiencies | JSON | Yes | | `{skill_name: "proficient"|"expertise"}` |
| feats | JSON | Yes | | `["feat name", ...]` |
| equipment | JSON | Yes | | `[{name, quantity, notes}]` |
| spells_known | JSON | Yes | | `[{name, level, school, prepared}]` |
| spell_slots | JSON | Yes | | `{level: {total, used}}` |
| created_at | TIMESTAMP | No | | |
| updated_at | TIMESTAMP | No | | |

**Computed field** (not stored): `proficiency_bonus = (level - 1) // 4 + 2`

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
AI-generated session runbook. One-to-one with Session (unique constraint on session_id).

| Column | Type | Nullable | Constraints | Notes |
|---|---|---|---|---|
| id | UUID | No | PK | |
| session_id | UUID | No | FK → sessions.id, UNIQUE, INDEX | 1:1 with session |
| model_used | VARCHAR(100) | No | | Claude model ID, e.g. claude-opus-4-6 |
| opening_scene | TEXT | No | | Read-aloud opening text |
| generated_at | TIMESTAMP | No | | UTC time of AI generation |
| closing_hooks | TEXT | Yes | | Adventure hooks for next session |
| scenes | JSON | Yes | | `[{title, read_aloud, dm_notes, encounter_id}]` |
| npc_dialog | JSON | Yes | | `[{npc_name, quotes:[str], improv_hooks:[str]}]` |
| encounter_flows | JSON | Yes | | `[{encounter_id, round_by_round_notes}]` |
| xp_awards | JSON | Yes | | `{pc_id: xp_amount}` |
| loot_awards | JSON | Yes | | `[{item_name, recipient_pc_id}]` |

---

## PII Fields

| Table | Column | Classification |
|---|---|---|
| campaigns | dm_email | PII — DM identity |
| player_characters | player_name | PII — real person name |
| monster_stat_blocks | created_by_email | PII — creator identity |

Do not log, export without authorisation, or include in error messages.

---

## Index Summary

| Table | Index | Columns |
|---|---|---|
| campaigns | ix_campaigns_dm_email | dm_email |
| adventures | ix_adventures_campaign_id | campaign_id |
| player_characters | ix_player_characters_campaign_id | campaign_id |
| loot_tables | ix_loot_tables_adventure_id | adventure_id |
| encounters | ix_encounters_adventure_id | adventure_id |
| maps | ix_maps_adventure_id | adventure_id |
| map_nodes | ix_map_nodes_map_id | map_id |
| map_edges | ix_map_edges_map_id | map_id |
| sessions | ix_sessions_adventure_id | adventure_id |
| session_runbooks | ix_session_runbooks_session_id | session_id |
