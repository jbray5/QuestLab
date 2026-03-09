// ── Domain types mirroring FastAPI response models ──────────────────────────

export interface Campaign {
  id: string;
  name: string;
  setting: string | null;
  tone: string | null;
  dm_email: string;
  created_at: string | null;
}

export interface CampaignCreate {
  name: string;
  setting?: string;
  tone?: string;
}

export interface Adventure {
  id: string;
  campaign_id: string;
  title: string;
  synopsis: string | null;
  status: string;
  created_at: string | null;
}

export interface AdventureCreate {
  title: string;
  synopsis?: string;
}

export interface PlayerCharacter {
  id: string;
  campaign_id: string;
  name: string;
  player_name: string | null;
  race: string | null;
  char_class: string | null;
  level: number;
  hp: number;
  max_hp: number;
  ac: number;
  str_score: number;
  dex_score: number;
  con_score: number;
  int_score: number;
  wis_score: number;
  cha_score: number;
  background: string | null;
  notes: string | null;
}

export interface PlayerCharacterCreate {
  name: string;
  player_name?: string;
  race?: string;
  char_class?: string;
  level?: number;
  hp?: number;
  max_hp?: number;
  ac?: number;
  str_score?: number;
  dex_score?: number;
  con_score?: number;
  int_score?: number;
  wis_score?: number;
  cha_score?: number;
  background?: string;
  notes?: string;
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
  dm_notes: string | null;
  created_at: string | null;
}

export interface SessionCreate {
  session_number?: number;
  title?: string;
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
  node_type: string;
  description: string | null;
  encounter_id: string | null;
  notes: string | null;
}

export interface MapEdge {
  id: string;
  map_id: string;
  from_node_id: string;
  to_node_id: string;
  label: string | null;
  is_secret: boolean;
}

export interface AdventureMap {
  id: string;
  adventure_id: string;
  name: string;
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
}

export interface Combatant {
  name: string;
  dex_score: number;
  hp: number;
  max_hp: number;
  type: "pc" | "monster" | "npc";
  // added by server
  roll?: number;
  initiative?: number;
  active?: boolean;
  defeated?: boolean;
}
