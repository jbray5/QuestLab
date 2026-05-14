import { api } from "./client";
import type { Spell, SpellListParams } from "./types";

export const spellsApi = {
  list: (params?: SpellListParams) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.level !== undefined) qs.set("level", String(params.level));
    if (params?.school) qs.set("school", params.school);
    if (params?.class_name) qs.set("class", params.class_name);
    if (params?.is_ritual !== undefined) qs.set("is_ritual", String(params.is_ritual));
    if (params?.is_concentration !== undefined) {
      qs.set("is_concentration", String(params.is_concentration));
    }
    const query = qs.toString();
    return api.get<Spell[]>(`/spells${query ? `?${query}` : ""}`);
  },
  get: (id: string) => api.get<Spell>(`/spells/${id}`),
};
