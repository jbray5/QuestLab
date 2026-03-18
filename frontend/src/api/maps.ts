import { api } from "./client";
import type { AdventureMap, MapEdge, MapNode, MapScale } from "./types";

// ── Map node types that the backend accepts ──────────────────────────────────
export type NodeType =
  // Dungeon-scale
  | "Room"
  | "Corridor"
  | "Entrance"
  | "Exit"
  | "Boss Chamber"
  | "Treasure Room"
  | "Trap Room"
  | "Secret Room"
  | "Stairs Up"
  | "Stairs Down"
  // World-scale
  | "Region"
  | "City"
  | "Town"
  | "Village"
  | "Landmark"
  | "Port"
  | "Fortress";

export const DUNGEON_NODE_TYPES: NodeType[] = [
  "Room",
  "Corridor",
  "Entrance",
  "Exit",
  "Boss Chamber",
  "Treasure Room",
  "Trap Room",
  "Secret Room",
  "Stairs Up",
  "Stairs Down",
];
export const WORLD_NODE_TYPES: NodeType[] = [
  "Region",
  "City",
  "Town",
  "Village",
  "Landmark",
  "Port",
  "Fortress",
];

// Colour for each node type (dark background — text uses var(--text))
export const NODE_COLORS: Record<NodeType, { bg: string; border: string }> = {
  // Dungeon-scale
  Room:           { bg: "#16161a", border: "#c9a84c" },
  Corridor:       { bg: "#1e1e24", border: "#8a8070" },
  Entrance:       { bg: "#0a1a0a", border: "#4caf50" },
  Exit:           { bg: "#0a1408", border: "#81c784" },
  "Boss Chamber": { bg: "#1a0808", border: "#ef5350" },
  "Treasure Room":{ bg: "#1a1400", border: "#ffd700" },
  "Trap Room":    { bg: "#1a0a00", border: "#ff8c00" },
  "Secret Room":  { bg: "#0a0a1a", border: "#9575cd" },
  "Stairs Up":    { bg: "#101820", border: "#80cbc4" },
  "Stairs Down":  { bg: "#120a18", border: "#ce93d8" },
  // World-scale
  Region:     { bg: "#1a1030", border: "#9575cd" },
  City:       { bg: "#2a1e00", border: "#f5d06a" },
  Town:       { bg: "#0a1e10", border: "#4caf50" },
  Village:    { bg: "#101808", border: "#8bc34a" },
  Landmark:   { bg: "#1a1408", border: "#a1887f" },
  Port:       { bg: "#08121e", border: "#4fc3f7" },
  Fortress:   { bg: "#1e0808", border: "#ef5350" },
};

export const DOOR_TYPE_OPTIONS = [
  "open",
  "locked",
  "secret",
  "trapped",
  "barricaded",
  "portcullis",
] as const;
export type DoorType = (typeof DOOR_TYPE_OPTIONS)[number];

export const DOOR_EDGE_STYLES: Record<
  DoorType,
  { stroke: string; strokeDasharray?: string }
> = {
  open:       { stroke: "#c9a84c" },
  locked:     { stroke: "#f5d06a", strokeDasharray: "8,4" },
  secret:     { stroke: "#9575cd", strokeDasharray: "4,4" },
  trapped:    { stroke: "#ef5350", strokeDasharray: "6,3" },
  barricaded: { stroke: "#8a8070", strokeDasharray: "10,3" },
  portcullis: { stroke: "#90a4ae" },
};

export const DOOR_ICONS: Record<DoorType, string> = {
  open:       "",
  locked:     "🔒",
  secret:     "👁",
  trapped:    "⚙",
  barricaded: "🚧",
  portcullis: "⊞",
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
    node: {
      label: string;
      node_type: NodeType;
      x: number;
      y: number;
      width?: number;
      height?: number;
      description?: string | null;
      encounter_id?: string | null;
    },
  ) => api.post<MapNode>(`/maps/${mapId}/nodes`, { ...node, map_id: mapId }),
  updateNode: (mapId: string, nodeId: string, data: Partial<MapNode>) =>
    api.patch<MapNode>(`/maps/${mapId}/nodes/${nodeId}`, data),
  deleteNode: (mapId: string, nodeId: string) =>
    api.delete(`/maps/${mapId}/nodes/${nodeId}`),

  listEdges: (mapId: string) => api.get<MapEdge[]>(`/maps/${mapId}/edges`),
  addEdge: (
    mapId: string,
    edge: {
      from_node_id: string;
      to_node_id: string;
      label?: string | null;
      door_type?: DoorType;
    },
  ) => api.post<MapEdge>(`/maps/${mapId}/edges`, { ...edge, map_id: mapId }),
  updateEdge: (mapId: string, edgeId: string, data: { label?: string | null; is_secret?: boolean; door_type?: DoorType }) =>
    api.patch<MapEdge>(`/maps/${mapId}/edges/${edgeId}`, data),
  deleteEdge: (mapId: string, edgeId: string) =>
    api.delete(`/maps/${mapId}/edges/${edgeId}`),

  generateWorld: (mapId: string, prompt: string) =>
    api.post<GenerateWorldResponse>(`/maps/${mapId}/generate`, { prompt }),
};
