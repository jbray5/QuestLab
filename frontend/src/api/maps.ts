import { api } from "./client";
import type { AdventureMap, MapEdge, MapNode } from "./types";

// ── Map node types that the backend accepts ──────────────────────────────────
export type NodeType = "Room" | "Corridor" | "Outdoor" | "Settlement" | "Dungeon" | "Lair";

export const mapsApi = {
  list: (adventureId: string) =>
    api.get<AdventureMap[]>(`/adventures/${adventureId}/maps`),
  create: (adventureId: string, name: string) =>
    api.post<AdventureMap>(`/adventures/${adventureId}/maps`, {
      name,
      adventure_id: adventureId,
    }),
  get: (id: string) => api.get<AdventureMap>(`/maps/${id}`),
  update: (id: string, data: { name?: string }) =>
    api.patch<AdventureMap>(`/maps/${id}`, data),
  delete: (id: string) => api.delete(`/maps/${id}`),

  listNodes: (mapId: string) => api.get<MapNode[]>(`/maps/${mapId}/nodes`),
  addNode: (mapId: string, node: { label: string; node_type: NodeType; x: number; y: number; description?: string | null }) =>
    api.post<MapNode>(`/maps/${mapId}/nodes`, { ...node, map_id: mapId }),
  updateNode: (mapId: string, nodeId: string, data: Partial<MapNode>) =>
    api.patch<MapNode>(`/maps/${mapId}/nodes/${nodeId}`, data),
  deleteNode: (mapId: string, nodeId: string) =>
    api.delete(`/maps/${mapId}/nodes/${nodeId}`),

  listEdges: (mapId: string) => api.get<MapEdge[]>(`/maps/${mapId}/edges`),
  addEdge: (mapId: string, edge: { from_node_id: string; to_node_id: string; label?: string | null }) =>
    api.post<MapEdge>(`/maps/${mapId}/edges`, { ...edge, map_id: mapId }),
  deleteEdge: (mapId: string, edgeId: string) =>
    api.delete(`/maps/${mapId}/edges/${edgeId}`),
};
