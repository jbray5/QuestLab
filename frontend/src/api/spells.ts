import { api } from "./client";
import type { Spell, SpellInput, SpellListParams } from "./types";

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
    if (params?.ruleset) qs.set("ruleset", params.ruleset);
    const query = qs.toString();
    return api.get<Spell[]>(`/spells${query ? `?${query}` : ""}`);
  },
  get: (id: string) => api.get<Spell>(`/spells/${id}`),
  // Plan 132 — DM homebrew. The form shows errors in place, so these are quiet (no toast too).
  create: (body: SpellInput) => api.post<Spell>("/spells", body, { quiet: true }),
  update: (id: string, body: Partial<SpellInput>) =>
    api.patch<Spell>(`/spells/${id}`, body, { quiet: true }),
  /** Refused (409) with a plain message while a character knows the spell. */
  // quiet: the Spells page shows a refused delete (the spell is in use) next to the button.
  remove: (id: string) => api.delete(`/spells/${id}`, { quiet: true }),
};
