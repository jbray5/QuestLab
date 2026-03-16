import { api } from "./client";
import type { AdventureMap, MapEdge, MapNode, MapScale } from "./types";

// ── Map node types that the backend accepts ──────────────────────────────────
export type NodeType =
  // Dungeon-scale
  | "Room" | "Corridor" | "Outdoor" | "Settlement" | "Dungeon" | "Lair"
  // World-scale
  | "Region" | "City" | "Town" | "Village" | "Landmark" | "Port" | "Fortress";

export const DUNGEON_NODE_TYPES: NodeType[] = [
  "Room", "Corridor", "Outdoor", "Settlement", "Dungeon", "Lair",
];
export const WORLD_NODE_TYPES: NodeType[] = [
  "Region", "City", "Town", "Village", "Landmark", "Port", "Fortress",
];

// Colour for each node type (dark background — text uses var(--text))
export const NODE_COLORS: Record<NodeType, { bg: string; border: string }> = {
  // Dungeon-scale
  Room:       { bg: "#16161a", border: "#c9a84c" },
  Corridor:   { bg: "#1e1e24", border: "#8a8070" },
  Outdoor:    { bg: "#0f2010", border: "#4caf50" },
  Settlement: { bg: "#1a120a", border: "#c9a84c" },
  Dungeon:    { bg: "#0a0a14", border: "#7986cb" },
  Lair:       { bg: "#14080a", border: "#c62828" },
  // World-scale
  Region:     { bg: "#1a1030", border: "#9575cd" },
  City:       { bg: "#2a1e00", border: "#f5d06a" },
  Town:       { bg: "#0a1e10", border: "#4caf50" },
  Village:    { bg: "#101808", border: "#8bc34a" },
  Landmark:   { bg: "#1a1408", border: "#a1887f" },
  Port:       { bg: "#08121e", border: "#4fc3f7" },
  Fortress:   { bg: "#1e0808", border: "#ef5350" },
};

export interface GenerateWorldResponse {
  nodes: MapNode[];
  edges: MapEdge[];
}

export const mapsApi = {
  list: (adventureId: string) =>
    api.get<AdventureMap[]>(`/adventures/${adventureId}/maps`),
  create: (adventureId: string, name: string, scale: MapScale = "Dungeon") =>
    api.post<AdventureMap>(`/adventures/${adventureId}/maps`, {
      name,
      adventure_id: adventureId,
      scale,
    }),
  get: (id: string) => api.get<AdventureMap>(`/maps/${id}`),
  update: (id: string, data: { name?: string }) =>
    api.patch<AdventureMap>(`/maps/${id}`, data),
  delete: (id: string) => api.delete(`/maps/${id}`),

  listNodes: (mapId: string) => api.get<MapNode[]>(`/maps/${mapId}/nodes`),
  addNode: (
    mapId: string,
    node: { label: string; node_type: NodeType; x: number; y: number; description?: string | null },
  ) => api.post<MapNode>(`/maps/${mapId}/nodes`, { ...node, map_id: mapId }),
  updateNode: (mapId: string, nodeId: string, data: Partial<MapNode>) =>
    api.patch<MapNode>(`/maps/${mapId}/nodes/${nodeId}`, data),
  deleteNode: (mapId: string, nodeId: string) =>
    api.delete(`/maps/${mapId}/nodes/${nodeId}`),

  listEdges: (mapId: string) => api.get<MapEdge[]>(`/maps/${mapId}/edges`),
  addEdge: (
    mapId: string,
    edge: { from_node_id: string; to_node_id: string; label?: string | null },
  ) => api.post<MapEdge>(`/maps/${mapId}/edges`, { ...edge, map_id: mapId }),
  deleteEdge: (mapId: string, edgeId: string) =>
    api.delete(`/maps/${mapId}/edges/${edgeId}`),

  generateWorld: (mapId: string, prompt: string) =>
    api.post<GenerateWorldResponse>(`/maps/${mapId}/generate`, { prompt }),
};
