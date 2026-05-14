import { api } from "./client";
import type {
  CharacterFeature,
  CharacterFeatureCreate,
  ClassFeature,
} from "./types";

export const featuresApi = {
  listCatalog: (params?: { character_class?: string; max_level?: number }) => {
    const qs = new URLSearchParams();
    if (params?.character_class) qs.set("character_class", params.character_class);
    if (params?.max_level !== undefined) qs.set("max_level", String(params.max_level));
    const query = qs.toString();
    return api.get<ClassFeature[]>(`/class-features${query ? `?${query}` : ""}`);
  },
  list: (characterId: string) =>
    api.get<CharacterFeature[]>(`/characters/${characterId}/features`),
  learn: (characterId: string, body: CharacterFeatureCreate) =>
    api.post<CharacterFeature>(`/characters/${characterId}/features`, body),
  spend: (characterId: string, characterFeatureId: string) =>
    api.post<CharacterFeature>(
      `/characters/${characterId}/features/${characterFeatureId}/spend`,
    ),
  restore: (characterId: string, characterFeatureId: string) =>
    api.post<CharacterFeature>(
      `/characters/${characterId}/features/${characterFeatureId}/restore`,
    ),
  forget: (characterId: string, characterFeatureId: string) =>
    api.delete(`/characters/${characterId}/features/${characterFeatureId}`),
};
