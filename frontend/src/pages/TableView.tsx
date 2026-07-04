import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { tableApi } from "../api/table";
import MapCanvas from "../components/table/MapCanvas";

/**
 * TableView — the full-screen battle-map surface the remote table projects
 * (Plan 42). A capability URL (/table/:sessionId, no auth, no DM chrome). It
 * polls the player-safe projection, subscribes to the table SSE topic for live
 * pushes, crossfades between scenes, and floats a cinematic title card. No HP,
 * initiative, or DM notes ever reach this component.
 */
export default function TableView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [ping, setPing] = useState<{ x: number; y: number; key: number } | null>(null);
  const pingCounter = useRef(0);

  const { data, refetch, isLoading, isError } = useQuery({
    queryKey: ["table-projection", sessionId],
    queryFn: () => tableApi.getProjection(sessionId as string),
    enabled: !!sessionId,
    refetchOnWindowFocus: true,
  });

  // Keep refetch in a ref so the SSE effect never tears down on re-render.
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!sessionId) return;
    const base = import.meta.env.VITE_API_BASE_URL || "/api";
    const es = new EventSource(`${base}/stream/table/${sessionId}`);
    const onUpdate = () => {
      void refetchRef.current();
    };
    const onPing = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { x: number; y: number };
        pingCounter.current += 1;
        setPing({ x: d.x, y: d.y, key: pingCounter.current });
      } catch {
        /* ignore malformed */
      }
    };
    es.addEventListener("table.updated", onUpdate as EventListener);
    es.addEventListener("table.ping", onPing as EventListener);
    es.addEventListener("message", onUpdate as EventListener);
    return () => es.close();
  }, [sessionId]);

  const mapId = data?.map?.id ?? "none";
  const title = data?.title ?? "";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(120% 120% at 50% 40%, #0b0b12 0%, #050509 70%, #020205 100%)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isLoading && <div className="ql-table-msg">Setting the scene…</div>}
      {isError && (
        <div className="ql-table-msg">The DM&rsquo;s link is quiet. Waiting for the table to reconnect…</div>
      )}

      {data && (
        <div key={mapId} className="ql-scene-fade" style={{ width: "100%", height: "100%" }}>
          <MapCanvas
            map={data.map}
            fogOn={data.fog_on}
            revealedRegions={data.revealed_regions}
            brushReveals={data.brush_reveals}
            tokens={data.tokens}
            darkness={data.darkness}
            activeTokenRef={data.active_token_ref}
            defeatedRefs={data.defeated_refs}
            ping={ping}
          />
        </div>
      )}

      {title && (
        <div key={title} className="ql-title-card" aria-live="polite">
          <div className="ql-title-rule" />
          <div className="ql-title-text">{title}</div>
          <div className="ql-title-rule" />
        </div>
      )}
    </div>
  );
}
