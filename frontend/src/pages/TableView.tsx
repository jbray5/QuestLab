import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { apiBase } from "../api/client";
import { tableApi } from "../api/table";
import MapCanvas from "../components/table/MapCanvas";
import JoinQr from "../components/table/JoinQr";
import TurnSplash, { type SplashSubject } from "../components/table/TurnSplash";
import MapReveal from "../components/table/MapReveal";
import { useMapReveal } from "../hooks/useMapReveal";

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
  // Combat cinema (Plan 61): floating numbers + the turn splash.
  type FxEntry = { id: string; refId: string; kind: "damage" | "heal" | "ko"; amount: number | null };
  const [fx, setFx] = useState<FxEntry[]>([]);
  const fxCounter = useRef(0);
  const [splash, setSplash] = useState<SplashSubject | null>(null);
  const splashCounter = useRef(0);
  const lastActive = useRef<string | null>(null);

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
    const base = apiBase();
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
    const onFx = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { kind?: string; ref_id?: string; amount?: number };
        if (!d.kind || !d.ref_id || d.kind === "ko") return;
        fxCounter.current += 1;
        const id = `fx-${fxCounter.current}`;
        const entry = {
          id,
          refId: d.ref_id,
          kind: d.kind as "damage" | "heal",
          amount: typeof d.amount === "number" ? d.amount : null,
        };
        setFx((cur) => [...cur, entry]);
        window.setTimeout(() => setFx((cur) => cur.filter((q) => q.id !== id)), 1500);
      } catch {
        /* ignore malformed */
      }
    };
    es.addEventListener("table.updated", onUpdate as EventListener);
    es.addEventListener("table.fx", onFx as EventListener);
    es.addEventListener("table.ping", onPing as EventListener);
    es.addEventListener("message", onUpdate as EventListener);
    return () => es.close();
  }, [sessionId]);

  // A PC's turn opens with a splash (Plan 61).
  useEffect(() => {
    const ref = data?.active_token_ref ?? null;
    if (ref === lastActive.current) return;
    lastActive.current = ref;
    if (!ref) return;
    const token = data?.tokens.find((t) => (t.ref_id ?? t.id) === ref);
    if (!token || token.kind !== "pc") return;
    splashCounter.current += 1;
    setSplash({
      key: `${ref}-${splashCounter.current}`,
      name: token.label || "Your turn",
      imageUrl: token.image_url ?? null,
    });
  }, [data]);

  const mapId = data?.map?.id ?? "none";
  const title = data?.title ?? "";

  // Plan 64 — staging a new map mid-session plays the scene card.
  const reveal = useMapReveal(
    data ? (data.map?.id ?? null) : undefined,
    data?.map?.image_url,
    data?.title,
  );

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
            fx={fx}
          />
        </div>
      )}

      <TurnSplash subject={splash} />
      <MapReveal subject={reveal} />
      {data?.campaign_id && <JoinQr campaignId={data.campaign_id} />}

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
