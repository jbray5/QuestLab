import { api } from "./client";

/**
 * State-triggered combat beat (Plan 40 Change 3).
 *
 * Attached to a session and optionally a combatant. When the trigger
 * condition is observed in the combat tracker, the beat fires; the DM
 * dismisses the surfaced banner once delivered.
 */
export type CombatBeatTrigger = "hp_lte" | "round_gte";

export interface CombatBeat {
  id: string;
  session_id: string;
  combatant_id: string | null;
  trigger_kind: CombatBeatTrigger;
  trigger_value: number;
  text: string;
  sort_index: number;
  fired_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface CombatBeatCreate {
  combatant_id?: string | null;
  trigger_kind: CombatBeatTrigger;
  trigger_value: number;
  text: string;
  sort_index?: number;
}

export type CombatBeatUpdate = Partial<CombatBeatCreate>;

export const combatBeatsApi = {
  list: (sessionId: string) =>
    api.get<CombatBeat[]>(`/sessions/${sessionId}/combat-beats`),
  create: (sessionId: string, body: CombatBeatCreate) =>
    api.post<CombatBeat>(`/sessions/${sessionId}/combat-beats`, body),
  update: (beatId: string, body: CombatBeatUpdate) =>
    api.patch<CombatBeat>(`/combat-beats/${beatId}`, body),
  fire: (beatId: string) =>
    api.post<CombatBeat>(`/combat-beats/${beatId}/fire`, {}),
  dismiss: (beatId: string) =>
    api.post<CombatBeat>(`/combat-beats/${beatId}/dismiss`, {}),
  reset: (beatId: string) =>
    api.post<CombatBeat>(`/combat-beats/${beatId}/reset`, {}),
  delete: (beatId: string) => api.delete(`/combat-beats/${beatId}`),
};

/** Status helpers for UI styling. */
export function beatStatus(b: CombatBeat): "pending" | "fired" | "dismissed" {
  if (b.dismissed_at) return "dismissed";
  if (b.fired_at) return "fired";
  return "pending";
}
