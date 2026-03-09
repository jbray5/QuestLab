import { api } from "./client";
import type { Monster } from "./types";

export interface MonsterListParams {
  search?: string;
  cr?: string;
  creature_type?: string;
}

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
};
