import { useRef, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { tableApi } from "../api/table";
import type { SessionCombatant } from "../api/types";
import Board3D, {
  type BoardMapLike,
  type BoardPing,
  type GridKind,
} from "../components/board/Board3D";
import { useEventStream, type StreamEvent } from "../hooks/useEventStream";

/**
 * Table3DView — the players' 3D table (Plan 45), /table/:sessionId/3d.
 *
 * The 3D twin of TableView: an unauthenticated capability URL driven by the
 * player-safe projection + SSE. Read-only — tokens, fog, darkness, backdrop,
 * turn glow and pings arrive live from whatever the DM does on the board or
 * the 2D console. No HP, no initiative, no DM data (the projection never
 * carries them).
 */

const EMPTY_COMBATANTS = new Map<string, SessionCombatant>();
const noop = () => undefined;

function chipStyle(active: boolean): CSSProperties {
  return {
    background: active ? "rgba(214,175,54,0.25)" : "rgba(10,10,18,0.55)",
    border: `1px solid ${active ? "#d6af36" : "rgba(255,255,255,0.18)"}`,
    color: active ? "#f0e6c8" : "#9a9aac",
    borderRadius: 7,
    padding: "2px 9px",
    fontSize: "0.8rem",
    cursor: "pointer",
  };
}

const TITLE_CSS = `
.t3d-title {
  position: absolute;
  top: 16%;
  left: 0;
  right: 0;
  text-align: center;
  font-family: Cinzel, serif;
  font-size: clamp(2rem, 5vw, 3.6rem);
  letter-spacing: 0.14em;
  color: #e8dcc0;
  text-shadow: 0 2px 18px #000, 0 0 42px rgba(214,175,54,0.35);
  animation: t3d-title 5s ease forwards;
  pointer-events: none;
}
@keyframes t3d-title {
  0%   { opacity: 0; transform: translateY(10px); }
  10%  { opacity: 1; transform: translateY(0); }
  82%  { opacity: 1; }
  100% { opacity: 0; }
}
`;

export default function Table3DView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const qc = useQueryClient();
  const projKey = ["table-projection-3d", sessionId];
  const { data: proj } = useQuery({
    queryKey: projKey,
    queryFn: () => tableApi.getProjection(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 20000,
  });

  const [pings, setPings] = useState<BoardPing[]>([]);
  const pingSeq = useRef(0);

  useEventStream("table", sessionId, (event: StreamEvent) => {
    if (event.type === "table.updated") {
      void qc.invalidateQueries({ queryKey: projKey });
    } else if (event.type === "table.ping") {
      const p = event as StreamEvent & { x?: number; y?: number };
      if (typeof p.x !== "number" || typeof p.y !== "number") return;
      pingSeq.current += 1;
      const id = `ping-${pingSeq.current}`;
      const ping: BoardPing = { id, x: p.x, y: p.y };
      setPings((cur) => [...cur, ping]);
      window.setTimeout(() => setPings((cur) => cur.filter((q) => q.id !== id)), 1500);
    }
  });

  const [gridKind, setGridKind] = useState<GridKind | null>(null);
  const [cinema, setCinema] = useState(false);
  const map = proj?.map ?? null;
  const effectiveGrid: GridKind = gridKind ?? (map?.grid_size ? "hex" : "off");

  return (
    <div style={{ position: "fixed", inset: 0, background: "#020208" }}>
      <style>{TITLE_CSS}</style>
      {map && proj ? (
        <Board3D
          map={map as BoardMapLike}
          tokens={proj.tokens}
          combatantByRef={EMPTY_COMBATANTS}
          activeRef={proj.active_token_ref}
          defeatedRefs={proj.defeated_refs}
          gridKind={effectiveGrid}
          selectedId={null}
          attackArmed={false}
          strike={null}
          darkness={proj.darkness}
          weather="none"
          cinema={cinema}
          followTurn
          readOnly
          fogOn={proj.fog_on}
          revealedRegions={proj.revealed_regions}
          brushReveals={proj.brush_reveals}
          fogOpacity={0.94}
          pings={pings}
          onSelect={noop}
          onMoveCommit={noop}
          onPickTarget={noop}
        />
      ) : (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6b6b7a",
            fontFamily: "Cinzel, serif",
            fontSize: "1.15rem",
            letterSpacing: "0.08em",
          }}
        >
          The table is being set…
        </div>
      )}
      {proj?.title && (
        <div key={proj.title} className="t3d-title">
          {proj.title}
        </div>
      )}
      <div style={{ position: "absolute", top: 10, right: 12, display: "flex", gap: 6, opacity: 0.75 }}>
        {(["hex", "square", "off"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setGridKind(k)}
            style={chipStyle(effectiveGrid === k)}
            title={k === "hex" ? "Hex grid" : k === "square" ? "Square grid" : "Grid off"}
          >
            {k === "hex" ? "⬡" : k === "square" ? "▦" : "∅"}
          </button>
        ))}
        <button onClick={() => setCinema((v) => !v)} style={chipStyle(cinema)} title="Cinematic depth of field">
          🎞
        </button>
      </div>
    </div>
  );
}
