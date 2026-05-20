import { api } from "./client";
import type {
  Combatant,
  GameSession,
  SessionCombatant,
  SessionCombatantUpdate,
  SessionCombatStateRead,
  SessionCombatStateWrite,
  SessionCreate,
  SessionRunbook,
} from "./types";

export const sessionsApi = {
  list: (adventureId: string) =>
    api.get<GameSession[]>(`/adventures/${adventureId}/sessions`),
  create: (adventureId: string, data: SessionCreate) =>
    api.post<GameSession>(`/adventures/${adventureId}/sessions`, data),
  get: (id: string) => api.get<GameSession>(`/sessions/${id}`),
  update: (id: string, data: Partial<SessionCreate>) =>
    api.patch<GameSession>(`/sessions/${id}`, data),
  delete: (id: string) => api.delete(`/sessions/${id}`),
  advance: (id: string) => api.post<GameSession>(`/sessions/${id}/advance`),
  updateNotes: (id: string, notes: string) =>
    api.patch<GameSession>(`/sessions/${id}/notes`, { notes }),
  rollInitiative: (id: string, combatants: Combatant[]) =>
    api.post<Combatant[]>(`/sessions/${id}/initiative`, combatants),
  getRunbook: (id: string) =>
    api.get<SessionRunbook | null>(`/sessions/${id}/runbook`),
  generateRunbook: (id: string, notes?: string) =>
    api.post<SessionRunbook>(`/sessions/${id}/runbook`, { notes: notes ?? "" }),
  patchRunbook: (id: string, update: Partial<SessionRunbook>) =>
    api.patch<SessionRunbook>(`/sessions/${id}/runbook`, update),
  // ── Persistent combat state (Plan 00015) ────────────────────────────────
  getCombatState: (id: string) =>
    api.get<SessionCombatStateRead>(`/sessions/${id}/combat`),
  saveCombatState: (id: string, payload: SessionCombatStateWrite) =>
    api.put<SessionCombatStateRead>(`/sessions/${id}/combat`, payload),
  clearCombatState: (id: string) => api.delete(`/sessions/${id}/combat`),
  patchCombatant: (
    id: string,
    combatantId: string,
    payload: SessionCombatantUpdate,
  ) =>
    api.patch<SessionCombatant>(
      `/sessions/${id}/combat/${combatantId}`,
      payload,
    ),
  advanceCombatTurn: (id: string) =>
    api.post<SessionCombatStateRead>(`/sessions/${id}/combat/advance`),
  // ── Item handouts (Plan 00016) ──────────────────────────────────────────
  recordHandout: (id: string, pcId: string, itemId: string) =>
    api.post<GameSession>(`/sessions/${id}/handouts`, {
      pc_id: pcId,
      item_id: itemId,
    }),
};
