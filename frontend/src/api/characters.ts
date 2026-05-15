import { api } from "./client";
import type {
  PlayerCharacter,
  PlayerCharacterCreate,
  PlayerCharacterUpdate,
  SpellcastingStats,
} from "./types";

export const charactersApi = {
  list: (campaignId: string) =>
    api.get<PlayerCharacter[]>(`/campaigns/${campaignId}/characters`),
  create: (campaignId: string, data: PlayerCharacterCreate) =>
    api.post<PlayerCharacter>(`/campaigns/${campaignId}/characters`, data),
  get: (id: string) => api.get<PlayerCharacter>(`/characters/${id}`),
  update: (id: string, data: PlayerCharacterUpdate) =>
    api.patch<PlayerCharacter>(`/characters/${id}`, data),
  delete: (id: string) => api.delete(`/characters/${id}`),
  updateImage: (id: string, portrait_url: string) =>
    api.patch<PlayerCharacter>(`/characters/${id}`, { portrait_url }),
  // Plan 00022 — computed bonuses
  skillBonuses: (id: string) =>
    api.get<Record<string, number>>(`/characters/${id}/skill-bonuses`),
  savingThrows: (id: string) =>
    api.get<Record<string, number>>(`/characters/${id}/saving-throws`),
  // Plan 00023 — combat state actions
  applyDamage: (id: string, amount: number) =>
    api.post<PlayerCharacter>(`/characters/${id}/damage`, { amount }),
  applyHealing: (id: string, amount: number) =>
    api.post<PlayerCharacter>(`/characters/${id}/heal`, { amount }),
  resolveDeathSave: (id: string, d20: number) =>
    api.post<PlayerCharacter>(`/characters/${id}/death-save`, { d20 }),
  // Plan 00024 — caster stats + hit dice
  spellcastingStats: (id: string) =>
    api.get<SpellcastingStats>(`/characters/${id}/spellcasting-stats`),
  spendHitDice: (id: string, count: number) =>
    api.post<PlayerCharacter>(`/characters/${id}/spend-hit-dice`, { count }),
};
