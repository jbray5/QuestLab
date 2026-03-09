import { api } from "./client";
import type { Encounter, EncounterCreate } from "./types";

export const encountersApi = {
  list: (adventureId: string) =>
    api.get<Encounter[]>(`/adventures/${adventureId}/encounters`),
  create: (adventureId: string, data: EncounterCreate) =>
    api.post<Encounter>(`/adventures/${adventureId}/encounters`, data),
  get: (id: string) => api.get<Encounter>(`/encounters/${id}`),
  update: (id: string, data: Partial<EncounterCreate>) =>
    api.patch<Encounter>(`/encounters/${id}`, data),
  delete: (id: string) => api.delete(`/encounters/${id}`),
};
