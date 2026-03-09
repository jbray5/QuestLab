import { api } from "./client";
import type { AdventureMap, MapEdge, MapNode } from "./types";

export const mapsApi = {
  list: (adventureId: string) =>
    api.get<AdventureMap[]>(`/adventures/${adventureId}/maps`),
  create: (adventureId: string, title: string) =>
    api.post<AdventureMap>(`/adventures/${adventureId}/maps`, { title }),
  get: (id: string) => api.get<AdventureMap>(`/maps/${id}`),
  update: (id: string, data: { title?: string }) =>
    api.patch<AdventureMap>(`/maps/${id}`, data),
  delete: (id: string) => api.delete(`/maps/${id}`),

  addNode: (mapId: string, node: Omit<MapNode, "id">) =>
    api.post<MapNode>(`/maps/${mapId}/nodes`, node),
  updateNode: (mapId: string, nodeId: string, data: Partial<MapNode>) =>
    api.patch<MapNode>(`/maps/${mapId}/nodes/${nodeId}`, data),
  deleteNode: (mapId: string, nodeId: string) =>
    api.delete(`/maps/${mapId}/nodes/${nodeId}`),

  addEdge: (mapId: string, edge: Omit<MapEdge, "id">) =>
    api.post<MapEdge>(`/maps/${mapId}/edges`, edge),
  deleteEdge: (mapId: string, edgeId: string) =>
    api.delete(`/maps/${mapId}/edges/${edgeId}`),
};
