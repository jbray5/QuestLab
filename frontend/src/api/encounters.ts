import { api } from "./client";
import type { Encounter, EncounterCreate } from "./types";

export const encountersApi = {
  list: (adventureId: string) =>
    api.get<Encounter[]>(`/adventures/${adventureId}/encounters`),
  create: (adventureId: string, data: Omit<EncounterCreate, "adventure_id">) =>
    api.post<Encounter>(`/adventures/${adventureId}/encounters`, {
      ...data,
      adventure_id: adventureId,
    }),
  get: (id: string) => api.get<Encounter>(`/encounters/${id}`),
  update: (id: string, data: Partial<EncounterCreate>) =>
    api.patch<Encounter>(`/encounters/${id}`, data),
  delete: (id: string) => api.delete(`/encounters/${id}`),
};
