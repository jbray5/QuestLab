import { api } from "./client";

// Plan 56 — the Town Crier. Every route is DM-authenticated; there is no
// capability-URL variant, because these post into the DM's real Discord.
//
// Note what CrierChannel does NOT carry: the webhook URL. It is a bearer
// credential (anyone holding it can post to that channel forever), so the
// server strips it and sends `configured` + a masked tail instead. The URL
// is write-only from this client's point of view.

export interface CrierChannel {
  id: string;
  label: string;
  configured: boolean;
  url_hint: string;
  sort_order: number;
}

export interface CrierNpc {
  id: string;
  name: string;
  avatar_url: string | null;
  /** Discord integer colour, 0xRRGGBB. */
  embed_color: number;
  sort_order: number;
}

export interface CrierPost {
  id: string;
  channel_label: string;
  npc_name: string;
  content: string | null;
  embed_description: string | null;
  status: "sent" | "failed";
  error: string | null;
  sent_at: string;
}

/** Discord's own limits — mirrored here so the UI can warn before the API rejects. */
export const MAX_CONTENT = 2000;
export const MAX_EMBED = 4096;

/** 0xRRGGBB integer → CSS hex, for the preview's accent bar. */
export function colorToCss(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** CSS hex → 0xRRGGBB integer, for the roster editor's colour input. */
export function cssToColor(css: string): number {
  return parseInt(css.replace("#", ""), 16) || 0;
}

export const crierApi = {
  listChannels: (campaignId: string) =>
    api.get<CrierChannel[]>(`/campaigns/${campaignId}/crier/channels`),
  createChannel: (campaignId: string, data: { label: string; webhook_url: string }) =>
    api.post<CrierChannel>(`/campaigns/${campaignId}/crier/channels`, data),
  updateChannel: (
    channelId: string,
    data: { label?: string; webhook_url?: string; sort_order?: number },
  ) => api.patch<CrierChannel>(`/crier/channels/${channelId}`, data),
  removeChannel: (channelId: string) => api.delete<void>(`/crier/channels/${channelId}`),

  listNpcs: (campaignId: string) => api.get<CrierNpc[]>(`/campaigns/${campaignId}/crier/npcs`),
  createNpc: (
    campaignId: string,
    data: { name: string; avatar_url?: string | null; embed_color?: number },
  ) => api.post<CrierNpc>(`/campaigns/${campaignId}/crier/npcs`, data),
  updateNpc: (
    npcId: string,
    data: { name?: string; avatar_url?: string | null; embed_color?: number },
  ) => api.patch<CrierNpc>(`/crier/npcs/${npcId}`, data),
  removeNpc: (npcId: string) => api.delete<void>(`/crier/npcs/${npcId}`),

  send: (
    campaignId: string,
    data: {
      channel_id: string;
      npc_id: string;
      content?: string | null;
      embed_description?: string | null;
    },
  ) => api.post<CrierPost>(`/campaigns/${campaignId}/crier/send`, data),
  listPosts: (campaignId: string) => api.get<CrierPost[]>(`/campaigns/${campaignId}/crier/posts`),
};
