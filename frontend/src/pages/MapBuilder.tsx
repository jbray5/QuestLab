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
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  mapsApi,
  NODE_COLORS,
  DUNGEON_NODE_TYPES,
  WORLD_NODE_TYPES,
  type NodeType,
} from "../api/maps";
import type { MapNode, MapEdge, MapScale } from "../api/types";

const GRID_SCALE = 150;

// ── Fantasy map export ────────────────────────────────────────────────────────

const PARCH_COLORS: Record<string, { fill: string; stroke: string }> = {
  Region:     { fill: "#ddd0f0", stroke: "#6a3d9a" },
  City:       { fill: "#ffe082", stroke: "#7a5200" },
  Town:       { fill: "#c8e6c9", stroke: "#2e7d32" },
  Village:    { fill: "#dcedc8", stroke: "#558b2f" },
  Landmark:   { fill: "#d7ccc8", stroke: "#5d4037" },
  Port:       { fill: "#b3e5fc", stroke: "#01579b" },
  Fortress:   { fill: "#ffcdd2", stroke: "#b71c1c" },
  Room:       { fill: "#f0e8d0", stroke: "#8b6c0a" },
  Corridor:   { fill: "#ede0c8", stroke: "#795548" },
  Outdoor:    { fill: "#dcedc8", stroke: "#558b2f" },
  Settlement: { fill: "#ffe082", stroke: "#e65100" },
  Dungeon:    { fill: "#d1c4e9", stroke: "#512da8" },
  Lair:       { fill: "#ffcdd2", stroke: "#c62828" },
};

function exportFantasyMap(nodes: Node[], edges: Edge[], mapName: string) {
  if (nodes.length === 0) return;

  const NW = 150;
  const NH = 46;
  const PAD = 90;
  const TITLE_H = 70;

  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD - TITLE_H;
  const W = Math.max(...xs) + NW + PAD - minX;
  const H = Math.max(...ys) + NH + PAD - minY;

  const pos = new Map(
    nodes.map((n) => [
      n.id,
      {
        x: n.position.x - minX,
        y: n.position.y - minY,
        cx: n.position.x - minX + NW / 2,
        cy: n.position.y - minY + NH / 2,
      },
    ]),
  );

  const edgeSvg = edges
    .map((e) => {
      const s = pos.get(e.source);
      const d = pos.get(e.target);
      if (!s || !d) return "";
      const mx = (s.cx + d.cx) / 2;
      const my = (s.cy + d.cy) / 2;
      const label = typeof e.label === "string" ? e.label : "";
      // Slightly curved path for organic feel
      const dx = d.cx - s.cx;
      const dy = d.cy - s.cy;
      const cx1 = s.cx + dx * 0.25 + dy * 0.1;
      const cy1 = s.cy + dy * 0.25 - dx * 0.1;
      const cx2 = s.cx + dx * 0.75 - dy * 0.1;
      const cy2 = s.cy + dy * 0.75 + dx * 0.1;
      return `
        <path d="M${s.cx},${s.cy} C${cx1},${cy1} ${cx2},${cy2} ${d.cx},${d.cy}"
              fill="none" stroke="#5d3a1a" stroke-width="1.8" stroke-opacity="0.65"
              filter="url(#wobble)"/>
        ${label ? `<text x="${mx}" y="${my - 5}" text-anchor="middle"
                    font-family="EB Garamond,Georgia,serif" font-size="12"
                    fill="#5d3a1a" font-style="italic" opacity="0.85"
                    filter="url(#wobble)">${label}</text>` : ""}`;
    })
    .join("");

  const nodeSvg = nodes
    .map((n) => {
      const p = pos.get(n.id);
      if (!p) return "";
      const label = String(n.data.label ?? "");
      const type = String(n.data.node_type ?? "Room");
      const c = PARCH_COLORS[type] ?? PARCH_COLORS["Room"];
      const display = label.length > 17 ? label.slice(0, 16) + "…" : label;
      return `
        <rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}"
              rx="7" ry="7" fill="${c.fill}" stroke="${c.stroke}"
              stroke-width="2" filter="url(#wobble)"/>
        <text x="${p.cx}" y="${p.y + 26}" text-anchor="middle"
              font-family="Cinzel Decorative,serif" font-size="10.5"
              fill="#2c1a00" font-weight="700">${display}</text>
        <text x="${p.cx}" y="${p.y + NH - 7}" text-anchor="middle"
              font-family="EB Garamond,Georgia,serif" font-size="9"
              fill="${c.stroke}" font-style="italic">${type}</text>`;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Hand-drawn wobble on shapes -->
    <filter id="wobble" x="-4%" y="-4%" width="108%" height="108%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.8"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <!-- Paper grain overlay -->
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4"
                    stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
      <feBlend in="SourceGraphic" in2="grey" mode="multiply"/>
    </filter>
    <!-- Parchment radial gradient -->
    <radialGradient id="parch" cx="50%" cy="45%" r="65%">
      <stop offset="0%"   stop-color="#f8edd8"/>
      <stop offset="55%"  stop-color="#f0ddb0"/>
      <stop offset="100%" stop-color="#c8a878"/>
    </radialGradient>
    <!-- Vignette -->
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
      <stop offset="0%"   stop-color="#7a4a1a" stop-opacity="0"/>
      <stop offset="100%" stop-color="#7a4a1a" stop-opacity="0.35"/>
    </radialGradient>
  </defs>

  <!-- Parchment base -->
  <rect width="${W}" height="${H}" fill="url(#parch)"/>
  <!-- Paper grain -->
  <rect width="${W}" height="${H}" fill="#c8a060" opacity="0.08" filter="url(#grain)"/>
  <!-- Vignette -->
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>

  <!-- Outer border -->
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}"
        fill="none" stroke="#7a4a1a" stroke-width="3.5" rx="5"/>
  <!-- Inner decorative border -->
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}"
        fill="none" stroke="#7a4a1a" stroke-width="1"
        stroke-dasharray="8,5" rx="3" opacity="0.7"/>
  <!-- Corner ornaments -->
  <text x="18" y="34" font-family="serif" font-size="16" fill="#7a4a1a" opacity="0.8">✦</text>
  <text x="${W - 32}" y="34" font-family="serif" font-size="16" fill="#7a4a1a" opacity="0.8">✦</text>
  <text x="18" y="${H - 16}" font-family="serif" font-size="16" fill="#7a4a1a" opacity="0.8">✦</text>
  <text x="${W - 32}" y="${H - 16}" font-family="serif" font-size="16" fill="#7a4a1a" opacity="0.8">✦</text>

  <!-- Title -->
  <text x="${W / 2}" y="${TITLE_H - 18}" text-anchor="middle"
        font-family="Cinzel Decorative,serif" font-size="24"
        fill="#4a2800" letter-spacing="4" filter="url(#wobble)">${mapName}</text>
  <line x1="${W / 2 - 140}" y1="${TITLE_H - 8}"
        x2="${W / 2 + 140}" y2="${TITLE_H - 8}"
        stroke="#7a4a1a" stroke-width="1.2" opacity="0.6"/>

  <!-- Edges (under nodes) -->
  ${edgeSvg}

  <!-- Nodes -->
  ${nodeSvg}

  <!-- Final grain pass -->
  <rect width="${W}" height="${H}" fill="#8b5e3c" opacity="0.03" filter="url(#grain)"/>
</svg>`;

  // Render SVG → canvas → PNG download
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${mapName.replace(/\s+/g, "-").toLowerCase()}-map.png`;
    a.click();
  };
  img.src = url;
}

function toFlowNode(n: MapNode): Node {
  const colors = NODE_COLORS[n.node_type as NodeType] ?? NODE_COLORS["Room"];
  return {
    id: n.id,
    position: { x: n.x * GRID_SCALE, y: n.y * GRID_SCALE },
    data: { label: n.label, description: n.description, node_type: n.node_type },
    type: "default",
    style: {
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      color: "var(--text)",
      borderRadius: 6,
      fontSize: "0.78rem",
      fontFamily: "EB Garamond, Georgia, serif",
      minWidth: 80,
      textAlign: "center" as const,
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
    labelStyle: { fill: "var(--muted)", fontSize: "0.7rem" },
  };
}

interface NodeDetailProps {
  node: Node;
  onClose: () => void;
  onDescriptionSave: (nodeId: string, description: string) => void;
  saving: boolean;
}

function NodeDetail({ node, onClose, onDescriptionSave, saving }: NodeDetailProps) {
  const [desc, setDesc] = useState<string>((node.data.description as string) ?? "");
  const colors = NODE_COLORS[(node.data.node_type as NodeType)] ?? NODE_COLORS["Room"];

  useEffect(() => {
    setDesc((node.data.description as string) ?? "");
  }, [node.id, node.data.description]);

  return (
    <div
      style={{
        width: 280,
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "1rem",
        gap: "0.75rem",
        overflowY: "auto",
      }}
    >
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ fontSize: "1rem", marginBottom: "0.2rem" }}>{node.data.label as string}</h3>
          <span
            className="badge"
            style={{
              background: colors.bg,
              color: colors.border,
              border: `1px solid ${colors.border}`,
              fontSize: "0.65rem",
            }}
          >
            {node.data.node_type as string}
          </span>
        </div>
        <button className="btn btn-ghost" onClick={onClose} style={{ padding: "0.2rem 0.5rem" }}>
          ✕
        </button>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Description / Lore</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={6}
          style={{ resize: "vertical", fontSize: "0.9rem" }}
          placeholder="Add lore, notes, or details…"
        />
      </div>

      <button
        className="btn btn-secondary"
        onClick={() => onDescriptionSave(node.id, desc)}
        disabled={saving}
        style={{ width: "100%" }}
      >
        {saving ? "Saving…" : "Save Notes"}
      </button>
    </div>
  );
}

export default function MapBuilder() {
  const { adventureId } = useParams<{ adventureId: string }>();
  const qc = useQueryClient();

  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [selectedMapScale, setSelectedMapScale] = useState<MapScale>("Dungeon");
  const [newMapName, setNewMapName] = useState("");
  const [newMapScale, setNewMapScale] = useState<MapScale>("Dungeon");
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [newNodeType, setNewNodeType] = useState<NodeType>("Room");
  const [worldPrompt, setWorldPrompt] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [addNodeError, setAddNodeError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [savingDesc, setSavingDesc] = useState(false);

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

  useEffect(() => { setNodes(mapNodes.map(toFlowNode)); }, [mapNodes]);
  useEffect(() => { setEdges(mapEdges.map(toFlowEdge)); }, [mapEdges]);

  // Keep newNodeType in sync when scale changes
  useEffect(() => {
    if (selectedMapScale === "World" && DUNGEON_NODE_TYPES.includes(newNodeType)) {
      setNewNodeType("Region");
    } else if (selectedMapScale === "Dungeon" && WORLD_NODE_TYPES.includes(newNodeType)) {
      setNewNodeType("Room");
    }
  }, [selectedMapScale]);

  const createMap = useMutation({
    mutationFn: () => mapsApi.create(adventureId!, newMapName || "New Map", newMapScale),
    onSuccess: (m) => {
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ["maps", adventureId] });
      setSelectedMapId(m.id);
      setSelectedMapScale(m.scale);
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
      setSelectedNode(null);
    },
  });

  const addNodeMut = useMutation({
    mutationFn: () =>
      mapsApi.addNode(selectedMapId!, {
        label: newNodeLabel || (selectedMapScale === "World" ? "Location" : "Room"),
        node_type: newNodeType,
        x: Math.round(Math.random() * 8 + 1),
        y: Math.round(Math.random() * 6 + 1),
        description: null,
      }),
    onSuccess: (n) => {
      setAddNodeError(null);
      setNodes((prev) => [...prev, toFlowNode(n)]);
      qc.invalidateQueries({ queryKey: ["map-nodes", selectedMapId] });
      setNewNodeLabel("");
    },
    onError: (err: Error) => setAddNodeError(err.message),
  });

  const generateWorldMut = useMutation({
    mutationFn: () => mapsApi.generateWorld(selectedMapId!, worldPrompt),
    onSuccess: (result) => {
      setGenerateError(null);
      setNodes(result.nodes.map(toFlowNode));
      setEdges(result.edges.map(toFlowEdge));
      qc.invalidateQueries({ queryKey: ["map-nodes", selectedMapId] });
      qc.invalidateQueries({ queryKey: ["map-edges", selectedMapId] });
    },
    onError: (err: Error) => setGenerateError(err.message),
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

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    setSelectedNode(node);
  }, []);

  function selectMap(m: { id: string; scale: MapScale }) {
    setSelectedMapId(m.id);
    setSelectedMapScale(m.scale);
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
  }

  async function handleDescriptionSave(nodeId: string, description: string) {
    setSavingDesc(true);
    try {
      const updated = await mapsApi.updateNode(selectedMapId!, nodeId, { description });
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, description: updated.description } }
            : n,
        ),
      );
      setSelectedNode((prev) =>
        prev?.id === nodeId
          ? { ...prev, data: { ...prev.data, description: updated.description } }
          : prev,
      );
    } finally {
      setSavingDesc(false);
    }
  }

  const nodeTypes = selectedMapScale === "World" ? WORLD_NODE_TYPES : DUNGEON_NODE_TYPES;
  const isGenerating = generateWorldMut.isPending;
  const isEmpty = nodes.length === 0 && mapNodes.length === 0;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <h1 style={{ marginBottom: "1rem" }}>Map Builder</h1>

      {/* ── Map selector ─────────────────────────────────────────────────── */}
      <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        {maps.map((m) => (
          <div key={m.id} className="flex gap-1" style={{ alignItems: "center" }}>
            <button
              className={`btn ${selectedMapId === m.id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => selectMap(m)}
            >
              {m.scale === "World" ? "🌍 " : "🗺 "}
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

        {/* Create map controls */}
        <div className="flex gap-2" style={{ alignItems: "center" }}>
          <input
            placeholder="Map name"
            value={newMapName}
            onChange={(e) => setNewMapName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createMap.mutate()}
            style={{ width: 140 }}
          />
          <select
            value={newMapScale}
            onChange={(e) => setNewMapScale(e.target.value as MapScale)}
            style={{ width: 110 }}
            title="Map scale"
          >
            <option value="Dungeon">🗺 Dungeon</option>
            <option value="World">🌍 World</option>
          </select>
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
        <p className="text-sm" style={{ color: "var(--crimson2)", marginBottom: "0.75rem" }}>
          Error: {createError}
        </p>
      )}

      {selectedMapId && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "0.75rem" }}>
          {(nodesError || edgesError) && (
            <p className="text-sm" style={{ color: "var(--crimson2)" }}>
              Failed to load map data — check that the backend is running.
            </p>
          )}

          {/* ── AI Generate panel (World maps only) ───────────────────── */}
          {selectedMapScale === "World" && (isEmpty || nodes.length > 0) && (
            <div
              className="card"
              style={{
                background: "linear-gradient(135deg, #0f0a1e 0%, #0a0a14 100%)",
                border: "1px solid #9575cd",
              }}
            >
              <div className="flex gap-2" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ color: "#9575cd" }}>✨ Generate World Map with AI</label>
                  <textarea
                    value={worldPrompt}
                    onChange={(e) => setWorldPrompt(e.target.value)}
                    rows={2}
                    placeholder="A dark fantasy continent ruled by rival undead empires, with elven forest enclaves and dwarven mountain fortresses…"
                    style={{ fontSize: "0.9rem", resize: "vertical" }}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => generateWorldMut.mutate()}
                  disabled={isGenerating || !worldPrompt.trim()}
                  style={{
                    background: "#4a1a8a",
                    borderColor: "#9575cd",
                    marginBottom: "0.1rem",
                  }}
                >
                  {isGenerating ? "Generating…" : "Generate World"}
                </button>
              </div>
              {isGenerating && (
                <p className="text-sm" style={{ color: "#9575cd", marginTop: "0.5rem" }}>
                  Claude is building your world — this takes ~15 seconds…
                </p>
              )}
              {generateError && (
                <p className="text-sm" style={{ color: "var(--crimson2)", marginTop: "0.5rem" }}>
                  Error: {generateError}
                </p>
              )}
            </div>
          )}

          {/* ── Manual node controls ───────────────────────────────────── */}
          <div className="flex gap-2" style={{ flexWrap: "wrap", alignItems: "center" }}>
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
              style={{ width: 130 }}
            >
              {nodeTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              className="btn btn-secondary"
              onClick={() => addNodeMut.mutate()}
              disabled={addNodeMut.isPending}
            >
              {addNodeMut.isPending ? "Adding…" : "+ Add Location"}
            </button>
            {nodes.length > 0 && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const map = maps.find((m) => m.id === selectedMapId);
                  exportFantasyMap(nodes, edges, map?.name ?? "map");
                }}
                title="Export as fantasy parchment PNG"
                style={{ marginLeft: "auto" }}
              >
                🗺 Export Map
              </button>
            )}
          </div>

          {addNodeError && (
            <p className="text-sm" style={{ color: "var(--crimson2)" }}>
              Error: {addNodeError}
            </p>
          )}

          {/* ── Canvas + sidebar ──────────────────────────────────────── */}
          <div style={{ display: "flex", flex: 1, gap: 0, minHeight: 520 }}>
            <div
              style={{
                flex: 1,
                border: "1px solid var(--border)",
                borderRadius: selectedNode ? "8px 0 0 8px" : 8,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {isEmpty ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "var(--muted)",
                    background: "var(--surface)",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {selectedMapScale === "World"
                    ? "Describe your world above and click Generate, or add locations manually."
                    : "Add a location above to get started."}
                </div>
              ) : nodes.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "var(--muted)",
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
                  onNodeClick={onNodeClick}
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

            {selectedNode && (
              <NodeDetail
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
                onDescriptionSave={handleDescriptionSave}
                saving={savingDesc}
              />
            )}
          </div>

          <p className="text-sm text-muted">
            Drag to pan · Scroll to zoom · Drag from a node handle to connect · Click a node to view details
          </p>
        </div>
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
