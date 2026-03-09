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
  scene_number: number;
  title: string;
  read_aloud: string;
  dm_notes: string;
  encounter_id: string | null;
  expected_duration_minutes: number;
}

export interface SessionRunbook {
  session_id: string;
  scenes: RunbookScene[];
  hooks: string[];
  loot: Record<string, unknown>[];
  total_xp: number;
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

export interface Monster {
  id: string;
  name: string;
  cr: string;
  size: string | null;
  type: string | null;
  alignment: string | null;
  hp: number | null;
  ac: number | null;
  speed: string | null;
  str_score: number;
  dex_score: number;
  con_score: number;
  int_score: number;
  wis_score: number;
  cha_score: number;
  traits: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  legendary_actions: Record<string, unknown>[];
  xp: number | null;
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
