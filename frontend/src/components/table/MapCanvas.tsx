import { useRef } from "react";

import type { BrushReveal, TableToken } from "../../api/types";

/**
 * MapCanvas — the shared cinematic battle-map renderer (Plan 42).
 *
 * One SVG whose viewBox is the map's native pixel size, so every coordinate
 * (regions, tokens, brush, pings) is plain image-pixel space and no caller does
 * scaling math. Used both by the full-screen TableView (read-only) and by the
 * DM's TableConsole preview (editable). Layers, bottom → top:
 *   map image → grid → darkness dim + vignette → feathered fog → tokens
 *   (with turn-glow halo + labels) → ping ripple.
 */

export interface MapCanvasMap {
  image_url: string;
  width: number;
  height: number;
  grid_size: number | null;
}

interface Props {
  map: MapCanvasMap | null;
  fogOn: boolean;
  revealedRegions: number[][][];
  brushReveals: BrushReveal[];
  tokens: TableToken[];
  darkness: number;
  activeTokenRef?: string | null;
  defeatedRefs?: string[];
  showGrid?: boolean;
  editable?: boolean;
  selectedTokenId?: string | null;
  ping?: { x: number; y: number; key: number } | null;
  onCanvasPointerDown?: (x: number, y: number, e: React.PointerEvent) => void;
  onTokenMove?: (id: string, x: number, y: number) => void;
  onTokenDragEnd?: (id: string, x: number, y: number) => void;
}

const RING_COLORS: Record<string, string> = {
  pc: "#d6af36",
  monster: "#b0472f",
  custom: "#8a8fa3",
};

function toImageCoords(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export default function MapCanvas({
  map,
  fogOn,
  revealedRegions,
  brushReveals,
  tokens,
  darkness,
  activeTokenRef,
  defeatedRefs = [],
  showGrid = true,
  editable = false,
  selectedTokenId,
  ping,
  onCanvasPointerDown,
  onTokenMove,
  onTokenDragEnd,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragId = useRef<string | null>(null);

  if (!map) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#5a5a66",
          fontStyle: "italic",
          fontFamily: "Cinzel, serif",
          letterSpacing: "0.08em",
        }}
      >
        No map on the table
      </div>
    );
  }

  const W = map.width;
  const H = map.height;
  const grid = map.grid_size ?? 0;
  const tokenUnit = grid > 0 ? grid : Math.round(Math.min(W, H) / 20);
  const pingMax = tokenUnit * 2.6;
  const defeatedSet = new Set(defeatedRefs);

  function handleCanvasDown(e: React.PointerEvent) {
    if (!editable || !onCanvasPointerDown || !svgRef.current) return;
    const { x, y } = toImageCoords(svgRef.current, e.clientX, e.clientY);
    onCanvasPointerDown(x, y, e);
  }
  function handleTokenDown(id: string, e: React.PointerEvent) {
    if (!editable) return;
    e.stopPropagation();
    dragId.current = id;
    svgRef.current?.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!editable || !dragId.current || !onTokenMove || !svgRef.current) return;
    const { x, y } = toImageCoords(svgRef.current, e.clientX, e.clientY);
    onTokenMove(dragId.current, x, y);
  }
  function handlePointerUp(e: React.PointerEvent) {
    if (!dragId.current || !svgRef.current) return;
    const { x, y } = toImageCoords(svgRef.current, e.clientX, e.clientY);
    onTokenDragEnd?.(dragId.current, x, y);
    dragId.current = null;
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={editable ? handlePointerMove : undefined}
      onPointerUp={editable ? handlePointerUp : undefined}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        touchAction: "none",
        cursor: editable ? "crosshair" : "default",
      }}
    >
      <defs>
        <radialGradient id="ql-vignette" cx="50%" cy="50%" r="72%">
          <stop offset="0%" stopColor="#05060a" stopOpacity="0" />
          <stop offset="62%" stopColor="#05060a" stopOpacity="0" />
          <stop offset="100%" stopColor="#03040a" stopOpacity="0.92" />
        </radialGradient>
        <filter id="ql-fog-feather" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={Math.max(6, tokenUnit * 0.25)} />
        </filter>
        <mask id="ql-fog-mask">
          <rect x="0" y="0" width={W} height={H} fill="white" />
          <g filter="url(#ql-fog-feather)">
            {revealedRegions.map((poly, i) => (
              <polygon
                key={`reg-${i}`}
                points={poly.map((p) => `${p[0]},${p[1]}`).join(" ")}
                fill="black"
              />
            ))}
            {brushReveals.map((b, i) => (
              <circle key={`brush-${i}`} cx={b.x} cy={b.y} r={b.r} fill="black" />
            ))}
          </g>
        </mask>
        <style>{`
          @keyframes ql-token-breathe { 0%,100% { opacity: 0.85 } 50% { opacity: 0.28 } }
        `}</style>
      </defs>

      {/* Map image — dims + desaturates as darkness rises; tokens stay bright. */}
      <image
        href={map.image_url}
        x="0"
        y="0"
        width={W}
        height={H}
        preserveAspectRatio="xMidYMid slice"
        style={{
          filter: `brightness(${1 - darkness * 0.45}) saturate(${1 - darkness * 0.35})`,
        }}
      />

      {/* Faint grid */}
      {showGrid && grid > 0 && (
        <g stroke="rgba(255,255,255,0.06)" strokeWidth={Math.max(1, grid * 0.012)}>
          {Array.from({ length: Math.floor(W / grid) }, (_, i) => (
            <line key={`vx-${i}`} x1={(i + 1) * grid} y1={0} x2={(i + 1) * grid} y2={H} />
          ))}
          {Array.from({ length: Math.floor(H / grid) }, (_, i) => (
            <line key={`hz-${i}`} x1={0} y1={(i + 1) * grid} x2={W} y2={(i + 1) * grid} />
          ))}
        </g>
      )}

      {/* Darkness dim + always-on cinematic vignette */}
      {darkness > 0 && (
        <rect x="0" y="0" width={W} height={H} fill="#05060a" opacity={darkness * 0.55} pointerEvents="none" />
      )}
      <rect
        x="0"
        y="0"
        width={W}
        height={H}
        fill="url(#ql-vignette)"
        opacity={Math.min(1, 0.4 + darkness * 0.6)}
        pointerEvents="none"
      />

      {/* Fog of war */}
      {fogOn && (
        <rect
          x="0"
          y="0"
          width={W}
          height={H}
          fill="#06060c"
          fillOpacity="0.94"
          mask="url(#ql-fog-mask)"
          pointerEvents="none"
        />
      )}

      {/* Click catcher for the editable console (below tokens). */}
      {editable && (
        <rect x="0" y="0" width={W} height={H} fill="transparent" onPointerDown={handleCanvasDown} />
      )}

      {/* Tokens */}
      {tokens.map((t) => {
        const r = (tokenUnit * (t.size || 1)) / 2;
        const ref = t.ref_id ?? t.id;
        const isActive = activeTokenRef != null && ref === activeTokenRef;
        const isDefeated = defeatedSet.has(ref);
        const ring = t.color || RING_COLORS[t.kind] || RING_COLORS.custom;
        const selected = editable && selectedTokenId === t.id;
        return (
          <g
            key={t.id}
            style={{ cursor: editable ? "grab" : "default" }}
            opacity={isDefeated ? 0.55 : 1}
            onPointerDown={editable ? (e) => handleTokenDown(t.id, e) : undefined}
          >
            {isActive && (
              <circle cx={t.x} cy={t.y} r={r + 3} fill="none" stroke="#f4d876" strokeWidth={Math.max(2, r * 0.14)}>
                <animate attributeName="r" values={`${r + 1};${r + r * 0.4 + 6};${r + 1}`} dur="1.9s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1.9s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={t.x}
              cy={t.y}
              r={r}
              fill="#14141a"
              stroke={selected ? "#ffffff" : ring}
              strokeWidth={Math.max(2, r * (isActive ? 0.16 : 0.1))}
              style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
            />
            {t.image_url ? (
              <>
                <clipPath id={`ql-clip-${t.id}`}>
                  <circle cx={t.x} cy={t.y} r={r - Math.max(2, r * 0.1)} />
                </clipPath>
                <image
                  href={t.image_url}
                  x={t.x - r}
                  y={t.y - r}
                  width={r * 2}
                  height={r * 2}
                  clipPath={`url(#ql-clip-${t.id})`}
                  preserveAspectRatio="xMidYMid slice"
                  style={isDefeated ? { filter: "grayscale(1)" } : undefined}
                />
              </>
            ) : (
              <text
                x={t.x}
                y={t.y + r * 0.34}
                textAnchor="middle"
                fontSize={r * 0.95}
                fontWeight={700}
                fill={ring}
                fontFamily="Cinzel, serif"
              >
                {(t.label || "?").slice(0, 1).toUpperCase()}
              </text>
            )}
            {isDefeated && (
              <g stroke="#e0483a" strokeWidth={Math.max(2, r * 0.16)} strokeLinecap="round">
                <line x1={t.x - r * 0.55} y1={t.y - r * 0.55} x2={t.x + r * 0.55} y2={t.y + r * 0.55} />
                <line x1={t.x + r * 0.55} y1={t.y - r * 0.55} x2={t.x - r * 0.55} y2={t.y + r * 0.55} />
              </g>
            )}
            {t.label && (
              <>
                <rect
                  x={t.x - (t.label.length * r * 0.16 + r * 0.3)}
                  y={t.y + r + r * 0.12}
                  width={t.label.length * r * 0.32 + r * 0.6}
                  height={r * 0.5}
                  rx={r * 0.25}
                  fill="rgba(6,6,12,0.72)"
                />
                <text
                  x={t.x}
                  y={t.y + r + r * 0.48}
                  textAnchor="middle"
                  fontSize={r * 0.38}
                  fill="#ece7da"
                  fontFamily="Cinzel, serif"
                  letterSpacing="0.02em"
                >
                  {t.label}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Ping ripple — remounts on a new ping.key so the SVG animations restart. */}
      {ping && (
        <g key={ping.key} pointerEvents="none">
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={ping.x} cy={ping.y} r={tokenUnit * 0.35} fill="none" stroke="#f4d876" strokeWidth={Math.max(2, tokenUnit * 0.05)}>
              <animate attributeName="r" from={tokenUnit * 0.35} to={pingMax} dur="1.15s" begin={`${i * 0.18}s`} repeatCount="1" fill="freeze" />
              <animate attributeName="opacity" from="0.95" to="0" dur="1.15s" begin={`${i * 0.18}s`} repeatCount="1" fill="freeze" />
            </circle>
          ))}
        </g>
      )}
    </svg>
  );
}
