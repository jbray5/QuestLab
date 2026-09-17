import { OrbitControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Component, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import { preloadProps } from "./assets";
import { lintMap } from "./lint";
import { snapToCell, toWorld } from "./maps";
import { MAPS } from "./registry";
import { MapScene } from "./Scene";
import { Walker } from "./Walker";

/**
 * The immersive spike (Plan 108): a map rendered in the engine, so Justin can
 * judge it with his own eyes on the TV. Any map in the registry; the built
 * scene — full 3D with furniture — is the standard.
 *
 *   /engine/spike?map=tavern|restwater|abode  which map
 *   &scene=hybrid                              the painted floor instead, for comparison
 *   &grid=1  &check=1                          the combat grid; the sanity check
 *   &look=<preset>                             a camera preset the map defines
 *
 * Click a cell and the character walks there. Drag to orbit, wheel to zoom.
 * The live table is /table/:sessionId/engine (Plan 109); this page is where
 * a map is looked at on its own.
 */
type Scene = "hybrid" | "built";

/**
 * A black screen on the TV tells nobody anything. Anything that throws inside
 * the scene is caught here and printed in the corner instead.
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

/** What is still loading, for the corner of the screen. */
function Loading() {
  const { active, progress, item } = useProgress();
  if (!active) return null;
  return (
    <small className="sp-loading">
      loading {Math.round(progress)}% · {item.split("/").pop()}
    </small>
  );
}

const CSS = `
.sp-root { position: fixed; inset: 0; background: #05060a; }
.sp-hud { position: absolute; top: 14px; left: 14px; z-index: 2; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  font: 13px system-ui, sans-serif; color: #cfcfd8; max-width: calc(100vw - 28px); }
.sp-hud button { font: inherit; padding: 7px 12px; border-radius: 9px; cursor: pointer;
  border: 1px solid #3a3a46; background: rgba(20,16,30,0.8); color: #cfcfd8; }
.sp-hud button.on { border-color: #d6af36; background: rgba(214,175,54,0.16); color: #f0e6c8; }
.sp-hud .sep { width: 1px; height: 22px; background: #3a3a46; }
.sp-hud small { opacity: 0.7; margin-left: 6px; }
.sp-hud .sp-err { color: #ff8a8a; opacity: 1; }
.sp-hud .sp-loading { color: #d6af36; opacity: 1; }
.sp-check { position: absolute; right: 14px; top: 56px; z-index: 2; width: min(440px, calc(100vw - 28px)); max-height: 70vh;
  overflow: auto; font: 12px system-ui, sans-serif; color: #cfcfd8; background: rgba(12,10,18,0.88);
  border: 1px solid #3a3a46; border-radius: 10px; padding: 10px 12px; }
.sp-check b { display: block; color: #f0e6c8; margin-bottom: 6px; }
.sp-check div { padding: 3px 0; border-top: 1px solid rgba(255,255,255,0.05); }
.sp-check .error { color: #ff8a8a; } .sp-check .warn { color: #e6c46a; } .sp-check .note { color: #8fb7a8; }
.sp-check em { color: #7f7a8a; font-style: normal; }
.sp-log { position: absolute; left: 14px; bottom: 12px; z-index: 2; font: 11px monospace; color: #ff9a9a;
  background: rgba(0,0,0,0.55); padding: 6px 8px; border-radius: 6px; max-width: 70vw; }
`;

export default function ImmersiveSpike() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const wanted = params.get("map") ?? "";
  const [mapId, setMapId] = useState(MAPS[wanted] ? wanted : "tavern");
  const map = MAPS[mapId];
  const [scene, setScene] = useState<Scene>(params.get("scene") === "hybrid" ? "hybrid" : "built");
  const [target, setTarget] = useState<THREE.Vector3 | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [props, setProps] = useState(true);
  const [grid, setGrid] = useState(params.get("grid") === "1");
  useEffect(() => {
    preloadProps(map);
  }, [map]);
  // The sanity check: what a builder would know about this map without looking.
  const [check, setCheck] = useState(params.get("check") === "1");
  const findings = useMemo(() => lintMap(map), [map]);
  useEffect(() => {
    for (const f of findings) {
      const where = f.at ? ` @ u${f.at[0]} v${f.at[1]}` : "";
      console.info(`[lint:${map.id}] ${f.level}: ${f.what}${where}`);
    }
  }, [findings, map.id]);
  // What the table is told when a way off the map is taken.
  const [note, setNote] = useState<string | null>(null);
  const pickMap = (id: string) => {
    setMapId(id);
    setTarget(null);
    setNote(null);
  };
  const takeExit = (label: string, to?: string) => {
    if (to && MAPS[to]) pickMap(to);
    else setNote(`${label} — the map below isn't built yet.`);
  };
  // Whatever the browser would have said in its console, said in the corner.
  const [logs, setLogs] = useState<string[]>([]);
  useEffect(() => {
    const note = (m: string) => setLogs((cur) => [...cur.slice(-5), m.slice(0, 160)]);
    const origErr = console.error;
    console.error = (...a: unknown[]) => {
      note("E " + a.map(String).join(" "));
      origErr(...a);
    };
    const onErr = (e: ErrorEvent) => note("X " + e.message);
    const onRej = (e: PromiseRejectionEvent) => note("R " + String(e.reason));
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      console.error = origErr;
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  // The camera: a preset the map names, or its default.
  const preset = map.looks?.[params.get("look") ?? ""];
  const [lx, lz] = toWorld(map, ...(preset?.at ?? map.look));
  const look = new THREE.Vector3(lx, 0.6, lz);
  const off = preset?.eye ?? map.eye;
  const eye: [number, number, number] = [look.x + off[0], look.y + off[1], look.z + off[2]];
  const [sx, sz] = toWorld(map, ...map.start);
  const start = snapToCell(map, new THREE.Vector3(sx, 0, sz));
  const send = (p: THREE.Vector3) => setTarget(snapToCell(map, p));

  return (
    <div className="sp-root">
      <style>{CSS}</style>
      <div className="sp-hud">
        {Object.values(MAPS).map((m) => (
          <button key={m.id} className={mapId === m.id ? "on" : ""} onClick={() => pickMap(m.id)}>
            {m.name}
          </button>
        ))}
        <span className="sep" />
        <button className={scene === "built" || !map.url ? "on" : ""} onClick={() => setScene("built")}>
          Built — full 3D
        </button>
        {map.url && (
          <button className={scene === "hybrid" ? "on" : ""} onClick={() => setScene("hybrid")}>
            Painted map, for comparison
          </button>
        )}
        <span className="sep" />
        <button className={props ? "on" : ""} onClick={() => setProps((v) => !v)}>
          Furniture
        </button>
        <button className={grid ? "on" : ""} onClick={() => setGrid((v) => !v)}>
          Grid
        </button>
        <button className={check ? "on" : ""} onClick={() => setCheck((v) => !v)}>
          Check{findings.some((f) => f.level !== "note") ? ` (${findings.filter((f) => f.level !== "note").length})` : " ✓"}
        </button>
        <small>click a cell to walk there · drag to orbit · wheel to zoom</small>
        <Loading />
        {note && <small className="sp-loading">{note}</small>}
        {err && <small className="sp-err">⚠ {err}</small>}
      </div>
      {check && (
        <div className="sp-check">
          <b>{map.name} — what a builder would say</b>
          {findings.length === 0 && <div>Nothing to report.</div>}
          {findings.map((f, i) => (
            <div key={i} className={f.level}>
              {f.what}
              {f.at && <em> · u{f.at[0]} v{f.at[1]}</em>}
            </div>
          ))}
        </div>
      )}
      {logs.length > 0 && (
        <div className="sp-log">
          {logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      {/* Keyed by map so the camera, the character and the loaded scene start over on a switch. */}
      <Canvas
        key={map.id}
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 220, position: eye }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <SceneBoundary onError={(e) => setErr(e.message)}>
          <Suspense fallback={null}>
            <MapScene
              map={map}
              painted={scene === "hybrid"}
              furniture={props}
              grid={grid}
              target={target}
              onFloorClick={send}
              onExit={takeExit}
            >
              <Walker cell={target ?? start} />
            </MapScene>
          </Suspense>
        </SceneBoundary>
        <OrbitControls target={look} enablePan minDistance={3} maxDistance={40} maxPolarAngle={Math.PI / 2 - 0.06} makeDefault />
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={1} mipmapBlur intensity={0.85} radius={0.7} />
          <Vignette eskil={false} offset={0.22} darkness={0.8} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
