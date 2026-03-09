import { useCallback, useState } from "react";
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
import { mapsApi } from "../api/maps";
import type { AdventureMap } from "../api/types";

function toFlowNodes(map: AdventureMap): Node[] {
  return map.nodes.map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
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
  }));
}

function toFlowEdges(map: AdventureMap): Edge[] {
  return map.edges.map((e) => ({
    id: e.id,
    source: e.source_id,
    target: e.target_id,
    label: e.label ?? undefined,
    style: { stroke: "var(--gold)", strokeWidth: 1.5 },
  }));
}

export default function MapBuilder() {
  const { adventureId } = useParams<{ adventureId: string }>();
  const qc = useQueryClient();

  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [newMapTitle, setNewMapTitle] = useState("");
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const { data: maps = [] } = useQuery({
    queryKey: ["maps", adventureId],
    queryFn: () => mapsApi.list(adventureId!),
    enabled: !!adventureId,
  });

  useQuery({
    queryKey: ["map", selectedMapId],
    queryFn: () => mapsApi.get(selectedMapId!),
    enabled: !!selectedMapId,
    select: (map) => {
      setNodes(toFlowNodes(map));
      setEdges(toFlowEdges(map));
      return map;
    },
  });

  const createMap = useMutation({
    mutationFn: () => mapsApi.create(adventureId!, newMapTitle || "New Map"),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["maps", adventureId] });
      setSelectedMapId(m.id);
      setNewMapTitle("");
    },
  });

  const addNode = useMutation({
    mutationFn: () =>
      mapsApi.addNode(selectedMapId!, {
        label: newNodeLabel || "Room",
        x: Math.random() * 400 + 50,
        y: Math.random() * 300 + 50,
        node_type: "location",
        description: null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["map", selectedMapId] });
      setNewNodeLabel("");
    },
  });

  const addEdgeMut = useMutation({
    mutationFn: (conn: Connection) =>
      mapsApi.addEdge(selectedMapId!, {
        source_id: conn.source!,
        target_id: conn.target!,
        label: null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map", selectedMapId] }),
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
      setEdges((es) => addEdge(conn, es));
      addEdgeMut.mutate(conn);
    },
    [addEdgeMut],
  );

  return (
    <div className="fade-in">
      <h1 style={{ marginBottom: "1rem" }}>Map Builder</h1>

      <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        {maps.map((m) => (
          <button
            key={m.id}
            className={`btn ${selectedMapId === m.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setSelectedMapId(m.id)}
          >
            {m.title}
          </button>
        ))}
        <div className="flex gap-2">
          <input
            placeholder="New map title"
            value={newMapTitle}
            onChange={(e) => setNewMapTitle(e.target.value)}
            style={{ width: 160 }}
          />
          <button className="btn btn-secondary" onClick={() => createMap.mutate()} disabled={createMap.isPending}>
            + Create Map
          </button>
        </div>
      </div>

      {selectedMapId && (
        <>
          <div className="flex gap-2" style={{ marginBottom: "1rem" }}>
            <input
              placeholder="Node label"
              value={newNodeLabel}
              onChange={(e) => setNewNodeLabel(e.target.value)}
              style={{ width: 160 }}
            />
            <button className="btn btn-secondary" onClick={() => addNode.mutate()} disabled={addNode.isPending}>
              + Add Location
            </button>
          </div>

          <div
            style={{
              height: 520,
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              fitView
              style={{ background: "var(--surface)" }}
            >
              <MiniMap style={{ background: "var(--surface2)" }} />
              <Controls />
              <Background color="var(--border)" />
            </ReactFlow>
          </div>

          <p className="text-sm text-muted" style={{ marginTop: "0.5rem" }}>
            Drag to pan · Scroll to zoom · Drag between nodes to connect
          </p>
        </>
      )}

      {!selectedMapId && maps.length === 0 && (
        <p className="text-muted">Create a map to get started.</p>
      )}
    </div>
  );
}
