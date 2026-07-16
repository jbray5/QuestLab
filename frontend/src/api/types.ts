// ── Domain types mirroring FastAPI response models ──────────────────────────

export interface Campaign {
  id: string;
  name: string;
  setting: string | null;
  tone: string | null;
  description: string | null;
  world_notes: string | null;
  dm_email: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface CampaignCreate {
  name: string;
  setting?: string;
  tone?: string;
  description?: string;
  world_notes?: string;
}

export interface Adventure {
  id: string;
  campaign_id: string;
  title: string;
  synopsis: string | null;
  tier: string;
  act_count: number;
  npc_roster: Record<string, unknown>[] | null;
  location_notes: string | null;
  created_at: string | null;
}

export interface AdventureCreate {
  title: string;
  synopsis?: string;
  tier?: string;
  act_count?: number;
  npc_roster?: Record<string, unknown>[];
  location_notes?: string;
}

export interface PlayerCharacter {
  id: string;
  campaign_id: string;
  character_name: string;
  player_name: string;
  race: string;
  character_class: string;
  subclass: string | null;
  level: number;
  hp_current: number;
  hp_max: number;
  ac: number;
  speed: number;
  score_str: number;
  score_dex: number;
  score_con: number;
  score_int: number;
  score_wis: number;
  score_cha: number;
  background: string | null;
  backstory: string | null;
  notes: string | null;
  portrait_url: string | null;
  // Plan 00023 — combat state
  temp_hp: number;
  heroic_inspiration: boolean;
  concentration_on: string | null;
  death_save_successes: number;
  death_save_failures: number;
  // Plan 00024 — hit dice, exhaustion, currency
  hit_dice_spent: number;
  exhaustion: number;
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
  // Proficiencies — JSON columns on the backend (Plan 00022)
  saving_throw_proficiencies: string[] | null;
  skill_proficiencies: Record<string, number> | null;
  created_at: string;
  updated_at: string;
}

export interface SpellcastingStats {
  ability: "INT" | "WIS" | "CHA" | null;
  save_dc: number | null;
  attack_bonus: number | null;
}

// PATCH /characters/{id} body — mirrors backend PlayerCharacterUpdate.
// All fields optional. Includes combat-state + resource fields from Plans 23/24.
export type PlayerCharacterUpdate = Partial<
  Omit<PlayerCharacter, "id" | "campaign_id" | "created_at" | "updated_at">
>;

export interface PlayerCharacterCreate {
  character_name: string;
  player_name: string;
  race: string;
  character_class: string;
  subclass?: string;
  level?: number;
  hp_current?: number;
  hp_max?: number;
  ac?: number;
  speed?: number;
  score_str?: number;
  score_dex?: number;
  score_con?: number;
  score_int?: number;
  score_wis?: number;
  score_cha?: number;
  background?: string;
  backstory?: string;
  notes?: string;
  portrait_url?: string;
}

export interface Encounter {
  id: string;
  adventure_id: string;
  name: string;
  description: string | null;
  difficulty: string;
  xp_budget: number;
  terrain_notes: string | null;
  read_aloud_text: string | null;
  dm_notes: string | null;
  reward_xp: number;
  monster_roster: Record<string, unknown>[];
}

export interface EncounterCreate {
  adventure_id: string;
  name: string;
  description?: string;
  difficulty?: string;
  xp_budget?: number;
  monster_roster?: Record<string, unknown>[];
  terrain_notes?: string;
  read_aloud_text?: string;
  dm_notes?: string;
  reward_xp?: number;
}

export interface GameSession {
  id: string;
  adventure_id: string;
  session_number: number;
  title: string;
  status: string;
  date_planned: string | null;
  attending_pc_ids: string[];
  actual_notes: string | null;
  created_at: string | null;
}

export interface SessionCreate {
  session_number: number;
  title: string;
  date_planned?: string;
  attending_pc_ids?: string[];
  actual_notes?: string;
}

export interface RunbookScene {
  title: string;
  read_aloud: string;
  dm_notes: string;
  estimated_minutes: number;
}

export interface RunbookNpcDialog {
  npc_name: string;
  lines: string[];
  improv_hooks: string[];
}

export interface RunbookEncounterFlow {
  encounter_name: string;
  round_by_round: string[];
  tactics: string;
  terrain_notes: string;
}

export interface SessionRunbook {
  id: string;
  session_id: string;
  model_used: string;
  opening_scene: string;
  scenes: RunbookScene[];
  npc_dialog: RunbookNpcDialog[];
  encounter_flows: RunbookEncounterFlow[];
  closing_hooks: string | null;
  xp_awards: Record<string, number> | null;
  loot_awards: Record<string, unknown>[] | null;
  generated_at: string;
}

export interface MapNode {
  id: string;
  map_id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  node_type: string;
  description: string | null;
  encounter_id: string | null;
  notes: string | null;
  loot_notes: string | null;
  trap_notes: string | null;
}

export interface MapEdge {
  id: string;
  map_id: string;
  from_node_id: string;
  to_node_id: string;
  label: string | null;
  is_secret: boolean;
  door_type: string;
}

export type MapScale = "World" | "Dungeon";

export interface AdventureMap {
  id: string;
  adventure_id: string;
  name: string;
  scale: MapScale;
  grid_width: number;
  grid_height: number;
  background_color: string;
}

export interface MonsterAbility {
  name: string;
  desc: string;
}

export interface Monster {
  id: string;
  name: string;
  source: string;
  size: string;
  creature_type: string;
  alignment: string | null;
  ac: number;
  ac_notes: string | null;
  hp_average: number;
  hp_formula: string;
  speed: Record<string, number> | null;
  score_str: number;
  score_dex: number;
  score_con: number;
  score_int: number;
  score_wis: number;
  score_cha: number;
  saving_throws: Record<string, number> | null;
  skills: Record<string, number> | null;
  damage_resistances: string[];
  damage_immunities: string[];
  condition_immunities: string[] | null;
  senses: Record<string, number | string> | null;
  languages: string | null;
  challenge_rating: string;
  xp: number;
  proficiency_bonus: number;
  traits: MonsterAbility[] | null;
  actions: MonsterAbility[] | null;
  bonus_actions: MonsterAbility[] | null;
  reactions: MonsterAbility[] | null;
  legendary_actions: MonsterAbility[] | null;
  lair_actions: MonsterAbility[] | null;
  is_custom: boolean;
  created_by_email: string | null;
  image_url: string | null;
}

export interface RosterEntry {
  monster_id: string;
  count: number;
  name: string;
  xp: number;
  cr: string;
  hp: number;
  ac: number;
}

export interface Combatant {
  name: string;
  dex_score: number;
  hp: number;
  max_hp: number;
  type: "pc" | "monster" | "npc";
  // optional linkbacks for stat-block lookups + PC HP sync
  monster_id?: string | null;
  character_id?: string | null;
  // added by server
  roll?: number;
  initiative?: number;
  active?: boolean;
  defeated?: boolean;
  ac?: number | null;
  conditions?: string[];
}

// ── Persistent combat state (Plan 00015) ─────────────────────────────────────

export interface SessionCombatant {
  id: string;
  session_id: string;
  sort_index: number;
  name: string;
  dex_score: number;
  initiative_roll: number;
  hp_current: number;
  hp_max: number;
  type: "pc" | "monster" | "npc" | string;
  defeated: boolean;
  ac: number | null;
  monster_id: string | null;
  character_id: string | null;
  conditions: string[];
}

export interface SessionCombatantCreate {
  sort_index: number;
  name: string;
  dex_score: number;
  initiative_roll: number;
  hp_current: number;
  hp_max: number;
  type: "pc" | "monster" | "npc" | string;
  defeated?: boolean;
  ac?: number | null;
  monster_id?: string | null;
  character_id?: string | null;
  conditions?: string[];
}

export interface SessionCombatantUpdate {
  sort_index?: number;
  name?: string;
  hp_current?: number;
  hp_max?: number;
  defeated?: boolean;
  ac?: number;
  initiative_roll?: number;
  conditions?: string[];
}

export interface SessionCombatStateRead {
  session_id: string;
  round: number;
  combat_state: string;
  active_combatant_id: string | null;
  combatants: SessionCombatant[];
}

export interface SessionCombatStateWrite {
  round?: number;
  combat_state?: string;
  active_combatant_id?: string | null;
  combatants: SessionCombatantCreate[];
}

// ── Table View / battle maps (Plan 42) ───────────────────────────────────────

export interface FogRegion {
  id: string;
  name: string;
  points: number[][];
}

export interface BattleMap {
  id: string;
  campaign_id: string;
  name: string;
  image_url: string;
  width: number;
  height: number;
  grid_size: number | null;
  regions: FogRegion[];
  backdrop_url: string | null;
}

export interface BattleMapCreate {
  name: string;
  image_url: string;
  width: number;
  height: number;
  grid_size?: number | null;
  regions?: FogRegion[];
}

export interface BattleMapUpdate {
  name?: string;
  grid_size?: number | null;
  regions?: FogRegion[];
  backdrop_url?: string | null;
}

export interface BrushReveal {
  x: number;
  y: number;
  r: number;
}

export interface TableToken {
  id: string;
  kind: "pc" | "monster" | "custom" | "light";
  ref_id?: string | null;
  label: string;
  image_url?: string | null;
  x: number;
  y: number;
  size: number;
  color?: string | null;
}

export interface TableStateRead {
  session_id: string;
  active_map_id: string | null;
  fog_on: boolean;
  revealed_region_ids: string[];
  brush_reveals: BrushReveal[];
  tokens: TableToken[];
  darkness: number;
  title: string;
}

export interface TableStateUpdate {
  active_map_id?: string | null;
  fog_on?: boolean;
  revealed_region_ids?: string[];
  brush_reveals?: BrushReveal[];
  tokens?: TableToken[];
  darkness?: number;
  title?: string;
}

export interface TableMapSummary {
  id: string;
  image_url: string;
  width: number;
  height: number;
  grid_size: number | null;
  backdrop_url: string | null;
}

export interface TableProjection {
  session_id: string;
  map: TableMapSummary | null;
  fog_on: boolean;
  revealed_regions: number[][][];
  brush_reveals: BrushReveal[];
  tokens: TableToken[];
  darkness: number;
  title: string;
  active_token_ref: string | null;
  defeated_refs: string[];
}

// ── DM brief (Plan 43) — the glanceable session-2 format ─────────────────────

export interface BriefBeat {
  title: string;
  cue: string;
  kind: string;
  trigger_kind?: string | null;
  trigger_value?: number | null;
  target?: string | null;
  spotlight_pc?: string | null;
  dm_note?: string | null;
}

export interface BriefNpcFace {
  name: string;
  quick_who: string;
  want_now: string;
  knows: string[];
  voice: string;
  secret_short: string;
}

export interface BriefSpotlight {
  pc_name: string;
  flag: string;
}

export interface BriefRoad {
  label: string;
  flavor: string;
  pull: string;
}

export interface SessionBrief {
  id: string;
  session_id: string;
  model_used: string;
  generated_at: string;
  cold_open: string;
  premise: string;
  danger_dial: string;
  fallback: string | null;
  beats: BriefBeat[];
  npc_faces: BriefNpcFace[];
  spotlight: BriefSpotlight[];
  roads: BriefRoad[];
}

export interface SessionBriefUpdate {
  cold_open?: string;
  premise?: string;
  danger_dial?: string;
  fallback?: string | null;
  beats?: BriefBeat[];
  npc_faces?: BriefNpcFace[];
  spotlight?: BriefSpotlight[];
  roads?: BriefRoad[];
}

// ── Spells (Plan 00017 — SRD 5.5e catalog) ───────────────────────────────────

export interface Spell {
  id: string;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components_v: boolean;
  components_s: boolean;
  components_m: string | null;
  duration: string;
  is_ritual: boolean;
  is_concentration: boolean;
  description: string;
  higher_levels: string | null;
  damage_dice: string | null;
  damage_type: string | null;
  save_ability: string | null;
  attack_type: string | null;
  classes: string[];
  source: string;
}

export interface SpellListParams {
  q?: string;
  level?: number;
  school?: string;
  class_name?: string;
  is_ritual?: boolean;
  is_concentration?: boolean;
}

// ── Weapons (Plan 00018) ─────────────────────────────────────────────────────
// Weapons are Items with weapon_* fields populated.

export interface WeaponListParams {
  q?: string;
  category?: string;
  mastery?: string;
  property_name?: string;
  is_magic?: boolean;
}

export interface WeaponAttackPreview {
  weapon_id: string;
  character_id: string;
  ability: "STR" | "DEX";
  hit_bonus: number;
  damage_roll: string;
  damage_type: string;
  mastery: string | null;
  proficient: boolean;
  two_handed: boolean;
}

// ── PC inventory (Plan 00019) ────────────────────────────────────────────────

export interface CharacterItem {
  id: string;
  character_id: string;
  item_id: string;
  quantity: number;
  equipped: boolean;
  attuned: boolean;
  attuned_at: string | null;
  acquired_at: string;
  notes: string | null;
}

export interface CharacterItemCreate {
  item_id: string;
  quantity?: number;
  equipped?: boolean;
  attuned?: boolean;
  notes?: string;
}

export interface CharacterItemUpdate {
  quantity?: number;
  equipped?: boolean;
  attuned?: boolean;
  notes?: string;
}

// ── PC spell knowledge + slot tracking (Plan 00020) ──────────────────────────

export interface CharacterSpell {
  id: string;
  character_id: string;
  spell_id: string;
  known: boolean;
  prepared: boolean;
  added_at: string;
}

export interface CharacterSpellCreate {
  spell_id: string;
  known?: boolean;
  prepared?: boolean;
}

export interface CharacterSpellUpdate {
  known?: boolean;
  prepared?: boolean;
}

export interface SpellSlotLevelState {
  max: number;
  used: number;
  remaining: number;
}

export interface SpellSlotStateRead {
  character_id: string;
  levels: Record<string, SpellSlotLevelState>;
}

// ── Class features + rest (Plan 00021) ──────────────────────────────────────

export type RecoveryType = "short" | "long" | "none" | "per_turn";

export interface ClassFeature {
  id: string;
  name: string;
  character_class: string;
  subclass: string | null;
  level_acquired: number;
  recovery: RecoveryType;
  uses_formula: string;
  description: string;
  source: string;
}

export interface CharacterFeature {
  id: string;
  character_id: string;
  feature_id: string;
  feature_name: string;
  uses_spent: number;
  max_uses: number;
  recovery: RecoveryType;
  notes: string | null;
}

export interface CharacterFeatureCreate {
  feature_id: string;
  uses_spent?: number;
  notes?: string;
}

export interface RestSummary {
  character_id: string;
  character_name: string;
  rest_type: "short" | "long";
  features_restored: string[];
  slot_levels_restored: string[];
  hp_restored: number;
}
