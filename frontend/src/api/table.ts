import { api } from "./client";
import type {
  BattleMap,
  BattleMapCreate,
  BattleMapUpdate,
  TableProjection,
  TableStateRead,
  TableStateUpdate,
} from "./types";

/** Upload a large battle-map image (multipart). Returns the stored public URL. */
async function uploadMap(file: File): Promise<string> {
  const base = import.meta.env.VITE_API_BASE_URL || "/api";
  const email = localStorage.getItem("dm_email") || import.meta.env.VITE_DM_EMAIL || "";
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${base}/uploads/map`, {
    method: "POST",
    headers: email ? { "X-MS-CLIENT-PRINCIPAL-NAME": email } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body?.detail ?? res.statusText);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

export const tableApi = {
  // Battle-map library
  listMaps: (campaignId: string) =>
    api.get<BattleMap[]>(`/campaigns/${campaignId}/battle-maps`),
  createMap: (campaignId: string, data: BattleMapCreate) =>
    api.post<BattleMap>(`/campaigns/${campaignId}/battle-maps`, data),
  updateMap: (mapId: string, data: BattleMapUpdate) =>
    api.patch<BattleMap>(`/battle-maps/${mapId}`, data),
  generateBackdrop: (mapId: string, styleHints?: string) =>
    api.post<BattleMap>(`/battle-maps/${mapId}/backdrop`, { style_hints: styleHints ?? "" }),
  deleteMap: (mapId: string) => api.delete(`/battle-maps/${mapId}`),
  uploadMap,

  // Live table surface (DM console)
  getState: (sessionId: string) =>
    api.get<TableStateRead>(`/sessions/${sessionId}/table`),
  updateState: (sessionId: string, data: TableStateUpdate) =>
    api.patch<TableStateRead>(`/sessions/${sessionId}/table`, data),
  ping: (sessionId: string, x: number, y: number) =>
    api.post<void>(`/sessions/${sessionId}/table/ping`, { x, y }),
  generateTokenFigure: (sessionId: string, name: string, styleHints?: string) =>
    api.post<{ url: string }>(`/sessions/${sessionId}/table/figure`, {
      name,
      style_hints: styleHints ?? null,
    }),

  // Player-safe projection (projector)
  getProjection: (sessionId: string) =>
    api.get<TableProjection>(`/table/${sessionId}`),
};
