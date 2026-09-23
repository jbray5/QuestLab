import { OrbitControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Component, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import { preloadProps } from "./assets";
import { CameraKeys } from "./Controls";
import { DEFAULT_HEIGHT_FT, FT_PER_UNIT } from "./heights";
import { Marks } from "./Impact";
import { addMarks, markKind, useMarkStore } from "./impactMarks";
import { lintMap } from "./lint";
import { snapToCell, toWorld } from "./maps";
import { MAPS } from "./registry";
import { Post } from "./Post";
import { MapScene } from "./Scene";
import { flavorColor, TIMING } from "./strikes";
import { type FigureModel, Walker } from "./Walker";
import { Bolt } from "./Fx";

/**
 * The immersive spike (Plan 108): a map rendered in the engine, so Justin can
 * judge it with his own eyes on the TV. Any map in the registry; the built
 * scene — full 3D with furniture — is the standard.
 *
 *   /engine/spike?map=tavern|restwater|abode  which map
 *   &scene=hybrid                              the painted floor instead, for comparison
 *   &grid=1  &check=1                          the combat grid; the sanity check
 *   &look=<preset>                             a camera preset the map defines
 *   &model=<url>  &height=<ft>                 a rigged .glb to walk instead of the Soldier (Plan 111)
 *   &strike=melee|cast|shoot  &hold=0.4       play a strike at a target on a loop (Plan 113); hold freezes the pose at that phase
 *   &light=studio                              a neutral three-point light for judging a face against its portrait
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

/** Two figures and a strike between them every few seconds — for looking at the swing, the bolt and the flinch. */
function StrikeDemo({ start, model, kind, hold }: { start: THREE.Vector3; model: FigureModel | null; kind: "melee" | "cast" | "shoot"; hold?: number }) {
  const far = kind === "melee" ? 1 : 4;
  // The target stands down −z: the attacker faces away from the side camera's z and shows it her right arm (zoom=2 looks from +x).
  const target = useMemo(() => new THREE.Vector3(start.x, 0, start.z - far), [start, far]);
  const [beat, setBeat] = useState<{ id: string; at: number } | null>(null);
  useEffect(() => {
    let n = 0;
    const fire = () => {
      n += 1;
      const at = performance.now();
      setBeat({ id: `s${n}`, at });
      // What the blow leaves: blood for a blade, a scorch for the fire bolt.
      const mk = markKind(kind === "cast" ? "fire" : "weapon");
      if (mk) {
        addMarks([
          { id: `m${n}`, kind: mk, at: new THREE.Vector3(target.x, 0, target.z - 0.3), t0: at + TIMING[kind].impact, seed: n % 6, size: 1.0, yaw: n * 1.7, lift: (n % 5) * 0.0012, dir: new THREE.Vector3(0, 0, -1), hitY: 0.9 },
        ]);
      }
    };
    const first = setTimeout(fire, 1200);
    const every = setInterval(fire, 2800);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [kind, target]);
  const flavor = kind === "cast" ? "fire" : "weapon";
  const timing = TIMING[kind];
  const h = (model?.heightFt ?? DEFAULT_HEIGHT_FT) / FT_PER_UNIT;
  const held = hold !== undefined;
  const marks = useMarkStore();
  return (
    <group>
      <Marks marks={marks} />
      <Walker cell={start} model={model} label="attacker" strike={beat ? { id: beat.id, kind, toward: target, at: beat.at, hold } : null} />
      <Walker cell={target} model={{ url: null, heightFt: DEFAULT_HEIGHT_FT }} label="target" tint="#c04a4a" hit={held ? undefined : beat?.id} hitAt={beat ? beat.at + timing.impact : undefined} />
      {beat && kind !== "melee" && (
        <Bolt key={beat.id} from={new THREE.Vector3(start.x, h * 0.55, start.z)} to={new THREE.Vector3(target.x, 0.6, target.z)} color={flavorColor(flavor)} kind={kind} launchMs={timing.launch} impactMs={timing.impact} t0={beat.at} holdMs={held ? hold * (timing.impact + 200) : undefined} />
      )}
    </group>
  );
}

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
  // A model to walk instead of the Soldier (Plan 111): any rigged .glb by URL.
  const model = useMemo(() => {
    const url = params.get("model");
    return url ? { url, heightFt: Number(params.get("height")) || DEFAULT_HEIGHT_FT } : null;
  }, [params]);
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
  const [sx, sz] = toWorld(map, ...map.start);
  const start = snapToCell(map, new THREE.Vector3(sx, 0, sz));
  // ?zoom=1 — a close look at whoever is standing on the start cell (Plan 111 previews).
  const zoom = params.get("zoom");
  const sk = params.get("strike");
  const strikeDemo = sk === "melee" || sk === "cast" || sk === "shoot" ? sk : null;
  const hold = params.get("hold") ? Number(params.get("hold")) : undefined;
  // ?clean=1 — no interface and no figure: the frame is the room alone (a catalog picture).
  const clean = params.get("clean") === "1";
  // ?light=studio — a neutral three-point rig over the room's own light, for judging a face against its portrait.
  const studio = params.get("light") === "studio";
  const [lx, lz] = toWorld(map, ...(preset?.at ?? map.look));
  // zoom=3 is a portrait: the eye line of a figure of ?height (5.5 ft when unsaid).
  const faceY = (Number(params.get("height") || 5.5) / FT_PER_UNIT) * 0.92;
  // Built once per view: a fresh Vector3 each render would make OrbitControls snap the target home on every click.
  const look = useMemo(
    () => (zoom === "3" ? new THREE.Vector3(start.x, faceY, start.z) : zoom ? new THREE.Vector3(start.x, 0.95, start.z) : new THREE.Vector3(lx, 0.6, lz)),
    [zoom, start.x, start.z, faceY, lx, lz],
  );
  // zoom=1 from the front-right; zoom=2 square from the side, for judging a stance; zoom=3 the face.
  const off0 = zoom === "3" ? [0.32, 0.04, 0.42] : zoom === "2" ? [2.6, 0.35, 0.1] : zoom ? [0.9, 0.55, 2.1] : (preset?.eye ?? map.eye);
  // &orbit=<degrees> swings a zoom view around the figure (a model that faces the other way).
  const orbit = ((Number(params.get("orbit")) || 0) * Math.PI) / 180;
  const off = zoom && orbit ? [off0[0] * Math.cos(orbit) - off0[2] * Math.sin(orbit), off0[1], off0[0] * Math.sin(orbit) + off0[2] * Math.cos(orbit)] : off0;
  const eye: [number, number, number] = [look.x + off[0], look.y + off[1], look.z + off[2]];
  const send = (p: THREE.Vector3) => setTarget(snapToCell(map, p));

  return (
    <div className="sp-root">
      <style>{CSS}</style>
      {!clean && (
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
      )}
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
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 220, position: eye }}
        onCreated={({ gl, scene }) => {
          if (params.get("stats") === "1") (window as unknown as { __ql?: unknown }).__ql = { gl, scene };
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
              {clean ? null : strikeDemo ? <StrikeDemo start={start} model={model} kind={strikeDemo} hold={hold} /> : <Walker cell={target ?? start} model={model} />}
              {studio && (
                <>
                  <ambientLight intensity={0.55} color="#fff6ea" />
                  <directionalLight position={[start.x + 2.5, 4.5, start.z + 3]} intensity={2.6} color="#fff1dc" />
                  <directionalLight position={[start.x - 3, 3, start.z - 2]} intensity={1.1} color="#dbe7ff" />
                </>
              )}
            </MapScene>
          </Suspense>
        </SceneBoundary>
        <OrbitControls
          target={look}
          enablePan
          minDistance={zoom === "3" ? 0.25 : 3}
          maxDistance={40}
          maxPolarAngle={Math.PI / 2 - 0.06}
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }}
          makeDefault
        />
        <CameraKeys home={{ eye, look }} homeNonce={0} />
        <Post focus={zoom ? [start.x, zoom === "3" ? faceY : 1.0, start.z] : null} cinema={params.get("sharp") !== "1"} />
      </Canvas>
    </div>
  );
}
