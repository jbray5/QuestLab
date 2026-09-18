import { OrbitControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import { Component, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraKeys } from "./Controls";
import { KEY_HELP } from "./keys";
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
import { FpsProbe } from "./FpsProbe";
import { Post } from "./Post";
import { QualityContext } from "./quality";
import { play as sfx, setSoundEnabled, soundEnabled, unlock as unlockSound } from "./sound";
import { strikeKind, TIMING } from "./strikes";
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
.et-turn-card { position: absolute; top: 64px; right: 14px; z-index: 3; display: flex; gap: 12px; align-items: center;
  padding: 8px 16px 8px 8px; border-radius: 14px; border: 1px solid #d6af36; background: rgba(12,10,18,0.78);
  backdrop-filter: blur(6px); pointer-events: none; transition: opacity 200ms; }
.et-turn-card.hidden { opacity: 0; }
.et-turn-card img, .et-turn-card .et-turn-initial { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; object-position: top;
  border: 2px solid #d6af36; background: #1b1722; display: grid; place-items: center; font: 700 30px Cinzel, Georgia, serif; }
.et-turn-card div { display: flex; flex-direction: column; line-height: 1.15; }
.et-turn-card small { font: 600 11px system-ui, sans-serif; letter-spacing: 0.12em; text-transform: uppercase; }
.et-turn-card b { font: 700 20px Cinzel, Georgia, serif; color: #f0e6c8; white-space: nowrap; }
.et-order { position: absolute; top: 152px; right: 14px; z-index: 3; display: flex; gap: 10px; align-items: flex-start; pointer-events: none; transition: opacity 200ms; }
.et-order.hidden { opacity: 0; }
.et-order div { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 46px; }
.et-order img, .et-order i { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; object-position: top; border: 2px solid #6a6a78;
  background: #1b1722; display: grid; place-items: center; font: 700 16px Cinzel, Georgia, serif; font-style: normal; color: #cfcfd8; }
.et-order div.now img, .et-order div.now i { width: 44px; height: 44px; }
.et-order span { font: 600 10px system-ui, sans-serif; color: #b9b0a0; max-width: 46px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.et-order div.down { opacity: 0.35; }
.et-order div.down img, .et-order div.down i { filter: grayscale(1); }
.et-hud .turn { margin-left: auto; padding: 6px 12px; border-radius: 9px; border: 1px solid #d6af36;
  background: rgba(214,175,54,0.14); color: #f0e6c8; }
.et-hud small { opacity: 0.7; }
.et-hud.hidden { display: none; }
.et-help { position: absolute; right: 12px; top: 52px; z-index: 3; font: 13px system-ui, sans-serif; color: #cfcfd8;
  background: rgba(12,10,18,0.9); border: 1px solid #3a3a46; border-radius: 10px; padding: 10px 14px; }
.et-help table { border-collapse: collapse; }
.et-help td { padding: 2px 10px 2px 0; }
.et-help td:first-child { color: #f0e6c8; font-weight: 600; white-space: nowrap; }
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
type StreamPayload = { type: string; x?: number; y?: number; kind?: string; ref_id?: string; amount?: number; from_ref?: string; flavor?: string };
/** Where the Fast choice is kept between visits. */
const FAST_KEY = "ql.engine.fast";

export default function EngineTable() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data, refetch, isError } = useQuery({
    queryKey: ["table-projection", sessionId],
    queryFn: () => tableApi.getProjection(sessionId as string),
    enabled: !!sessionId,
    refetchOnWindowFocus: true,
    // A safety net under the event stream: a dropped connection must not freeze the TV mid-fight.
    refetchInterval: 8000,
    refetchIntervalInBackground: true,
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
      if (e.kind === "ko") {
        sfx("ko");
        return;
      }
      if (!e.ref_id || (e.kind !== "damage" && e.kind !== "heal")) return;
      // The sound of it: the swing or cast now, the landing when the bolt arrives.
      {
        const m = mapRef.current;
        const d = dataRef.current;
        const figs = m && d ? figures(m, d) : [];
        const from = e.from_ref ? figs.find((f) => f.ref === e.from_ref) : undefined;
        const to = figs.find((f) => f.ref === e.ref_id);
        if (from && to && from !== to) {
          const kind = strikeKind(e.flavor, from.cell.distanceTo(to.cell));
          const timing = TIMING[kind];
          sfx(kind === "melee" ? "whoosh" : kind === "shoot" ? "twang" : "cast");
          sfx(e.kind === "heal" ? "heal" : kind === "cast" ? "burst" : "hit", timing.impact);
        } else {
          sfx(e.kind === "heal" ? "heal" : "hit");
        }
      }
      counter.current += 1;
      setFx((cur) => [
        ...cur,
        {
          id: `f${counter.current}`,
          ref: e.ref_id!,
          kind: e.kind as "damage" | "heal",
          amount: typeof e.amount === "number" ? Math.abs(e.amount) : null,
          from: e.from_ref ?? null,
          flavor: e.flavor ?? null,
          at: performance.now(),
        },
      ]);
      return;
    }
    if (e.type === "table.roll") return;
    void refetchRef.current();
  });
  const dropPing = useCallback((id: string) => setPings((cur) => cur.filter((p) => p.id !== id)), []);
  const dropFx = useCallback((id: string) => setFx((cur) => cur.filter((f) => f.id !== id)), []);

  const [grid, setGrid] = useState(true);
  // Plan 113 — Fast mode: chosen here, or turned on by the probe when the machine can't keep up.
  const [fast, setFast] = useState(() => {
    try {
      return localStorage.getItem(FAST_KEY) === "1";
    } catch {
      return false;
    }
  });
  const fastChosen = useRef(false);
  useEffect(() => {
    try {
      fastChosen.current = localStorage.getItem(FAST_KEY) !== null;
    } catch {
      fastChosen.current = false;
    }
  }, []);
  const toggleFast = () => {
    const next = !fast;
    setFast(next);
    fastChosen.current = true;
    try {
      localStorage.setItem(FAST_KEY, next ? "1" : "0");
    } catch {
      /* a private window forgets; fine */
    }
  };
  const quality = useMemo(() => ({ fast }), [fast]);
  const [follow, setFollow] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [frameNonce, setFrameNonce] = useState(0);
  // TaleSpire's keys (Plan 111 follow-up): Space hides the interface (hold to peek),
  // Tab turns names off and on, F1 shows the card, F2 returns to the board's view,
  // a double-click on the floor looks there. The camera keys live in <CameraKeys>.
  const [hud, setHud] = useState(true);
  const [peek, setPeek] = useState(false);
  const [labels, setLabels] = useState(true);
  const [cinema, setCinema] = useState(true);
  // Sound: off/on for this machine; browsers need a touch before they will play anything.
  const [sound, setSound] = useState(soundEnabled);
  useEffect(() => {
    const arm = () => unlockSound();
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
  };
  // A tick when the turn moves on.
  const lastTurn = useRef<string | null>(null);
  useEffect(() => {
    const ref = data?.active_token_ref ?? null;
    if (ref && lastTurn.current && ref !== lastTurn.current) sfx("turn");
    lastTurn.current = ref;
  }, [data?.active_token_ref]);
  const [help, setHelp] = useState(false);
  const [homeNonce, setHomeNonce] = useState(0);
  const [focus, setFocus] = useState<{ at: THREE.Vector3; nonce: number } | null>(null);
  const lastClick = useRef<{ t: number; p: THREE.Vector3 } | null>(null);
  const spaceDown = useRef<number | null>(null);
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || !!el?.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F1") {
        e.preventDefault();
        setHelp((v) => !v);
      } else if (e.key === "F2") {
        e.preventDefault();
        setHomeNonce((n) => n + 1);
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (!e.repeat) setLabels((v) => !v);
      } else if (e.key === " ") {
        e.preventDefault();
        if (e.repeat) return;
        spaceDown.current = performance.now();
        setHud((v) => {
          if (v) return false;
          setPeek(true);
          return v;
        });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== " " || spaceDown.current === null) return;
      const held = performance.now() - spaceDown.current;
      spaceDown.current = null;
      setPeek((wasPeek) => {
        if (wasPeek && held < 300) setHud(true);
        return false;
      });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  const onFloorClick = useCallback((p: THREE.Vector3) => {
    const now = performance.now();
    const prev = lastClick.current;
    lastClick.current = { t: now, p: p.clone() };
    if (prev && now - prev.t < 400 && prev.p.distanceTo(p) < 0.6) {
      lastClick.current = null;
      setFocus((f) => ({ at: p.clone(), nonce: (f?.nonce ?? 0) + 1 }));
    }
  }, []);

  const active = useMemo(() => {
    if (!map || !data) return null;
    return figures(map, data).find((f) => f.active) ?? null;
  }, [map, data]);
  const activeName = data?.initiative.find((i) => i.active)?.name ?? active?.label ?? null;
  // Whose turn it is, for the card in the corner: the token's portrait, and its side for the ring.
  const activeToken = data?.active_token_ref ? (data.tokens.find((t) => t.ref_id === data.active_token_ref) ?? null) : null;
  const turnTint = activeToken ? (activeToken.kind === "pc" ? "#d6af36" : activeToken.kind === "monster" ? "#c04a4a" : "#8a8a9a") : "#d6af36";
  // The order strip: from whoever is up, the next seven, with their portraits.
  const order = useMemo(() => {
    if (!data) return [];
    const list = data.initiative;
    const start = Math.max(0, list.findIndex((i) => i.active));
    const tintOf = (k: string) => (k === "pc" ? "#d6af36" : k === "monster" ? "#c04a4a" : "#8a8a9a");
    return list.slice(start).concat(list.slice(0, start)).slice(0, 8).map((i) => ({
      ref: i.ref,
      name: i.name,
      defeated: i.defeated,
      tint: tintOf(i.kind),
      image: data.tokens.find((t) => t.ref_id === i.ref)?.image_url ?? null,
    }));
  }, [data]);

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
      <div className={hud || peek ? "et-hud" : "et-hud hidden"}>
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
        <button className={cinema ? "on" : ""} onClick={() => setCinema((v) => !v)} title="Depth of field on whoever is framed">
          Cinema
        </button>
        <button className={fast ? "on" : ""} onClick={toggleFast} title="Less picture, more frames: no torch shadows, no depth of field, a plain pixel ratio">
          Fast
        </button>
        <button className={sound ? "on" : ""} onClick={toggleSound} title="Swings, bolts, heals, knockouts and the turn tick">
          Sound
        </button>
        <button className={help ? "on" : ""} onClick={() => setHelp((v) => !v)} title="The keys (F1)">
          ?
        </button>
        <Loading />
        {err && <small className="et-err">⚠ {err}</small>}
      </div>
      {data.combat_running && activeName && (
        <div className={hud || peek ? "et-turn-card" : "et-turn-card hidden"} style={{ borderColor: turnTint }} aria-label={`${activeName}'s turn`}>
          {activeToken?.image_url ? (
            <img src={activeToken.image_url} alt="" style={{ borderColor: turnTint }} />
          ) : (
            <span className="et-turn-initial" style={{ borderColor: turnTint, color: turnTint }}>
              {activeName.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <small style={{ color: turnTint }}>{data.round ? `Round ${data.round} · ` : ""}now</small>
            <b>{activeName}</b>
          </div>
        </div>
      )}
      {data.combat_running && order.length > 1 && (
        <div className={hud || peek ? "et-order" : "et-order hidden"} aria-label="Turn order">
          {order.map((o, i) => (
            <div key={o.ref} className={(i === 0 ? "now" : "") + (o.defeated ? " down" : "")} title={o.name}>
              {o.image ? <img src={o.image} alt="" style={{ borderColor: o.tint }} /> : <i style={{ borderColor: o.tint, color: o.tint }}>{o.name.trim().charAt(0).toUpperCase()}</i>}
              <span>{o.name.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      )}
      {help && (
        <div className="et-help">
          <table>
            <tbody>
              {KEY_HELP.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TitleCard title={data.title} />
      <Canvas
        key={`${map.id}-${fast ? "fast" : "full"}`}
        shadows={fast ? false : { type: THREE.PCFShadowMap }}
        dpr={fast ? 1 : [1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 260, position: eye }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <SceneBoundary onError={(e) => setErr(e.message)}>
          <QualityContext.Provider value={quality}>
          {!fast && <FpsProbe onSlow={() => { if (!fastChosen.current) setFast(true); }} />}
          <Suspense fallback={null}>
            <MapScene map={map} grid={grid} darkness={data.darkness} fog={fog} weather={data.weather} onFloorClick={onFloorClick} revealedExits={data.revealed_exits ?? []}>
              <Party map={map} projection={data} fog={fog} fx={fx} onFxDone={dropFx} labels={labels} />
              {pings.map((p) => (
                <Ping key={p.id} at={p.at} onDone={() => dropPing(p.id)} />
              ))}
            </MapScene>
          </Suspense>
          </QualityContext.Provider>
        </SceneBoundary>
        <OrbitControls
          target={look}
          enablePan
          minDistance={3}
          maxDistance={80}
          maxPolarAngle={Math.PI / 2 - 0.06}
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }}
          makeDefault
        />
        <CameraKeys home={{ eye, look }} homeNonce={homeNonce} />
        <Director at={active?.cell ?? null} nonce={frameNonce} follow={follow} focus={focus} />
        <Post fast={fast} cinema={cinema} focus={focus ? [focus.at.x, 0.9, focus.at.z] : active ? [active.cell.x, 1.0, active.cell.z] : null} />
      </Canvas>
    </div>
  );
}
