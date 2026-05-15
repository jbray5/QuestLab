import { api } from "./client";
import type { PlayerCharacter, PlayerCharacterCreate } from "./types";

export const charactersApi = {
  list: (campaignId: string) =>
    api.get<PlayerCharacter[]>(`/campaigns/${campaignId}/characters`),
  create: (campaignId: string, data: PlayerCharacterCreate) =>
    api.post<PlayerCharacter>(`/campaigns/${campaignId}/characters`, data),
  get: (id: string) => api.get<PlayerCharacter>(`/characters/${id}`),
  update: (id: string, data: Partial<PlayerCharacterCreate>) =>
    api.patch<PlayerCharacter>(`/characters/${id}`, data),
  delete: (id: string) => api.delete(`/characters/${id}`),
  updateImage: (id: string, portrait_url: string) =>
    api.patch<PlayerCharacter>(`/characters/${id}`, { portrait_url }),
  // Plan 00022 — computed bonuses
  skillBonuses: (id: string) =>
    api.get<Record<string, number>>(`/characters/${id}/skill-bonuses`),
  savingThrows: (id: string) =>
    api.get<Record<string, number>>(`/characters/${id}/saving-throws`),
};
