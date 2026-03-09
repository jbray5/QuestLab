import { api } from "./client";
import type { Combatant, GameSession, SessionCreate, SessionRunbook } from "./types";

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
};
