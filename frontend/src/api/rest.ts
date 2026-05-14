import { api } from "./client";
import type { RestSummary } from "./types";

export const restApi = {
  // Per-PC
  shortRestPc: (characterId: string) =>
    api.post<RestSummary>(`/characters/${characterId}/rest/short`),
  longRestPc: (characterId: string) =>
    api.post<RestSummary>(`/characters/${characterId}/rest/long`),
  // Party (per session)
  shortRestParty: (sessionId: string) =>
    api.post<RestSummary[]>(`/sessions/${sessionId}/rest/short`),
  longRestParty: (sessionId: string) =>
    api.post<RestSummary[]>(`/sessions/${sessionId}/rest/long`),
};
