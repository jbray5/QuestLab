import { useCallback, useEffect, useMemo, useState } from "react";
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
  NodeResizer,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeMouseHandler,
  type NodeProps,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  mapsApi,
  NODE_COLORS,
  DUNGEON_NODE_TYPES,
  WORLD_NODE_TYPES,
  DOOR_EDGE_STYLES,
  DOOR_ICONS,
  DOOR_TYPE_OPTIONS,
  type NodeType,
  type DoorType,
} from "../api/maps";
import { encountersApi } from "../api/encounters";
import type { MapNode, MapEdge, MapScale, Encounter } from "../api/types";

const GRID_SCALE = 150;

// ── Room type icons ───────────────────────────────────────────────────────────

const ROOM_ICONS: Record<string, string> = {
  Room:           "⬜",
  Corridor:       "—",
  Entrance:       "🚪",
  Exit:           "🔓",
  "Boss Chamber": "💀",
  "Treasure Room":"💰",
  "Trap Room":    "⚙",
  "Secret Room":  "👁",
  "Stairs Up":    "⬆",
  "Stairs Down":  "⬇",
};

// ── Custom dungeon room node ──────────────────────────────────────────────────

function DungeonRoomNode({ data, selected }: NodeProps) {
  const nodeType = String(data.node_type ?? "Room") as NodeType;
  const colors = NODE_COLORS[nodeType] ?? NODE_COLORS["Room"];
  const icon = ROOM_ICONS[nodeType] ?? "⬜";
  const hasEncounter = !!data.encounter_name;
  const hasLoot = !!(data.loot_notes as string | null);
  const hasTrap = !!(data.trap_notes as string | null);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: selected
          ? `0 0 12px ${colors.border}88, inset 0 0 20px rgba(0,0,0,0.5)`
          : "inset 0 0 20px rgba(0,0,0,0.5)",
      }}
    >
      <NodeResizer
        minWidth={80}
        minHeight={50}
        isVisible={selected}
        color={colors.border}
        lineStyle={{ borderColor: colors.border }}
        handleStyle={{ background: colors.border, border: "none" }}
      />

      {/* Header bar */}
      <div
        style={{
          background: `${colors.border}22`,
          borderBottom: `1px solid ${colors.border}44`,
          padding: "3px 6px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "0.7rem" }}>{icon}</span>
        <span
          style={{
            fontSize: "0.6rem",
            color: colors.border,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            opacity: 0.8,
          }}
        >
          {nodeType}
        </span>
      </div>

      {/* Room label */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px 6px",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: "0.78rem",
            fontFamily: "EB Garamond, Georgia, serif",
            color: "var(--text)",
            fontWeight: 600,
            lineHeight: 1.2,
            wordBreak: "break-word",
          }}
        >
          {String(data.label ?? "")}
        </span>
      </div>

      {/* Indicator badges */}
      {(hasEncounter || hasLoot || hasTrap) && (
        <div
          style={{
            display: "flex",
            gap: 3,
            padding: "2px 6px 4px",
            flexShrink: 0,
          }}
        >
          {hasEncounter && (
            <span
              title={`Encounter: ${data.encounter_name}`}
              style={{ fontSize: "0.6rem", color: "#ef5350", cursor: "default" }}
            >
              ⚔
            </span>
          )}
          {hasLoot && (
            <span title="Has loot notes" style={{ fontSize: "0.6rem", color: "#ffd700", cursor: "default" }}>
              💰
            </span>
          )}
          {hasTrap && (
            <span title="Has trap notes" style={{ fontSize: "0.6rem", color: "#ff8c00", cursor: "default" }}>
              ⚙
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fantasy map export (world-scale) ─────────────────────────────────────────

function makePRNG(seed: number) {
  let s = (seed | 0) >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function symCity(cx: number, cy: number) {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? 17 : 9;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");
  return `<polygon points="${pts}" fill="#f0d060" stroke="#8b6010" stroke-width="1.5" filter="url(#wobble)"/>
          <circle cx="${cx}" cy="${cy}" r="4.5" fill="#8b6010"/>
          <circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="#8b6010" stroke-width="0.7" opacity="0.4"/>`;
}

function symTown(cx: number, cy: number) {
  const x = cx - 14;
  const y = cy - 12;
  return `<rect x="${x}" y="${y + 4}" width="11" height="14" fill="#d4c890" stroke="#8b6030" stroke-width="0.9"/>
          <polygon points="${x},${y + 4} ${x + 5.5},${y - 3} ${x + 11},${y + 4}" fill="#9b4040" stroke="#8b6030" stroke-width="0.8"/>
          <rect x="${cx + 3}" y="${y + 1}" width="13" height="17" fill="#c8b880" stroke="#8b6030" stroke-width="0.9"/>
          <polygon points="${cx + 2},${y + 1} ${cx + 9.5},${y - 7} ${cx + 17},${y + 1}" fill="#9b4040" stroke="#8b6030" stroke-width="0.8"/>`;
}

function symVillage(cx: number, cy: number) {
  const x = cx - 9;
  const y = cy - 10;
  return `<rect x="${x}" y="${y + 5}" width="18" height="13" fill="#d4c890" stroke="#8b6030" stroke-width="0.8"/>
          <polygon points="${x - 1},${y + 5} ${cx},${y - 3} ${x + 19},${y + 5}" fill="#9b4040" stroke="#8b6030" stroke-width="0.8"/>
          <rect x="${cx - 3}" y="${y + 8}" width="6" height="9" fill="#a08840" stroke="#8b6030" stroke-width="0.5"/>`;
}

function symPort(cx: number, cy: number) {
  return `<line x1="${cx}" y1="${cy - 15}" x2="${cx}" y2="${cy + 15}" stroke="#2a4a80" stroke-width="2.2"/>
          <line x1="${cx - 13}" y1="${cy - 8}" x2="${cx + 13}" y2="${cy - 8}" stroke="#2a4a80" stroke-width="2"/>
          <circle cx="${cx}" cy="${cy - 15}" r="4" fill="none" stroke="#2a4a80" stroke-width="1.8"/>
          <path d="M${cx - 13},${cy + 8} Q${cx - 17},${cy + 16} ${cx - 9},${cy + 13}" fill="none" stroke="#2a4a80" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M${cx + 13},${cy + 8} Q${cx + 17},${cy + 16} ${cx + 9},${cy + 13}" fill="none" stroke="#2a4a80" stroke-width="1.5" stroke-linecap="round"/>`;
}

function symFortress(cx: number, cy: number) {
  const x = cx - 17;
  const y = cy - 14;
  return `<rect x="${x + 5}" y="${y + 8}" width="24" height="16" fill="#b8a878" stroke="#6a5030" stroke-width="0.9"/>
          <rect x="${x}" y="${y + 2}" width="11" height="22" fill="#a89868" stroke="#6a5030" stroke-width="0.9"/>
          <rect x="${x + 23}" y="${y + 2}" width="11" height="22" fill="#a89868" stroke="#6a5030" stroke-width="0.9"/>
          <rect x="${x}" y="${y - 3}" width="4" height="7" fill="#a89868" stroke="#6a5030" stroke-width="0.7"/>
          <rect x="${x + 7}" y="${y - 3}" width="4" height="7" fill="#a89868" stroke="#6a5030" stroke-width="0.7"/>
          <rect x="${x + 23}" y="${y - 3}" width="4" height="7" fill="#a89868" stroke="#6a5030" stroke-width="0.7"/>
          <rect x="${x + 30}" y="${y - 3}" width="4" height="7" fill="#a89868" stroke="#6a5030" stroke-width="0.7"/>
          <rect x="${cx - 6}" y="${y + 11}" width="12" height="13" fill="#5a4020" stroke="#6a5030" stroke-width="0.8"/>
          <path d="M${cx - 6},${y + 11} Q${cx},${y + 6} ${cx + 6},${y + 11}" fill="#5a4020" stroke="#6a5030" stroke-width="0.7"/>`;
}

function symLandmark(cx: number, cy: number) {
  return `<polygon points="${cx},${cy - 20} ${cx + 5},${cy - 3} ${cx + 4},${cy + 16} ${cx - 4},${cy + 16} ${cx - 5},${cy - 3}"
           fill="#c8b888" stroke="#7a6040" stroke-width="1" filter="url(#wobble)"/>
          <line x1="${cx - 4}" y1="${cy + 2}" x2="${cx + 4}" y2="${cy + 2}" stroke="#7a6040" stroke-width="0.6" opacity="0.7"/>
          <line x1="${cx - 4}" y1="${cy + 9}" x2="${cx + 4}" y2="${cy + 9}" stroke="#7a6040" stroke-width="0.6" opacity="0.7"/>`;
}

function symRegion(cx: number, cy: number) {
  return `<circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="#9a7050" stroke-width="1.8" stroke-dasharray="3,2.5"/>
          <circle cx="${cx}" cy="${cy}" r="3" fill="#9a7050"/>`;
}

function getNodeSymbol(type: string, cx: number, cy: number): string {
  switch (type) {
    case "City":       return symCity(cx, cy);
    case "Town":       return symTown(cx, cy);
    case "Village":    return symVillage(cx, cy);
    case "Port":       return symPort(cx, cy);
    case "Fortress":   return symFortress(cx, cy);
    case "Landmark":   return symLandmark(cx, cy);
    case "Region":     return symRegion(cx, cy);
    case "Room":
      return `<rect x="${cx - 11}" y="${cy - 9}" width="22" height="18" fill="#d4c8a8" stroke="#7a6040" stroke-width="1.2" rx="3"/>`;
    case "Corridor":
      return `<rect x="${cx - 16}" y="${cy - 6}" width="32" height="12" fill="#c4b898" stroke="#7a6040" stroke-width="1" rx="2"/>`;
    default:
      return symRegion(cx, cy);
  }
}

function terrMountain(bx: number, by: number, rng: () => number): string {
  const dx = (rng() - 0.5) * 60;
  const dy = (rng() - 0.5) * 40;
  const s = 0.75 + rng() * 0.55;
  const cx = bx + dx;
  const cy = by + dy;
  return `<g transform="translate(${cx},${cy}) scale(${s})" opacity="0.82">
    <polygon points="-18,0 -10,-22 -2,0"  fill="#c2b292" stroke="#8a7050" stroke-width="0.7"/>
    <polygon points="-7,0 4,-28 15,0"     fill="#d2c2a2" stroke="#8a7050" stroke-width="0.7"/>
    <polygon points="7,0 15,-20 23,0"     fill="#c2b292" stroke="#8a7050" stroke-width="0.7"/>
    <polygon points="-12,-14 -10,-22 -8,-14" fill="#eae4d8"/>
    <polygon points="2,-20 4,-28 6,-20"   fill="#eae4d8"/>
    <polygon points="13,-13 15,-20 17,-13" fill="#eae4d8"/>
  </g>`;
}

function terrForest(bx: number, by: number, rng: () => number): string {
  const dx = (rng() - 0.5) * 60;
  const dy = (rng() - 0.5) * 40;
  const s = 0.65 + rng() * 0.55;
  const cx = bx + dx;
  const cy = by + dy;
  return `<g transform="translate(${cx},${cy}) scale(${s})" opacity="0.78">
    <polygon points="-13,0 -7,-19 -1,0"  fill="#4a7840" stroke="#2a5020" stroke-width="0.5"/>
    <rect x="-11" y="0" width="7" height="6" fill="#5a3a18"/>
    <polygon points="-3,0 5,-24 13,0"    fill="#3a6830" stroke="#2a5020" stroke-width="0.5"/>
    <rect x="0" y="0" width="7" height="6" fill="#5a3a18"/>
    <polygon points="10,0 17,-17 24,0"   fill="#4a7840" stroke="#2a5020" stroke-width="0.5"/>
    <rect x="12" y="0" width="7" height="6" fill="#5a3a18"/>
  </g>`;
}

function terrWave(bx: number, by: number, rng: () => number): string {
  const dx = (rng() - 0.5) * 80;
  const dy = (rng() - 0.5) * 60;
  const cx = bx + dx;
  const cy = by + dy;
  return `<g opacity="0.38">
    <path d="M${cx - 22},${cy} Q${cx - 15},${cy - 6} ${cx - 8},${cy} Q${cx - 1},${cy + 6} ${cx + 6},${cy}"
          fill="none" stroke="#4080b0" stroke-width="1.4"/>
    <path d="M${cx - 12},${cy + 9} Q${cx - 5},${cy + 3} ${cx + 2},${cy + 9} Q${cx + 9},${cy + 15} ${cx + 16},${cy + 9}"
          fill="none" stroke="#4080b0" stroke-width="1.1"/>
  </g>`;
}

function exportFantasyMap(nodes: Node[], edges: Edge[], mapName: string) {
  if (nodes.length === 0) return;

  const SYM_H = 36;
  const LABEL_GAP = 22;
  const PAD = 120;
  const TITLE_H = 90;

  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD - TITLE_H;
  const W = Math.max(...xs) + PAD - minX + 80;
  const H = Math.max(...ys) + PAD - minY + 80;

  const pos = new Map(
    nodes.map((n) => [n.id, { cx: n.position.x - minX, cy: n.position.y - minY + SYM_H }]),
  );

  const waterTints = nodes
    .filter((n) => String(n.data.node_type ?? "") === "Port")
    .map((n) => {
      const p = pos.get(n.id)!;
      return `<ellipse cx="${p.cx}" cy="${p.cy + 25}" rx="110" ry="80" fill="#a8c8e0" opacity="0.38"/>`;
    })
    .join("");

  const forestTints = nodes
    .filter((n) => ["Village", "Region"].includes(String(n.data.node_type ?? "")))
    .map((n) => {
      const p = pos.get(n.id)!;
      return `<ellipse cx="${p.cx}" cy="${p.cy}" rx="90" ry="66" fill="#6aaa58" opacity="0.13"/>`;
    })
    .join("");

  const mountainTints = nodes
    .filter((n) => ["Fortress", "Landmark"].includes(String(n.data.node_type ?? "")))
    .map((n) => {
      const p = pos.get(n.id)!;
      return `<ellipse cx="${p.cx}" cy="${p.cy}" rx="85" ry="60" fill="#988060" opacity="0.13"/>`;
    })
    .join("");

  const terrainSvg = nodes
    .map((n) => {
      const p = pos.get(n.id);
      if (!p) return "";
      const type = String(n.data.node_type ?? "Room");
      const seed = n.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const rng = makePRNG(seed);
      let out = "";
      if (["Fortress", "Landmark"].includes(type)) for (let i = 0; i < 3; i++) out += terrMountain(p.cx, p.cy, rng);
      if (["Village", "Region"].includes(type)) for (let i = 0; i < 3; i++) out += terrForest(p.cx, p.cy, rng);
      if (type === "Port") for (let i = 0; i < 5; i++) out += terrWave(p.cx, p.cy, rng);
      return out;
    })
    .join("");

  const edgeSvg = edges
    .map((e) => {
      const s = pos.get(e.source);
      const d = pos.get(e.target);
      if (!s || !d) return "";
      const dx = d.cx - s.cx;
      const dy = d.cy - s.cy;
      const cx1 = s.cx + dx * 0.3 + dy * 0.12;
      const cy1 = s.cy + dy * 0.3 - dx * 0.12;
      const cx2 = s.cx + dx * 0.7 - dy * 0.12;
      const cy2 = s.cy + dy * 0.7 + dx * 0.12;
      const mx = (s.cx + d.cx) / 2;
      const my = (s.cy + d.cy) / 2 - 7;
      const label = typeof e.label === "string" ? e.label : "";
      return `
        <path d="M${s.cx},${s.cy} C${cx1},${cy1} ${cx2},${cy2} ${d.cx},${d.cy}"
              fill="none" stroke="#7a5830" stroke-width="2.4" stroke-dasharray="9,5" opacity="0.55"/>
        <path d="M${s.cx},${s.cy} C${cx1},${cy1} ${cx2},${cy2} ${d.cx},${d.cy}"
              fill="none" stroke="#d4aa70" stroke-width="0.9" stroke-dasharray="9,5" opacity="0.35"/>
        ${label
          ? `<text x="${mx}" y="${my}" text-anchor="middle"
                 font-family="EB Garamond,Georgia,serif" font-size="11"
                 fill="#5d3a1a" font-style="italic" opacity="0.8"
                 stroke="#f0e8d0" stroke-width="2.5" paint-order="stroke">${label}</text>`
          : ""}`;
    })
    .join("");

  const nodeSvg = nodes
    .map((n) => {
      const p = pos.get(n.id);
      if (!p) return "";
      const label = String(n.data.label ?? "");
      const type = String(n.data.node_type ?? "Room");
      const symbol = getNodeSymbol(type, p.cx, p.cy);
      const display = label.length > 20 ? label.slice(0, 19) + "…" : label;
      const isMajor = ["City", "Region"].includes(type);
      return `${symbol}
        <text x="${p.cx}" y="${p.cy + LABEL_GAP}" text-anchor="middle"
              font-family="Cinzel Decorative,Cinzel,Georgia,serif"
              font-size="${isMajor ? 14 : 11.5}" font-weight="${isMajor ? "700" : "600"}"
              stroke="#f0e8d0" stroke-width="3.5" paint-order="stroke"
              fill="#2c1800">${display}</text>`;
    })
    .join("");

  const crX = W - 78;
  const crY = H - 80;
  const compassRose = `<g transform="translate(${crX},${crY})">
    <circle cx="0" cy="0" r="34" fill="#f0ddb0" stroke="#8b6020" stroke-width="1" opacity="0.7"/>
    <polygon points="0,-34 4,-13 0,-19 -4,-13" fill="#c8a050" stroke="#8b6020" stroke-width="0.8"/>
    <polygon points="0,34 4,13 0,19 -4,13"  fill="#a08040" stroke="#8b6020" stroke-width="0.8"/>
    <polygon points="-34,0 -13,4 -19,0 -13,-4" fill="#c8a050" stroke="#8b6020" stroke-width="0.8"/>
    <polygon points="34,0 13,4 19,0 13,-4"  fill="#c8a050" stroke="#8b6020" stroke-width="0.8"/>
    <circle cx="0" cy="0" r="6" fill="#c8a050" stroke="#8b6020" stroke-width="1.5"/>
    <circle cx="0" cy="0" r="2.5" fill="#8b6020"/>
    <text x="0" y="-38" text-anchor="middle" font-family="Cinzel,Georgia,serif"
          font-size="12" fill="#5a3a10" font-weight="700">N</text>
  </g>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="wobble" x="-6%" y="-6%" width="112%" height="112%">
      <feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="4" seed="42" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
      <feBlend in="SourceGraphic" in2="grey" mode="multiply"/>
    </filter>
    <radialGradient id="parch" cx="50%" cy="42%" r="72%">
      <stop offset="0%"   stop-color="#f7eccc"/>
      <stop offset="42%"  stop-color="#edd89e"/>
      <stop offset="82%"  stop-color="#d2b66e"/>
      <stop offset="100%" stop-color="#b89248"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
      <stop offset="0%"   stop-color="#6a3a0a" stop-opacity="0"/>
      <stop offset="75%"  stop-color="#6a3a0a" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#4a2000" stop-opacity="0.52"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#parch)"/>
  ${waterTints}${forestTints}${mountainTints}
  <rect width="${W}" height="${H}" fill="#a07030" opacity="0.055" filter="url(#grain)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect x="8"  y="8"  width="${W - 16}" height="${H - 16}" fill="none" stroke="#7a4a1a" stroke-width="4"   rx="5"/>
  <rect x="17" y="17" width="${W - 34}" height="${H - 34}" fill="none" stroke="#7a4a1a" stroke-width="1.3" rx="3"/>
  <text x="14" y="31" font-family="serif" font-size="20" fill="#7a4a1a" opacity="0.9">✦</text>
  <text x="${W - 36}" y="31" font-family="serif" font-size="20" fill="#7a4a1a" opacity="0.9">✦</text>
  <text x="14" y="${H - 10}" font-family="serif" font-size="20" fill="#7a4a1a" opacity="0.9">✦</text>
  <text x="${W - 36}" y="${H - 10}" font-family="serif" font-size="20" fill="#7a4a1a" opacity="0.9">✦</text>
  <text x="${W / 2}" y="${TITLE_H - 30}" text-anchor="middle"
        font-family="Cinzel Decorative,Cinzel,Georgia,serif" font-size="28"
        fill="#3a1800" letter-spacing="5"
        stroke="#f0e0b0" stroke-width="4" paint-order="stroke">${mapName}</text>
  <line x1="${W / 2 - 180}" y1="${TITLE_H - 16}" x2="${W / 2 + 180}" y2="${TITLE_H - 16}"
        stroke="#7a4a1a" stroke-width="1.6" opacity="0.6"/>
  <text x="${W / 2}" y="${TITLE_H - 4}" text-anchor="middle"
        font-family="EB Garamond,Georgia,serif" font-size="12" font-style="italic"
        fill="#8b6030" opacity="0.75" letter-spacing="2">— A Fantasy World Map —</text>
  ${terrainSvg}
  ${edgeSvg}
  ${nodeSvg}
  ${compassRose}
  <rect width="${W}" height="${H}" fill="#8b5e3c" opacity="0.038" filter="url(#grain)"/>
</svg>`;

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

// ── Flow node / edge converters ───────────────────────────────────────────────

function toFlowNode(n: MapNode, scale: MapScale, encounters: Encounter[]): Node {
  const isDungeon = scale === "Dungeon";
  const colors = NODE_COLORS[n.node_type as NodeType] ?? NODE_COLORS["Room"];

  if (isDungeon) {
    const enc = encounters.find((e) => e.id === n.encounter_id);
    return {
      id: n.id,
      position: { x: n.x, y: n.y },
      type: "dungeonRoom",
      data: {
        label: n.label,
        node_type: n.node_type,
        description: n.description,
        encounter_id: n.encounter_id,
        encounter_name: enc?.name ?? null,
        notes: n.notes,
        loot_notes: n.loot_notes,
        trap_notes: n.trap_notes,
      },
      style: { width: n.width || 200, height: n.height || 120 },
    };
  }

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
  const doorType = (e.door_type ?? "open") as DoorType;
  const styleInfo = DOOR_EDGE_STYLES[doorType] ?? DOOR_EDGE_STYLES.open;
  const icon = DOOR_ICONS[doorType];
  const displayLabel = icon
    ? icon + (e.label ? ` ${e.label}` : "")
    : (e.label ?? undefined);

  return {
    id: e.id,
    source: e.from_node_id,
    target: e.to_node_id,
    label: displayLabel,
    style: { stroke: styleInfo.stroke, strokeWidth: 2, strokeDasharray: styleInfo.strokeDasharray },
    labelStyle: { fill: styleInfo.stroke, fontSize: "0.75rem" },
    labelBgStyle: { fill: "#0d0d14", fillOpacity: 0.85 },
  };
}

// ── Node detail panel ─────────────────────────────────────────────────────────

interface NodeDetailProps {
  node: Node;
  isDungeon: boolean;
  encounters: Encounter[];
  onClose: () => void;
  onSave: (nodeId: string, updates: Partial<MapNode>) => void;
  saving: boolean;
}

function NodeDetail({ node, isDungeon, encounters, onClose, onSave, saving }: NodeDetailProps) {
  const [desc, setDesc] = useState<string>((node.data.description as string) ?? "");
  const [notes, setNotes] = useState<string>((node.data.notes as string) ?? "");
  const [lootNotes, setLootNotes] = useState<string>((node.data.loot_notes as string) ?? "");
  const [trapNotes, setTrapNotes] = useState<string>((node.data.trap_notes as string) ?? "");
  const [encounterId, setEncounterId] = useState<string>((node.data.encounter_id as string) ?? "");
  const nodeType = String(node.data.node_type ?? "Room") as NodeType;
  const colors = NODE_COLORS[nodeType] ?? NODE_COLORS["Room"];

  useEffect(() => {
    setDesc((node.data.description as string) ?? "");
    setNotes((node.data.notes as string) ?? "");
    setLootNotes((node.data.loot_notes as string) ?? "");
    setTrapNotes((node.data.trap_notes as string) ?? "");
    setEncounterId((node.data.encounter_id as string) ?? "");
  }, [node.id]);

  function handleSave() {
    const updates: Partial<MapNode> = { description: desc || null };
    if (isDungeon) {
      updates.notes = notes || null;
      updates.loot_notes = lootNotes || null;
      updates.trap_notes = trapNotes || null;
      updates.encounter_id = encounterId || null;
    }
    onSave(node.id, updates);
  }

  return (
    <div
      style={{
        width: 290,
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
            {nodeType}
          </span>
        </div>
        <button className="btn btn-ghost" onClick={onClose} style={{ padding: "0.2rem 0.5rem" }}>
          ✕
        </button>
      </div>

      {isDungeon && (
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Encounter Link</label>
          <select
            value={encounterId}
            onChange={(e) => setEncounterId(e.target.value)}
            style={{ fontSize: "0.85rem" }}
          >
            <option value="">— None —</option>
            {encounters.map((enc) => (
              <option key={enc.id} value={enc.id}>
                {enc.name} ({enc.difficulty})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Description / Read-Aloud</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          style={{ resize: "vertical", fontSize: "0.9rem" }}
          placeholder="What the players see and hear…"
        />
      </div>

      {isDungeon && (
        <>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>DM Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ resize: "vertical", fontSize: "0.9rem" }}
              placeholder="Private DM notes…"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>💰 Loot Notes</label>
            <textarea
              value={lootNotes}
              onChange={(e) => setLootNotes(e.target.value)}
              rows={2}
              style={{ resize: "vertical", fontSize: "0.9rem" }}
              placeholder="Treasure, items, coins…"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>⚙ Trap Notes</label>
            <textarea
              value={trapNotes}
              onChange={(e) => setTrapNotes(e.target.value)}
              rows={2}
              style={{ resize: "vertical", fontSize: "0.9rem" }}
              placeholder="Trap type, DC, damage…"
            />
          </div>
        </>
      )}

      <button
        className="btn btn-secondary"
        onClick={handleSave}
        disabled={saving}
        style={{ width: "100%" }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ── Edge detail panel (dungeon) ───────────────────────────────────────────────

interface EdgeDetailProps {
  edge: Edge;
  mapId: string;
  onClose: () => void;
  onUpdated: (updated: MapEdge) => void;
}

function EdgeDetail({ edge, mapId, onClose, onUpdated }: EdgeDetailProps) {
  const [doorType, setDoorType] = useState<DoorType>(
    (edge.data?.door_type as DoorType) ?? "open",
  );
  const [isSecret, setIsSecret] = useState<boolean>(
    (edge.data?.is_secret as boolean) ?? false,
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await mapsApi.updateEdge(mapId, edge.id, { door_type: doorType, is_secret: isSecret });
      onUpdated(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        width: 220,
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Door / Passage</span>
        <button className="btn btn-ghost" onClick={onClose} style={{ padding: "0.2rem 0.5rem" }}>
          ✕
        </button>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Type</label>
        <select value={doorType} onChange={(e) => setDoorType(e.target.value as DoorType)}>
          {DOOR_TYPE_OPTIONS.map((dt) => (
            <option key={dt} value={dt}>
              {DOOR_ICONS[dt]} {dt.charAt(0).toUpperCase() + dt.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isSecret}
            onChange={(e) => setIsSecret(e.target.checked)}
          />
          Secret passage
        </label>
      </div>

      <button
        className="btn btn-secondary"
        onClick={handleSave}
        disabled={saving}
        style={{ width: "100%" }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const customNodeTypes = { dungeonRoom: DungeonRoomNode };

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
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [savingNode, setSavingNode] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

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

  const { data: encounters = [] } = useQuery({
    queryKey: ["encounters", adventureId],
    queryFn: () => encountersApi.list(adventureId!),
    enabled: !!adventureId,
  });

  // Stable memoised node types for React Flow
  const nodeTypes = useMemo(() => customNodeTypes, []);

  useEffect(() => {
    setNodes(mapNodes.map((n) => toFlowNode(n, selectedMapScale, encounters)));
  }, [mapNodes, selectedMapScale, encounters]);

  useEffect(() => {
    setEdges(mapEdges.map(toFlowEdge));
  }, [mapEdges]);

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
      setSelectedEdge(null);
    },
  });

  const addNodeMut = useMutation({
    mutationFn: () => {
      const isDungeon = selectedMapScale === "Dungeon";
      return mapsApi.addNode(selectedMapId!, {
        label: newNodeLabel || (isDungeon ? "Room" : "Location"),
        node_type: newNodeType,
        x: isDungeon ? Math.round(Math.random() * 600 + 100) : Math.round(Math.random() * 8 + 1),
        y: isDungeon ? Math.round(Math.random() * 400 + 100) : Math.round(Math.random() * 6 + 1),
        width: 200,
        height: 120,
        description: null,
      });
    },
    onSuccess: (n) => {
      setAddNodeError(null);
      setNodes((prev) => [...prev, toFlowNode(n, selectedMapScale, encounters)]);
      qc.invalidateQueries({ queryKey: ["map-nodes", selectedMapId] });
      setNewNodeLabel("");
    },
    onError: (err: Error) => setAddNodeError(err.message),
  });

  const generateWorldMut = useMutation({
    mutationFn: () => mapsApi.generateWorld(selectedMapId!, worldPrompt),
    onSuccess: (result) => {
      setGenerateError(null);
      setNodes(result.nodes.map((n) => toFlowNode(n, selectedMapScale, encounters)));
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
        door_type: "open",
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
    setSelectedEdge(null);
  }, []);

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_evt, edge) => {
      if (selectedMapScale !== "Dungeon") return;
      setSelectedEdge(edge);
      setSelectedNode(null);
    },
    [selectedMapScale],
  );

  // Auto-save position when a node is dragged
  const onNodeDragStop: NodeMouseHandler = useCallback(
    (_evt, node) => {
      if (!selectedMapId) return;
      const x = Math.round(node.position.x);
      const y = Math.round(node.position.y);
      mapsApi.updateNode(selectedMapId, node.id, { x, y });
    },
    [selectedMapId],
  );

  // Save all dungeon room sizes (after resize) and positions
  async function handleSaveLayout() {
    if (!selectedMapId) return;
    setSavingLayout(true);
    try {
      await Promise.all(
        nodes.map((n) =>
          mapsApi.updateNode(selectedMapId, n.id, {
            x: Math.round(n.position.x),
            y: Math.round(n.position.y),
            ...(n.style?.width ? { width: Number(n.style.width) } : {}),
            ...(n.style?.height ? { height: Number(n.style.height) } : {}),
          }),
        ),
      );
      qc.invalidateQueries({ queryKey: ["map-nodes", selectedMapId] });
    } finally {
      setSavingLayout(false);
    }
  }

  function selectMap(m: { id: string; scale: MapScale }) {
    setSelectedMapId(m.id);
    setSelectedMapScale(m.scale);
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setSelectedEdge(null);
  }

  async function handleNodeSave(nodeId: string, updates: Partial<MapNode>) {
    if (!selectedMapId) return;
    setSavingNode(true);
    try {
      const updated = await mapsApi.updateNode(selectedMapId, nodeId, updates);
      const enc = encounters.find((e) => e.id === updated.encounter_id);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  description: updated.description,
                  encounter_id: updated.encounter_id,
                  encounter_name: enc?.name ?? null,
                  notes: updated.notes,
                  loot_notes: updated.loot_notes,
                  trap_notes: updated.trap_notes,
                },
              }
            : n,
        ),
      );
      setSelectedNode((prev) =>
        prev?.id === nodeId
          ? {
              ...prev,
              data: {
                ...prev.data,
                description: updated.description,
                encounter_id: updated.encounter_id,
                encounter_name: enc?.name ?? null,
                notes: updated.notes,
                loot_notes: updated.loot_notes,
                trap_notes: updated.trap_notes,
              },
            }
          : prev,
      );
    } finally {
      setSavingNode(false);
    }
  }

  function handleEdgeUpdated(updated: MapEdge) {
    setEdges((prev) => prev.map((e) => (e.id === updated.id ? toFlowEdge(updated) : e)));
    setSelectedEdge(null);
    qc.invalidateQueries({ queryKey: ["map-edges", selectedMapId] });
  }

  const nodeTypeOptions = selectedMapScale === "World" ? WORLD_NODE_TYPES : DUNGEON_NODE_TYPES;
  const isDungeon = selectedMapScale === "Dungeon";
  const isGenerating = generateWorldMut.isPending;
  const isEmpty = nodes.length === 0 && mapNodes.length === 0;
  const canvasBg = isDungeon ? "#0a0a0e" : "var(--surface)";

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
          {!isDungeon && (isEmpty || nodes.length > 0) && (
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
                    placeholder="A dark fantasy continent ruled by rival undead empires…"
                    style={{ fontSize: "0.9rem", resize: "vertical" }}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => generateWorldMut.mutate()}
                  disabled={isGenerating || !worldPrompt.trim()}
                  style={{ background: "#4a1a8a", borderColor: "#9575cd", marginBottom: "0.1rem" }}
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

          {/* ── Toolbar ────────────────────────────────────────────────── */}
          <div className="flex gap-2" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <input
              placeholder={isDungeon ? "Room name" : "Location name"}
              value={newNodeLabel}
              onChange={(e) => setNewNodeLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNodeMut.mutate()}
              style={{ width: 160 }}
            />
            <select
              value={newNodeType}
              onChange={(e) => setNewNodeType(e.target.value as NodeType)}
              style={{ width: 150 }}
            >
              {nodeTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {isDungeon ? (ROOM_ICONS[t] ?? "") + " " : ""}
                  {t}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary"
              onClick={() => addNodeMut.mutate()}
              disabled={addNodeMut.isPending}
            >
              {addNodeMut.isPending ? "Adding…" : isDungeon ? "+ Add Room" : "+ Add Location"}
            </button>

            {isDungeon && nodes.length > 0 && (
              <button
                className="btn btn-ghost"
                onClick={handleSaveLayout}
                disabled={savingLayout}
                title="Save all room positions and sizes"
                style={{ fontSize: "0.8rem" }}
              >
                {savingLayout ? "Saving…" : "💾 Save Layout"}
              </button>
            )}

            {!isDungeon && nodes.length > 0 && (
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
                borderRadius: selectedNode || selectedEdge ? "8px 0 0 8px" : 8,
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
                    background: canvasBg,
                    flexDirection: "column",
                    gap: "0.5rem",
                    padding: "2rem",
                    textAlign: "center",
                  }}
                >
                  {isDungeon
                    ? "Add rooms above to start building your dungeon. Drag from room handles to connect with doors and passages."
                    : "Describe your world above and click Generate, or add locations manually."}
                </div>
              ) : nodes.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "var(--muted)",
                    background: canvasBg,
                  }}
                >
                  Loading map…
                </div>
              ) : (
                <ReactFlow
                  key={selectedMapId}
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  onEdgeClick={onEdgeClick}
                  onNodeDragStop={onNodeDragStop}
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  style={{ background: canvasBg }}
                >
                  <MiniMap
                    style={{ background: isDungeon ? "#0d0d14" : "var(--surface2)" }}
                    nodeColor={(n) => {
                      const nt = String(n.data?.node_type ?? "Room") as NodeType;
                      return NODE_COLORS[nt]?.border ?? "#c9a84c";
                    }}
                  />
                  <Controls />
                  <Background
                    color={isDungeon ? "#1a1a24" : "var(--border)"}
                    gap={isDungeon ? 40 : 16}
                    size={isDungeon ? 1.5 : 1}
                  />
                </ReactFlow>
              )}
            </div>

            {selectedNode && !selectedEdge && (
              <NodeDetail
                node={selectedNode}
                isDungeon={isDungeon}
                encounters={encounters}
                onClose={() => setSelectedNode(null)}
                onSave={handleNodeSave}
                saving={savingNode}
              />
            )}

            {selectedEdge && isDungeon && !selectedNode && (
              <EdgeDetail
                edge={selectedEdge}
                mapId={selectedMapId}
                onClose={() => setSelectedEdge(null)}
                onUpdated={handleEdgeUpdated}
              />
            )}
          </div>

          <p className="text-sm text-muted">
            {isDungeon
              ? "Drag rooms to reposition · Drag edges from handles to connect · Click a room to edit · Click a connection to set door type · Resize rooms by selecting then dragging corners · 💾 Save Layout to persist sizes"
              : "Drag to pan · Scroll to zoom · Drag from a node handle to connect · Click a node to view details"}
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
