import { api } from "./client";
import type {
  CharacterItem,
  CharacterItemCreate,
  CharacterItemUpdate,
} from "./types";

export const inventoryApi = {
  list: (characterId: string) =>
    api.get<CharacterItem[]>(`/characters/${characterId}/inventory`),
  add: (characterId: string, body: CharacterItemCreate) =>
    api.post<CharacterItem>(`/characters/${characterId}/inventory`, body),
  update: (
    characterId: string,
    characterItemId: string,
    body: CharacterItemUpdate,
  ) =>
    api.patch<CharacterItem>(
      `/characters/${characterId}/inventory/${characterItemId}`,
      body,
    ),
  remove: (characterId: string, characterItemId: string) =>
    api.delete(`/characters/${characterId}/inventory/${characterItemId}`),
};
