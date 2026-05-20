// Player-scope API client (Plan 00025).
//
// Mirrors the DM /characters endpoints but lives under /play/{pcId}/* and
// does not require any auth header — the UUID in the URL is the implicit
// secret. Used by frontend/src/pages/PlayerView.tsx.

import { api } from "./client";
import type {
  CharacterFeature,
  CharacterItem,
  CharacterSpell,
  PlayerCharacter,
  SpellSlotStateRead,
  SpellcastingStats,
} from "./types";

export interface PlayerStatePatch {
  heroic_inspiration?: boolean;
  concentration_on?: string | null;
  exhaustion?: number;
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
}

export interface TurnState {
  active: boolean;
  session_id?: string;
  round?: number;
  active_combatant_name?: string;
}

export interface CombatState {
  in_combat: boolean;
  conditions: string[];
  defeated: boolean;
}

export interface VisibleNpc {
  id: string;
  name: string;
  role: string | null;
  race: string | null;
  appearance: string | null;
  location: string | null;
  status: string;
  portrait_url: string | null;
}

export const playApi = {
  get: (pcId: string) => api.get<PlayerCharacter>(`/play/${pcId}`),
  spellcastingStats: (pcId: string) =>
    api.get<SpellcastingStats>(`/play/${pcId}/spellcasting-stats`),
  skillBonuses: (pcId: string) =>
    api.get<Record<string, number>>(`/play/${pcId}/skill-bonuses`),
  savingThrows: (pcId: string) =>
    api.get<Record<string, number>>(`/play/${pcId}/saving-throws`),
  spellSlots: (pcId: string) =>
    api.get<SpellSlotStateRead>(`/play/${pcId}/spell-slots`),
  spells: (pcId: string) => api.get<CharacterSpell[]>(`/play/${pcId}/spells`),
  features: (pcId: string) => api.get<CharacterFeature[]>(`/play/${pcId}/features`),
  inventory: (pcId: string) => api.get<CharacterItem[]>(`/play/${pcId}/inventory`),
  turnState: (pcId: string) => api.get<TurnState>(`/play/${pcId}/turn-state`),
  combatState: (pcId: string) => api.get<CombatState>(`/play/${pcId}/combat-state`),
  npcs: (pcId: string) => api.get<VisibleNpc[]>(`/play/${pcId}/npcs`),

  applyDamage: (pcId: string, amount: number) =>
    api.post<PlayerCharacter>(`/play/${pcId}/damage`, { amount }),
  applyHealing: (pcId: string, amount: number) =>
    api.post<PlayerCharacter>(`/play/${pcId}/heal`, { amount }),
  resolveDeathSave: (pcId: string, d20: number) =>
    api.post<PlayerCharacter>(`/play/${pcId}/death-save`, { d20 }),
  spendHitDice: (pcId: string, count: number) =>
    api.post<PlayerCharacter>(`/play/${pcId}/spend-hit-dice`, { count }),
  expendSpellSlot: (pcId: string, level: number) =>
    api.post<SpellSlotStateRead>(`/play/${pcId}/spell-slots/${level}/expend`),
  restoreSpellSlot: (pcId: string, level: number) =>
    api.post<SpellSlotStateRead>(`/play/${pcId}/spell-slots/${level}/restore`),
  spendFeature: (pcId: string, characterFeatureId: string) =>
    api.post<CharacterFeature>(
      `/play/${pcId}/features/${characterFeatureId}/spend`,
    ),
  patchState: (pcId: string, patch: PlayerStatePatch) =>
    api.patch<PlayerCharacter>(`/play/${pcId}/state`, patch),
};
