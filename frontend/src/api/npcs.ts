import { api } from "./client";

export type NpcStatus =
  | "Alive"
  | "Dead"
  | "Missing"
  | "Imprisoned"
  | "Unknown";

export interface Npc {
  id: string;
  campaign_id: string;
  name: string;
  role: string | null;
  race: string | null;
  gender: string | null;
  age: string | null;
  // ── Prep face — rich content the DM reads *before* a session.
  appearance: string | null;
  personality: string | null;
  motivation: string | null;
  secret: string | null;
  dialog_hooks: string[] | null;
  tags: string[] | null;
  status: NpcStatus;
  location: string | null;
  monster_stat_block_id: string | null;
  portrait_url: string | null;
  notes: string | null;
  is_revealed: boolean;
  // ── Table face — short, scannable lines for at-the-table use (Plan 40).
  quick_who: string | null;
  want_now: string | null;
  knows: string[] | null;
  voice: string | null;
  secret_short: string | null;
  relationship_pings: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface NpcCreate {
  name: string;
  role?: string | null;
  race?: string | null;
  gender?: string | null;
  age?: string | null;
  appearance?: string | null;
  personality?: string | null;
  motivation?: string | null;
  secret?: string | null;
  dialog_hooks?: string[] | null;
  tags?: string[] | null;
  status?: NpcStatus;
  location?: string | null;
  monster_stat_block_id?: string | null;
  portrait_url?: string | null;
  notes?: string | null;
  is_revealed?: boolean;
  // ── Table face — Plan 40.
  quick_who?: string | null;
  want_now?: string | null;
  knows?: string[] | null;
  voice?: string | null;
  secret_short?: string | null;
  relationship_pings?: string[] | null;
}

export type NpcUpdate = Partial<NpcCreate>;

export const npcsApi = {
  list: (campaignId: string) => api.get<Npc[]>(`/campaigns/${campaignId}/npcs`),
  create: (campaignId: string, data: NpcCreate) =>
    api.post<Npc>(`/campaigns/${campaignId}/npcs`, data),
  get: (id: string) => api.get<Npc>(`/npcs/${id}`),
  update: (id: string, data: NpcUpdate) => api.patch<Npc>(`/npcs/${id}`, data),
  delete: (id: string) => api.delete(`/npcs/${id}`),
  generate: (campaignId: string, role: string, save = true) =>
    api.post<Npc>(`/campaigns/${campaignId}/npcs/generate`, { role, save }),
  generatePortrait: (id: string, styleHints?: string) =>
    api.post<Npc>(`/npcs/${id}/portrait`, { style_hints: styleHints ?? null }),
};

export const NPC_STATUS_COLORS: Record<NpcStatus, string> = {
  Alive: "var(--green2, #4caf50)",
  Dead: "var(--red, #c62828)",
  Missing: "var(--muted)",
  Imprisoned: "var(--crimson2, #8b1a1a)",
  Unknown: "var(--muted)",
};
