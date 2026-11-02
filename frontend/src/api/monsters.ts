import { api } from "./client";
import type { Monster } from "./types";

export interface MonsterListParams {
  search?: string;
  cr?: string;
  creature_type?: string;
}

/**
 * Plan 132 — the fields a DM writes for a homebrew monster. The server stamps
 * the owner (`created_by_email`) and `is_custom`; the art and the Obsidian
 * note are set on the stat block afterwards.
 */
export type MonsterInput = Omit<
  Monster,
  "id" | "is_custom" | "created_by_email" | "image_url" | "figure_url" | "model_url" | "dm_note"
> & {
  /** A copy keeps the original's art. */
  image_url?: string | null;
  model_url?: string | null;
};

export const monstersApi = {
  list: (params?: MonsterListParams) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.cr) qs.set("cr", params.cr);
    if (params?.creature_type) qs.set("creature_type", params.creature_type);
    const query = qs.toString();
    return api.get<Monster[]>(`/monsters${query ? `?${query}` : ""}`);
  },
  get: (id: string) => api.get<Monster>(`/monsters/${id}`),
  /** Plan 132 — a new homebrew monster (blank, or a copy of any stat block). */
  create: (data: MonsterInput) => api.post<Monster>("/monsters", data, { quiet: true }),
  update: (id: string, data: Partial<Monster>) =>
    api.patch<Monster>(`/monsters/${id}`, data),
  /** Plan 132 — save the homebrew form; the form shows its own errors. */
  save: (id: string, data: MonsterInput) =>
    api.patch<Monster>(`/monsters/${id}`, data, { quiet: true }),
  updateImage: (id: string, image_url: string) =>
    api.patch<Monster>(`/monsters/${id}`, { image_url }),
  /**
   * Plan 132 — delete a homebrew monster. Refused (409) with a plain sentence
   * naming the encounters and NPCs that still use it; the stat block shows it by
   * the Delete button, so no toast too.
   */
  remove: (id: string) => api.delete(`/monsters/${id}`, { quiet: true }),
};
