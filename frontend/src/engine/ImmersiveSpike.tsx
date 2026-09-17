import { OrbitControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Component, type ReactNode, Suspense, useEffect, useState } from "react";
import * as THREE from "three";

import { BuiltFloor } from "./BuiltScene";
import { CellMarker, GridOverlay } from "./grid";
import { HybridFloor } from "./HybridScene";
import { TavernProps } from "./Props";
import { TAPROOM_CENTRE, TAVERN_TORCHES, TAVERN_WALLS, snapToCell, toWorld } from "./tavern";
import { Torch } from "./Torch";
import { Walker } from "./Walker";
import { Walls } from "./Walls";

/**
 * The immersive spike (Plan 108): the same tavern two ways, so Justin can
 * choose with his own eyes on the TV.
 *
 *   /engine/spike            — hybrid: the painted Czepeku map, lit
 *   /engine/spike?scene=built — full-3D: photoscanned stone, no painted pixel
 *
 * Everything but the floor is shared. Click the floor and the character walks
 * there. Drag to orbit, wheel to zoom. Nothing here touches the existing board.
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
.sp-hud { position: absolute; top: 14px; left: 14px; z-index: 2; display: flex; gap: 8px; align-items: center;
  font: 13px system-ui, sans-serif; color: #cfcfd8; }
.sp-hud button { font: inherit; padding: 7px 12px; border-radius: 9px; cursor: pointer;
  border: 1px solid #3a3a46; background: rgba(20,16,30,0.8); color: #cfcfd8; }
.sp-hud button.on { border-color: #d6af36; background: rgba(214,175,54,0.16); color: #f0e6c8; }
.sp-hud small { opacity: 0.7; margin-left: 6px; }
.sp-hud .sp-err { color: #ff8a8a; opacity: 1; }
.sp-hud .sp-loading { color: #d6af36; opacity: 1; }
.sp-log { position: absolute; left: 14px; bottom: 12px; z-index: 2; font: 11px monospace; color: #ff9a9a;
  background: rgba(0,0,0,0.55); padding: 6px 8px; border-radius: 6px; max-width: 70vw; }
.sp-load { position: absolute; inset: 0; display: grid; place-items: center; color: #9a93a5;
  font: 14px system-ui, sans-serif; pointer-events: none; }
`;

export default function ImmersiveSpike() {
  const fromUrl = new URLSearchParams(window.location.search).get("scene");
  const [scene, setScene] = useState<Scene>(fromUrl === "built" ? "built" : "hybrid");
  const [target, setTarget] = useState<THREE.Vector3 | null>(null);
  // Second pass — furniture, and the combat grid. Both work in either scene.
  const [props, setProps] = useState(true);
  const [grid, setGrid] = useState(new URLSearchParams(window.location.search).get("grid") === "1");
  const send = (p: THREE.Vector3) => setTarget(snapToCell(p));
  const [err, setErr] = useState<string | null>(null);
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
  // ?look=bar frames the bar; otherwise the middle of the taproom.
  const atBar = new URLSearchParams(window.location.search).get("look") === "bar";
  const [lx, lz] = atBar ? toWorld(0.575, 0.268) : TAPROOM_CENTRE;
  const look = new THREE.Vector3(lx, 0.6, lz);
  const eye: [number, number, number] = atBar
    ? [look.x + 0.6, look.y + 2.4, look.z + 4.6]
    : [look.x + 1.2, look.y + 3.4, look.z + 6.8];

  return (
    <div className="sp-root">
      <style>{CSS}</style>
      <div className="sp-hud">
        <button className={scene === "hybrid" ? "on" : ""} onClick={() => setScene("hybrid")}>
          Hybrid — your painted map, lit
        </button>
        <button className={scene === "built" ? "on" : ""} onClick={() => setScene("built")}>
          Built — full 3D, no painted pixel
        </button>
        <button className={props ? "on" : ""} onClick={() => setProps((v) => !v)}>
          Furniture
        </button>
        <button className={grid ? "on" : ""} onClick={() => setGrid((v) => !v)}>
          Grid
        </button>
        <small>click a cell to walk there · drag to orbit · wheel to zoom</small>
        <Loading />
        {err && <small className="sp-err">⚠ {err}</small>}
      </div>
      {logs.length > 0 && (
        <div className="sp-log">
          {logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 220, position: eye }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <color attach="background" args={["#05060a"]} />
        <fogExp2 attach="fog" args={["#05060a", 0.03]} />
        {/* Moonlight through the gaps, faint. The torches do the work. */}
        <hemisphereLight args={["#3b4a6b", "#0b0908", 0.14]} />
        <ambientLight intensity={0.05} />
        <SceneBoundary onError={(e) => setErr(e.message)}>
        <Suspense fallback={null}>
          {scene === "hybrid" ? <HybridFloor onClick={send} /> : <BuiltFloor onClick={send} />}
          {props && <TavernProps />}
          {grid && <GridOverlay />}
          {target && <CellMarker at={target} />}
          <Walls segs={TAVERN_WALLS} />
          {TAVERN_TORCHES.map(([u, v, shadow], i) => {
            const [x, z] = toWorld(u, v);
            return <Torch key={i} position={[x, 1.55, z]} shadow={shadow} />;
          })}
          <Walker start={[Math.round(TAPROOM_CENTRE[0]), Math.floor(TAPROOM_CENTRE[1]) + 0.5]} target={target} />
        </Suspense>
        </SceneBoundary>
        <OrbitControls
          target={look}
          enablePan
          minDistance={3}
          maxDistance={40}
          maxPolarAngle={Math.PI / 2 - 0.06}
          makeDefault
        />
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={1} mipmapBlur intensity={0.85} radius={0.7} />
          <Vignette eskil={false} offset={0.22} darkness={0.8} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
