import { api } from "./client";
import type {
  CharacterSpell,
  CharacterSpellCreate,
  CharacterSpellUpdate,
  SpellSlotStateRead,
} from "./types";

export const spellcastingApi = {
  // Spell knowledge
  listSpells: (characterId: string) =>
    api.get<CharacterSpell[]>(`/characters/${characterId}/spells`),
  learn: (characterId: string, body: CharacterSpellCreate) =>
    api.post<CharacterSpell>(`/characters/${characterId}/spells`, body),
  updateSpell: (
    characterId: string,
    characterSpellId: string,
    body: CharacterSpellUpdate,
  ) =>
    api.patch<CharacterSpell>(
      `/characters/${characterId}/spells/${characterSpellId}`,
      body,
    ),
  forget: (characterId: string, characterSpellId: string) =>
    api.delete(`/characters/${characterId}/spells/${characterSpellId}`),
  // Slots
  slotState: (characterId: string) =>
    api.get<SpellSlotStateRead>(`/characters/${characterId}/spell-slots`),
  expend: (characterId: string, level: number) =>
    api.post<SpellSlotStateRead>(
      `/characters/${characterId}/spell-slots/${level}/expend`,
    ),
  restore: (characterId: string, level: number) =>
    api.post<SpellSlotStateRead>(
      `/characters/${characterId}/spell-slots/${level}/restore`,
    ),
  longRest: (characterId: string) =>
    api.post<SpellSlotStateRead>(
      `/characters/${characterId}/spell-slots/long-rest`,
    ),
};
