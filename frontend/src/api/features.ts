import type { Ruleset } from "../lib/ruleset";
import { api } from "./client";
import type {
  CharacterFeature,
  CharacterFeatureCreate,
  ClassFeature,
} from "./types";

export const featuresApi = {
  /** Plan 131 — `ruleset` keeps one edition's rows (a 2014 PC never sees the 2024 Rage). */
  listCatalog: (params?: { character_class?: string; max_level?: number; ruleset?: Ruleset }) => {
    const qs = new URLSearchParams();
    if (params?.character_class) qs.set("character_class", params.character_class);
    if (params?.max_level !== undefined) qs.set("max_level", String(params.max_level));
    if (params?.ruleset) qs.set("ruleset", params.ruleset);
    const query = qs.toString();
    return api.get<ClassFeature[]>(`/class-features${query ? `?${query}` : ""}`);
  },
  list: (characterId: string) =>
    api.get<CharacterFeature[]>(`/characters/${characterId}/features`),
  learn: (characterId: string, body: CharacterFeatureCreate) =>
    api.post<CharacterFeature>(`/characters/${characterId}/features`, body),
  /** Grant every catalog feature the PC now qualifies for (level-up helper). */
  sync: (characterId: string) =>
    api.post<{ granted: string[] }>(`/characters/${characterId}/features/sync`),
  /** Spend uses; `amount` spends several pool points at once (Lay on Hands). */
  spend: (characterId: string, characterFeatureId: string, amount = 1) =>
    api.post<CharacterFeature>(
      `/characters/${characterId}/features/${characterFeatureId}/spend?amount=${amount}`,
    ),
  restore: (characterId: string, characterFeatureId: string, amount = 1) =>
    api.post<CharacterFeature>(
      `/characters/${characterId}/features/${characterFeatureId}/restore?amount=${amount}`,
    ),
  forget: (characterId: string, characterFeatureId: string) =>
    api.delete(`/characters/${characterId}/features/${characterFeatureId}`),
};
