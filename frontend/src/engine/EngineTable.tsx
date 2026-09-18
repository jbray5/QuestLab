import { OrbitControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useQuery } from "@tanstack/react-query";
import { Component, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import * as THREE from "three";

import { tableApi } from "../api/table";
import { useEventStream } from "../hooks/useEventStream";
import { preloadProps } from "./assets";
import { Director } from "./Director";
import { preloadFigure } from "./figureModel";
import { buildFog } from "./fogOfWar";
import { Ping, TitleCard } from "./Fx";
import { toWorld } from "./maps";
import { type HitFx, Party } from "./Party";
import { MapScene } from "./Scene";
import { figures, pixelToCell, resolveMap } from "./session";

/**
 * The immersive table (Plan 109, Milestone 1; Plan 110, Milestone 2).
 *
 *   /table/:sessionId/engine
 *
 * The same capability URL as the Table View: the session UUID is the secret,
 * and the projection it reads is player-safe by construction. Whatever map
 * the DM has active is rendered — built, if the engine has scene data for
 * it; the picture, lit, if not — with every token standing on its cell.
 * When a token is moved in the HUD, the figure walks there. When the turn
 * advances, the camera glides to whoever is up. What the DM has not revealed
 * is dark; the weather the DM picked is in the air; pings and hits land.
 * Nothing here writes anything.
 */
class SceneBoundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Loading() {
  const { active, progress, item } = useProgress();
  if (!active) return null;
  return (
    <small className="et-loading">
      loading {Math.round(progress)}% · {item.split("/").pop()}
    </small>
  );
}

const CSS = `
.et-root { position: fixed; inset: 0; background: #05060a; }
.et-hud { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 2; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  font: 13px system-ui, sans-serif; color: #cfcfd8; }
.et-hud h1 { font: 600 15px Cinzel, Georgia, serif; color: #f0e6c8; margin: 0 6px 0 0; letter-spacing: 0.04em; }
.et-hud button { font: inherit; padding: 6px 11px; border-radius: 9px; cursor: pointer;
  border: 1px solid #3a3a46; background: rgba(20,16,30,0.8); color: #cfcfd8; }
.et-hud button.on { border-color: #d6af36; background: rgba(214,175,54,0.16); color: #f0e6c8; }
.et-hud .turn { margin-left: auto; padding: 6px 12px; border-radius: 9px; border: 1px solid #d6af36;
  background: rgba(214,175,54,0.14); color: #f0e6c8; }
.et-hud small { opacity: 0.7; }
.et-hud .et-err { color: #ff8a8a; opacity: 1; }
.et-hud .et-loading { color: #d6af36; opacity: 1; }
.et-empty { position: absolute; inset: 0; display: grid; place-items: center; color: #9a93a5;
  font: 15px system-ui, sans-serif; text-align: center; padding: 24px; }
.et-title { position: absolute; inset: 0; display: grid; place-items: center; z-index: 3; pointer-events: none;
  animation: et-title 4.2s ease-in-out both; }
.et-title div { font: 600 clamp(28px, 4vw, 54px) "Cinzel Decorative", Cinzel, Georgia, serif; color: #f0e6c8;
  letter-spacing: 0.12em; text-align: center; padding: 18px 36px; text-shadow: 0 0 24px rgba(0,0,0,0.9), 0 2px 4px #000;
  border-top: 1px solid rgba(214,175,54,0.5); border-bottom: 1px solid rgba(214,175,54,0.5); }
@keyframes et-title { 0% { opacity: 0; transform: translateY(8px); } 12% { opacity: 1; transform: none; }
  82% { opacity: 1; } 100% { opacity: 0; } }
`;

type PingFx = { id: string; at: THREE.Vector3 };
type StreamPayload = { type: string; x?: number; y?: number; kind?: string; ref_id?: string; amount?: number };

export default function EngineTable() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data, refetch, isError } = useQuery({
    queryKey: ["table-projection", sessionId],
    queryFn: () => tableApi.getProjection(sessionId as string),
    enabled: !!sessionId,
    refetchOnWindowFocus: true,
  });
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const map = useMemo(() => (data?.map ? resolveMap(data.map) : null), [data]);
  useEffect(() => {
    if (map) preloadProps(map);
  }, [map]);
  useEffect(() => {
    for (const t of data?.tokens ?? []) if (t.model_url) preloadFigure(t.model_url);
  }, [data]);
  const fog = useMemo(() => (data ? buildFog(data) : null), [data]);

  // Pings and hits arrive on the stream, not the projection: transient, played once.
  const [pings, setPings] = useState<PingFx[]>([]);
  const [fx, setFx] = useState<HitFx[]>([]);
  const counter = useRef(0);
  const mapRef = useRef(map);
  const dataRef = useRef(data);
  useEffect(() => {
    mapRef.current = map;
    dataRef.current = data;
  }, [map, data]);
  useEventStream("table", sessionId, (raw) => {
    const e = raw as unknown as StreamPayload;
    if (e.type === "table.ping" && typeof e.x === "number" && typeof e.y === "number") {
      const m = mapRef.current;
      const d = dataRef.current;
      if (!m || !d?.map) return;
      counter.current += 1;
      setPings((cur) => [...cur, { id: `p${counter.current}`, at: pixelToCell(m, d.map!, e.x!, e.y!) }]);
      return;
    }
    if (e.type === "table.fx") {
      if (!e.ref_id || (e.kind !== "damage" && e.kind !== "heal")) return;
      counter.current += 1;
      setFx((cur) => [...cur, { id: `f${counter.current}`, ref: e.ref_id!, kind: e.kind as "damage" | "heal", amount: typeof e.amount === "number" ? Math.abs(e.amount) : null }]);
      return;
    }
    if (e.type === "table.roll") return;
    void refetchRef.current();
  });
  const dropPing = useCallback((id: string) => setPings((cur) => cur.filter((p) => p.id !== id)), []);
  const dropFx = useCallback((id: string) => setFx((cur) => cur.filter((f) => f.id !== id)), []);

  const [grid, setGrid] = useState(true);
  const [follow, setFollow] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [frameNonce, setFrameNonce] = useState(0);

  const active = useMemo(() => {
    if (!map || !data) return null;
    return figures(map, data).find((f) => f.active) ?? null;
  }, [map, data]);
  const activeName = data?.initiative.find((i) => i.active)?.name ?? active?.label ?? null;

  if (!sessionId) return null;
  if (isError) {
    return (
      <div className="et-root">
        <style>{CSS}</style>
        <div className="et-empty">This table isn't open. Check the link.</div>
      </div>
    );
  }
  if (!data || !map) {
    return (
      <div className="et-root">
        <style>{CSS}</style>
        <div className="et-empty">{data && !data.map ? "No map is on the table yet — the DM picks one from the HUD." : "Joining the table…"}</div>
      </div>
    );
  }

  const [lx, lz] = toWorld(map, ...map.look);
  const look = new THREE.Vector3(lx, 0.6, lz);
  const eye: [number, number, number] = [look.x + map.eye[0], look.y + map.eye[1], look.z + map.eye[2]];

  return (
    <div className="et-root">
      <style>{CSS}</style>
      <div className="et-hud">
        <h1>{data.title || map.name}</h1>
        <button className={grid ? "on" : ""} onClick={() => setGrid((v) => !v)}>
          Grid
        </button>
        <button className={follow ? "on" : ""} onClick={() => setFollow((v) => !v)} title="Glide to whoever's turn it is">
          Follow the turn
        </button>
        <button disabled={!active} onClick={() => setFrameNonce((n) => n + 1)} title={active ? `Look at ${active.label}` : "Nobody's turn yet"}>
          Frame the turn
        </button>
        <Loading />
        {err && <small className="et-err">⚠ {err}</small>}
        {data.combat_running && (
          <span className="turn">
            Round {data.round}
            {activeName ? ` · ${activeName}` : ""}
          </span>
        )}
      </div>
      <TitleCard title={data.title} />
      <Canvas
        key={map.id}
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 260, position: eye }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <SceneBoundary onError={(e) => setErr(e.message)}>
          <Suspense fallback={null}>
            <MapScene map={map} grid={grid} darkness={data.darkness} fog={fog} weather={data.weather}>
              <Party map={map} projection={data} fog={fog} fx={fx} onFxDone={dropFx} />
              {pings.map((p) => (
                <Ping key={p.id} at={p.at} onDone={() => dropPing(p.id)} />
              ))}
            </MapScene>
          </Suspense>
        </SceneBoundary>
        <OrbitControls target={look} enablePan minDistance={3} maxDistance={80} maxPolarAngle={Math.PI / 2 - 0.06} makeDefault />
        <Director at={active?.cell ?? null} nonce={frameNonce} follow={follow} />
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={1} mipmapBlur intensity={0.85} radius={0.7} />
          <Vignette eskil={false} offset={0.22} darkness={0.8} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
