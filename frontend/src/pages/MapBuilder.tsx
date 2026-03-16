import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MiniMap,
  Controls,
  Background,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { mapsApi, type NodeType } from "../api/maps";
import type { MapNode, MapEdge } from "../api/types";

const NODE_TYPES: NodeType[] = ["Room", "Corridor", "Outdoor", "Settlement", "Dungeon", "Lair"];

// Grid coords from backend are small integers (col/row).
// Scale up to pixels so nodes are spaced visibly on the canvas.
const GRID_SCALE = 150;

function toFlowNode(n: MapNode): Node {
  return {
    id: n.id,
    position: { x: n.x * GRID_SCALE, y: n.y * GRID_SCALE },
    data: { label: n.label },
    type: "default",
    style: {
      background: "var(--surface2)",
      border: "1px solid var(--gold)",
      color: "var(--text)",
      borderRadius: 6,
      fontSize: "0.8rem",
      fontFamily: "EB Garamond, Georgia, serif",
    },
  };
}

function toFlowEdge(e: MapEdge): Edge {
  return {
    id: e.id,
    source: e.from_node_id,
    target: e.to_node_id,
    label: e.label ?? undefined,
    style: { stroke: "var(--gold)", strokeWidth: 1.5 },
  };
}

export default function MapBuilder() {
  const { adventureId } = useParams<{ adventureId: string }>();
  const qc = useQueryClient();

  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [newMapName, setNewMapName] = useState("");
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [newNodeType, setNewNodeType] = useState<NodeType>("Room");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: maps = [] } = useQuery({
    queryKey: ["maps", adventureId],
    queryFn: () => mapsApi.list(adventureId!),
    enabled: !!adventureId,
  });

  const { data: mapNodes = [], isError: nodesError } = useQuery({
    queryKey: ["map-nodes", selectedMapId],
    queryFn: () => mapsApi.listNodes(selectedMapId!),
    enabled: !!selectedMapId,
    staleTime: 0,
  });

  const { data: mapEdges = [], isError: edgesError } = useQuery({
    queryKey: ["map-edges", selectedMapId],
    queryFn: () => mapsApi.listEdges(selectedMapId!),
    enabled: !!selectedMapId,
    staleTime: 0,
  });

  // Sync query data into ReactFlow state
  useEffect(() => {
    setNodes(mapNodes.map(toFlowNode));
  }, [mapNodes]);

  useEffect(() => {
    setEdges(mapEdges.map(toFlowEdge));
  }, [mapEdges]);

  const createMap = useMutation({
    mutationFn: () => mapsApi.create(adventureId!, newMapName || "New Map"),
    onSuccess: (m) => {
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ["maps", adventureId] });
      setSelectedMapId(m.id);
      setNodes([]);
      setEdges([]);
      setNewMapName("");
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const deleteMap = useMutation({
    mutationFn: (mapId: string) => mapsApi.delete(mapId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maps", adventureId] });
      setSelectedMapId(null);
      setNodes([]);
      setEdges([]);
      setDeleteConfirmId(null);
    },
  });

  const addNodeMut = useMutation({
    mutationFn: () =>
      mapsApi.addNode(selectedMapId!, {
        label: newNodeLabel || "Room",
        node_type: newNodeType,
        x: Math.round(Math.random() * 8 + 1),
        y: Math.round(Math.random() * 6 + 1),
        description: null,
      }),
    onSuccess: (n) => {
      setNodes((prev) => [...prev, toFlowNode(n)]);
      qc.invalidateQueries({ queryKey: ["map-nodes", selectedMapId] });
      setNewNodeLabel("");
    },
  });

  const addEdgeMut = useMutation({
    mutationFn: (conn: Connection) =>
      mapsApi.addEdge(selectedMapId!, {
        from_node_id: conn.source!,
        to_node_id: conn.target!,
        label: null,
      }),
    onSuccess: (e) => {
      setEdges((prev) => [...prev.filter((x) => x.id !== "temp"), toFlowEdge(e)]);
      qc.invalidateQueries({ queryKey: ["map-edges", selectedMapId] });
    },
  });

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((es) => applyEdgeChanges(changes, es)),
    [],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((es) => addEdge({ ...conn, id: "temp" }, es));
      addEdgeMut.mutate(conn);
    },
    [addEdgeMut],
  );

  function selectMap(id: string) {
    setSelectedMapId(id);
    setNodes([]);
    setEdges([]);
  }

  return (
    <div className="fade-in">
      <h1 style={{ marginBottom: "1rem" }}>Map Builder</h1>

      {/* Map selector */}
      <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        {maps.map((m) => (
          <div key={m.id} className="flex gap-1" style={{ alignItems: "center" }}>
            <button
              className={`btn ${selectedMapId === m.id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => selectMap(m.id)}
            >
              {m.name}
            </button>
            {deleteConfirmId === m.id ? (
              <>
                <span className="text-sm" style={{ color: "var(--crimson)", alignSelf: "center" }}>
                  Delete?
                </span>
                <button
                  className="btn btn-danger"
                  onClick={() => deleteMap.mutate(m.id)}
                  disabled={deleteMap.isPending}
                >
                  {deleteMap.isPending ? "…" : "Yes"}
                </button>
                <button className="btn btn-ghost" onClick={() => setDeleteConfirmId(null)}>
                  No
                </button>
              </>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteConfirmId(m.id)}
                style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", opacity: 0.6 }}
                title="Delete map"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2" style={{ alignItems: "center" }}>
          <input
            placeholder="New map name"
            value={newMapName}
            onChange={(e) => setNewMapName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createMap.mutate()}
            style={{ width: 160 }}
          />
          <button
            className="btn btn-secondary"
            onClick={() => createMap.mutate()}
            disabled={createMap.isPending}
          >
            {createMap.isPending ? "Creating…" : "+ Create Map"}
          </button>
        </div>
      </div>

      {createError && (
        <p className="text-sm" style={{ color: "var(--crimson)", marginBottom: "0.75rem" }}>
          Error creating map: {createError}
        </p>
      )}

      {selectedMapId && (
        <>
          {(nodesError || edgesError) && (
            <p className="text-sm" style={{ color: "var(--crimson)", marginBottom: "0.75rem" }}>
              Failed to load map data — check that the backend is running and you are authenticated.
            </p>
          )}

          {/* Node controls */}
          <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
            <input
              placeholder="Location name"
              value={newNodeLabel}
              onChange={(e) => setNewNodeLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNodeMut.mutate()}
              style={{ width: 160 }}
            />
            <select
              value={newNodeType}
              onChange={(e) => setNewNodeType(e.target.value as NodeType)}
              style={{ width: 120 }}
            >
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              className="btn btn-secondary"
              onClick={() => addNodeMut.mutate()}
              disabled={addNodeMut.isPending}
            >
              + Add Location
            </button>
          </div>

          <div
            style={{
              height: 520,
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {nodes.length === 0 && mapNodes.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--text-muted)",
                  background: "var(--surface)",
                }}
              >
                Add a location above to get started.
              </div>
            ) : nodes.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--text-muted)",
                  background: "var(--surface)",
                }}
              >
                Loading map…
              </div>
            ) : (
              <ReactFlow
                key={selectedMapId}
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                style={{ background: "var(--surface)" }}
              >
                <MiniMap style={{ background: "var(--surface2)" }} />
                <Controls />
                <Background color="var(--border)" />
              </ReactFlow>
            )}
          </div>

          <p className="text-sm text-muted" style={{ marginTop: "0.5rem" }}>
            Drag to pan · Scroll to zoom · Drag from a node handle to connect
          </p>
        </>
      )}

      {!selectedMapId && maps.length === 0 && (
        <p className="text-muted">Create a map to get started.</p>
      )}

      {!selectedMapId && maps.length > 0 && (
        <p className="text-muted">Select a map above to open it.</p>
      )}
    </div>
  );
}
