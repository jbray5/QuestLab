import { api } from "./client";
import type { Encounter, EncounterCreate } from "./types";

export type EncounterDifficulty = "Low" | "Moderate" | "High" | "Deadly";

export interface RosterEntry {
  monster_id: string;
  count: number;
}

export interface DifficultyPreview {
  party_levels: number[];
  raw_xp: number;
  adjusted_xp: number;
  multiplier: number;
  easy_threshold: number;
  moderate_threshold: number;
  high_threshold: number;
  deadly_threshold: number;
  difficulty: EncounterDifficulty | null;
}

export interface ThemedMonsterSuggestion {
  monster_id: string;
  monster_name: string;
  count: number;
  rationale: string;
  challenge_rating: string;
  xp: number;
}

export interface ThemedSuggestionsResponse {
  encounter_concept: string;
  suggestions: ThemedMonsterSuggestion[];
}

export const encountersApi = {
  list: (adventureId: string) =>
    api.get<Encounter[]>(`/adventures/${adventureId}/encounters`),
  create: (adventureId: string, data: Omit<EncounterCreate, "adventure_id">) =>
    api.post<Encounter>(`/adventures/${adventureId}/encounters`, {
      ...data,
      adventure_id: adventureId,
    }),
  get: (id: string) => api.get<Encounter>(`/encounters/${id}`),
  update: (id: string, data: Partial<EncounterCreate> & { pc_levels?: number[] }) =>
    api.patch<Encounter>(`/encounters/${id}`, data),
  delete: (id: string) => api.delete(`/encounters/${id}`),

  // Plan 31 — dynamic encounter builder
  previewDifficulty: (adventureId: string, roster: RosterEntry[]) =>
    api.post<DifficultyPreview>(
      `/adventures/${adventureId}/encounters/preview-difficulty`,
      { roster },
    ),
  suggestMonsters: (adventureId: string, targetDifficulty: EncounterDifficulty = "Moderate") =>
    api.post<ThemedSuggestionsResponse>(
      `/adventures/${adventureId}/encounters/suggest-monsters`,
      { target_difficulty: targetDifficulty },
    ),
};
