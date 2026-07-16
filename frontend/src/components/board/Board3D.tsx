import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Html, OrbitControls } from "@react-three/drei";
import { DepthOfField, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { SessionCombatant, TableToken } from "../../api/types";
import { BackdropDome, LightRig, Weather } from "./atmosphere";
import {
  cardTint,
  getVignetteTexture,
  mixHex,
  processFigureImage,
  type WeatherKind,
} from "./boardTheme";

/**
 * Board3D — the 3D tabletop scene (Plans 44 + 45).
 *
 * The active battle map becomes a textured slab in a lit, weathered scene
 * (world units = image pixels, image top-left → world (-W/2, 0, -H/2));
 * tokens become billboarded standees, `kind: "light"` tokens become torches.
 * All persisted state lives in TableState.tokens — the same store the 2D
 * console PATCHes — so 2D and 3D never disagree.
 */

export type GridKind = "hex" | "square" | "off";

/** The map fields the board actually needs — satisfied by both BattleMap
 * (DM board) and the player-safe TableMapSummary (3D Table View). */
export interface BoardMapLike {
  id: string;
  image_url: string;
  width: number;
  height: number;
  grid_size: number | null;
  backdrop_url?: string | null;
}

export interface StrikeFx {
  seq: number;
  attackerId: string;
  targetId: string;
  amount: number | "miss";
}

export interface BoardPing {
  id: string;
  x: number;
  y: number;
}

interface GlideAnim {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number | null;
  done: boolean;
}

interface StrikeAnim extends StrikeFx {
  start: number | null;
}

interface Board3DProps {
  map: BoardMapLike;
  tokens: TableToken[];
  combatantByRef: Map<string, SessionCombatant>;
  activeRef: string | null;
  gridKind: GridKind;
  selectedId: string | null;
  attackArmed: boolean;
  strike: StrikeFx | null;
  darkness: number;
  weather: WeatherKind;
  cinema: boolean;
  followTurn: boolean;
  onSelect: (id: string | null) => void;
  onMoveCommit: (id: string, x: number, y: number) => void;
  onPickTarget: (attackerId: string, targetId: string) => void;
  /** Spectator mode (3D Table View): no selection, no movement, no attacks. */
  readOnly?: boolean;
  /** Defeated token refs from the player-safe projection (no combat data). */
  defeatedRefs?: string[];
  /** Transient "look here" pings, in image pixels. */
  pings?: BoardPing[];
  fogOn?: boolean;
  revealedRegions?: number[][][];
  brushReveals?: { x: number; y: number; r: number }[];
  /** 0.3ish for the DM (see-through), 0.9+ for the player view. */
  fogOpacity?: number;
}

const SQRT3 = Math.sqrt(3);
const PC_COLOR = "#d6af36";
const FOE_COLOR = "#b0472f";
const CUSTOM_COLOR = "#8a8fa3";

function tokenColor(t: TableToken): string {
  if (t.color) return t.color;
  if (t.kind === "pc") return PC_COLOR;
  if (t.kind === "monster") return FOE_COLOR;
  return CUSTOM_COLOR;
}

/** Pixels-per-cell for this map (MapCanvas uses the same fallback). */
function unitFor(map: BoardMapLike): number {
  return map.grid_size && map.grid_size > 0
    ? map.grid_size
    : Math.round(Math.min(map.width, map.height) / 20);
}

/** Stable per-token animation phase derived from its id. */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h / 997) * Math.PI * 2;
}

/** Snap an image-pixel point to the center of its hex/square cell. */
function snapPoint(px: number, py: number, unit: number, kind: GridKind): [number, number] {
  if (kind === "square") {
    return [(Math.floor(px / unit) + 0.5) * unit, (Math.floor(py / unit) + 0.5) * unit];
  }
  if (kind === "hex") {
    // Pointy-top hexes, width-across-flats = unit (axial coords + cube rounding).
    const s = unit / SQRT3;
    const q = ((SQRT3 / 3) * px - (1 / 3) * py) / s;
    const r = ((2 / 3) * py) / s;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(-q - r);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs - (-q - r));
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return [s * (SQRT3 * rq + (SQRT3 / 2) * rr), s * (3 / 2) * rr];
  }
  return [px, py];
}

/** Build the grid overlay as line-segment positions in world coords. */
function buildGrid(map: BoardMapLike, unit: number, kind: GridKind): Float32Array {
  const pts: number[] = [];
  const w = map.width;
  const h = map.height;
  const y = unit * 0.03;
  const push = (x1: number, z1: number, x2: number, z2: number) => {
    pts.push(x1 - w / 2, y, z1 - h / 2, x2 - w / 2, y, z2 - h / 2);
  };
  if (kind === "square") {
    for (let x = 0; x <= w; x += unit) push(x, 0, x, h);
    for (let z = 0; z <= h; z += unit) push(0, z, w, z);
  } else if (kind === "hex") {
    const s = unit / SQRT3;
    const rows = Math.ceil(h / (1.5 * s)) + 1;
    const cols = Math.ceil(w / unit) + 1;
    for (let row = 0; row <= rows; row += 1) {
      const cy = row * 1.5 * s;
      const offset = row % 2 === 1 ? unit / 2 : 0;
      for (let col = 0; col <= cols; col += 1) {
        const cx = col * unit + offset;
        for (let k = 0; k < 6; k += 1) {
          const a1 = (Math.PI / 180) * (60 * k - 30);
          const a2 = (Math.PI / 180) * (60 * (k + 1) - 30);
          push(cx + s * Math.cos(a1), cy + s * Math.sin(a1), cx + s * Math.cos(a2), cy + s * Math.sin(a2));
        }
      }
    }
  }
  return new Float32Array(pts);
}

/** Load a texture with CORS-safe settings; null while loading, error flag on failure.
 * With figureProcess, runs the minifig alpha-curve/auto-crop clean-up pass. */
function useBoardTexture(
  url: string | null | undefined,
  figureProcess = false,
): {
  tex: THREE.Texture | null;
  error: boolean;
} {
  // State is keyed by url so a source change resets by derivation, not by
  // synchronous setState in the effect (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{
    url: string;
    tex: THREE.Texture | null;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (t) => {
        if (!alive) return;
        t.colorSpace = THREE.SRGBColorSpace;
        let final: THREE.Texture = t;
        if (figureProcess && t.image instanceof HTMLImageElement) {
          const processed = processFigureImage(t.image);
          if (processed) final = processed;
        }
        setLoaded({ url, tex: final, error: false });
      },
      undefined,
      () => {
        if (alive) setLoaded({ url, tex: null, error: true });
      },
    );
    return () => {
      alive = false;
    };
  }, [url, figureProcess]);
  const current = url && loaded?.url === url ? loaded : null;
  return { tex: current?.tex ?? null, error: current?.error ?? false };
}

/** Global exposure rides the day-night dial: midday is genuinely bright. */
function Exposure({ darkness }: { darkness: number }) {
  useFrame(({ gl }) => {
    const target = 1.4 - 0.6 * darkness;
    if (gl.toneMappingExposure !== target) gl.toneMappingExposure = target;
  });
  return null;
}

/** Camera rig: orbit + T/Y presets, follow-the-turn chase, ambient drift. */
function CameraRig({
  mapW,
  mapH,
  drift,
  follow,
}: {
  mapW: number;
  mapH: number;
  drift: boolean;
  follow: { x: number; z: number; k: string } | null;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const goal = useRef<THREE.Vector3 | null>(null);
  const { camera } = useThree();
  const fit = Math.max(mapW, mapH) * 1.05;

  const apply = useCallback(
    (mode: "top" | "tilt") => {
      if (mode === "top") {
        camera.position.set(0, fit * 1.1, fit * 0.001);
      } else {
        const el = (35 * Math.PI) / 180;
        camera.position.set(0, fit * Math.sin(el), fit * Math.cos(el) * 0.85);
      }
      controls.current?.target.set(0, 0, 0);
      controls.current?.update();
    },
    [camera, fit],
  );

  useEffect(() => {
    apply("tilt");
  }, [apply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "t" || e.key === "T") apply("top");
      if (e.key === "y" || e.key === "Y") apply("tilt");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply]);

  const followKey = follow?.k ?? null;
  const followX = follow?.x ?? 0;
  const followZ = follow?.z ?? 0;
  useEffect(() => {
    if (followKey !== null) goal.current = new THREE.Vector3(followX, 0, followZ);
  }, [followKey, followX, followZ]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (goal.current) {
      c.target.lerp(goal.current, Math.min(1, dt * 2.4));
      if (c.target.distanceTo(goal.current) < fit * 0.004) goal.current = null;
    }
    if (drift) c.setAzimuthalAngle(c.getAzimuthalAngle() + dt * 0.025);
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      maxPolarAngle={Math.PI / 2 - 0.06}
      minDistance={fit * 0.12}
      maxDistance={fit * 2.4}
    />
  );
}

interface StandeeProps {
  token: TableToken;
  combatant: SessionCombatant | null;
  defeated: boolean;
  unit: number;
  mapW: number;
  mapH: number;
  darkness: number;
  isSelected: boolean;
  isActive: boolean;
  glideRef: RefObject<GlideAnim | null>;
  strikeRef: RefObject<StrikeAnim | null>;
  strikeTarget: { x: number; y: number } | null;
  floatingText: string | null;
  onMoveCommit: (id: string, x: number, y: number) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

function Standee({
  token,
  combatant,
  defeated,
  unit,
  mapW,
  mapH,
  darkness,
  isSelected,
  isActive,
  glideRef,
  strikeRef,
  strikeTarget,
  floatingText,
  onMoveCommit,
  onClick,
}: StandeeProps) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const flashMat = useRef<THREE.MeshBasicMaterial>(null);
  const cardGroup = useRef<THREE.Group>(null);
  const torchLight = useRef<THREE.PointLight>(null);
  const { tex } = useBoardTexture(token.image_url, token.style === "figure");
  const phase = useMemo(() => phaseOf(token.id), [token.id]);

  const isTorch = token.kind === "light";
  const r = unit * (token.size || 1) * 0.42;
  const cardW = unit * (token.size || 1) * 0.95;
  const cardH = unit * (token.size || 1) * 1.15;
  // Minifig cut-outs (transparent PNGs) render taller and frameless.
  const isFigure = token.style === "figure" && !!tex;
  const bodyW = isFigure ? unit * (token.size || 1) * 1.05 : cardW;
  const bodyH = isFigure ? unit * (token.size || 1) * 1.55 : cardH;
  const baseColor = tokenColor(token);
  const tint = cardTint(darkness);
  const hpPct = combatant ? Math.max(0, Math.min(1, combatant.hp_current / combatant.hp_max)) : null;
  const spawned = useRef(false);
  const scratch = useRef(new THREE.Vector3());

  useFrame((state, dt) => {
    const now = state.clock.elapsedTime;
    let px = token.x;
    let py = token.y;

    const g = glideRef.current;
    if (g && g.id === token.id && !g.done) {
      if (g.start === null) g.start = now;
      const t = Math.min(1, (now - g.start) / 0.5);
      const e = 1 - Math.pow(1 - t, 3);
      px = g.fromX + (g.toX - g.fromX) * e;
      py = g.fromY + (g.toY - g.fromY) * e;
      if (t >= 1) {
        g.done = true;
        onMoveCommit(token.id, g.toX, g.toY);
      }
    }

    const s = strikeRef.current;
    if (s && s.attackerId === token.id && strikeTarget) {
      if (s.start === null) s.start = now;
      const t = (now - s.start) / 0.45;
      if (t <= 1) {
        const dx = strikeTarget.x - token.x;
        const dy = strikeTarget.y - token.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const amp = Math.sin(Math.PI * t) * unit * 0.45;
        px += (dx / len) * amp;
        py += (dy / len) * amp;
      }
    }

    if (group.current) {
      // Local animations set the position directly; remote updates (SSE on
      // the 3D Table View, or another device moving a token) glide smoothly.
      const locallyAnimating =
        (g && g.id === token.id && !g.done) || (s && s.attackerId === token.id && !!strikeTarget);
      scratch.current.set(px - mapW / 2, 0, py - mapH / 2);
      if (!spawned.current || locallyAnimating) {
        group.current.position.copy(scratch.current);
        spawned.current = true;
      } else {
        group.current.position.lerp(scratch.current, Math.min(1, dt * 9));
      }
    }

    if (flashMat.current) {
      let opacity = 0;
      if (s && s.targetId === token.id && s.start !== null) {
        const t = now - s.start;
        if (t > 0.12 && t < 0.6) opacity = 0.85 * (1 - (t - 0.12) / 0.48);
      }
      flashMat.current.opacity = opacity;
    }

    if (ring.current && isActive) {
      const k = 1 + 0.07 * Math.sin(now * 4.2);
      ring.current.scale.setScalar(k);
    }

    if (cardGroup.current) {
      // Idle bob + defeat tip-over, both eased in the frame loop.
      const bob = defeated ? 0 : Math.sin(now * 1.6 + phase) * unit * 0.02;
      const targetTip = defeated ? 1.15 : 0;
      const cur = cardGroup.current.rotation.z;
      cardGroup.current.rotation.z = cur + (targetTip - cur) * Math.min(1, dt * 5 + 0.02);
      const targetSink = defeated ? -bodyH * 0.22 : 0;
      cardGroup.current.position.y += (targetSink + bob - cardGroup.current.position.y) * 0.15;
    }

    if (torchLight.current) {
      torchLight.current.intensity =
        2.1 + 0.55 * Math.sin(now * 11 + phase) + 0.3 * Math.sin(now * 23 + phase * 2);
    }
  });

  if (isTorch) {
    return (
      <group ref={group} onClick={onClick}>
        <mesh position-y={unit * 0.03}>
          <cylinderGeometry args={[r * 0.35, r * 0.45, unit * 0.06, 20]} />
          <meshLambertMaterial color="#2b2118" />
        </mesh>
        {isSelected && (
          <mesh rotation-x={-Math.PI / 2} position-y={unit * 0.1}>
            <ringGeometry args={[r * 0.8, r, 40]} />
            <meshBasicMaterial color="#7fd4ff" transparent opacity={0.95} depthWrite={false} />
          </mesh>
        )}
        <mesh position-y={unit * 0.5}>
          <sphereGeometry args={[unit * 0.09, 12, 12]} />
          <meshBasicMaterial color="#ffd27a" />
        </mesh>
        <mesh position-y={unit * 0.5}>
          <sphereGeometry args={[unit * 0.17, 12, 12]} />
          <meshBasicMaterial
            color="#ff8a35"
            transparent
            opacity={0.35}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <pointLight
          ref={torchLight}
          position-y={unit * 0.62}
          color="#ff9d45"
          distance={unit * 7.5}
          decay={1.4}
          intensity={2.1}
        />
      </group>
    );
  }

  return (
    <group ref={group} onClick={onClick}>
      {/* fake shadow */}
      <mesh rotation-x={-Math.PI / 2} position-y={unit * 0.02}>
        <circleGeometry args={[r * 1.18, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* base disc */}
      <mesh position-y={unit * 0.045}>
        <cylinderGeometry args={[r, r * 1.06, unit * 0.07, 40]} />
        <meshLambertMaterial color={defeated ? "#4a4a52" : baseColor} />
      </mesh>
      {/* selection ring */}
      {isSelected && (
        <mesh rotation-x={-Math.PI / 2} position-y={unit * 0.1}>
          <ringGeometry args={[r * 1.12, r * 1.3, 48]} />
          <meshBasicMaterial color="#7fd4ff" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
      {/* active-turn pulsing ring */}
      {isActive && (
        <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={unit * 0.09}>
          <ringGeometry args={[r * 1.34, r * 1.52, 48]} />
          <meshBasicMaterial color="#ffd76a" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
      {/* the standee body (inner group takes bob + defeat tip). The two
          variants carry distinct keys so React never reuses a material
          across the card/figure swap — reuse left the shader compiled
          without USE_MAP and the figure rendered flat white. */}
      <Billboard position={[0, unit * 0.09 + bodyH / 2, 0]}>
        <group ref={cardGroup}>
          {isFigure ? (
            <group key={`figure-${tex.uuid}`}>
              <mesh>
                <planeGeometry args={[bodyW, bodyH]} />
                <meshBasicMaterial
                  map={tex}
                  color={defeated ? "#666" : tint}
                  transparent
                  alphaTest={0.25}
                  opacity={defeated ? 0.55 : 1}
                />
              </mesh>
              {/* hit flash — additive, masked by the figure's own alpha */}
              <mesh position-z={unit * 0.015}>
                <planeGeometry args={[bodyW, bodyH]} />
                <meshBasicMaterial
                  ref={flashMat}
                  map={tex}
                  color="#ffffff"
                  transparent
                  opacity={0}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            </group>
          ) : (
            <group key="card">
              <mesh>
                <planeGeometry args={[cardW * 1.06, cardH * 1.06]} />
                <meshBasicMaterial color={defeated ? "#4a4a52" : baseColor} />
              </mesh>
              <mesh position-z={unit * 0.01}>
                <planeGeometry args={[cardW, cardH]} />
                {tex ? (
                  <meshBasicMaterial
                    key={`photo-${tex.uuid}`}
                    map={tex}
                    color={defeated ? "#666" : tint}
                    transparent
                    opacity={defeated ? 0.55 : 1}
                  />
                ) : (
                  <meshBasicMaterial
                    key="flat"
                    color={defeated ? "#3a3a42" : mixHex("#1c1c26", baseColor, 0.35)}
                  />
                )}
              </mesh>
              {/* hit flash overlay */}
              <mesh position-z={unit * 0.02}>
                <planeGeometry args={[cardW, cardH]} />
                <meshBasicMaterial ref={flashMat} color="#ffffff" transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          )}
          {!tex && (
            <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div
                style={{
                  fontFamily: "Cinzel, serif",
                  fontWeight: 700,
                  fontSize: 26,
                  color: defeated ? "#777" : baseColor,
                  textShadow: "0 1px 4px #000",
                }}
              >
                {(token.label || "?").slice(0, 1).toUpperCase()}
              </div>
            </Html>
          )}
        </group>
      </Billboard>
      {/* nameplate + HP bar */}
      <Html
        position={[0, unit * 0.09 + bodyH + unit * 0.28, 0]}
        center
        distanceFactor={unit * 11}
        zIndexRange={[30, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 120 }}>
          <div
            style={{
              background: "rgba(6,6,12,0.78)",
              border: `1px solid ${defeated ? "#4a4a52" : baseColor}`,
              borderRadius: 6,
              padding: "1px 8px",
              fontSize: 13,
              fontWeight: 600,
              color: defeated ? "#888" : "#f0ead8",
              whiteSpace: "nowrap",
              textDecoration: defeated ? "line-through" : "none",
            }}
          >
            {token.label}
          </div>
          {hpPct !== null && !defeated && (
            <div style={{ width: 86, height: 7, background: "rgba(0,0,0,0.7)", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.25)" }}>
              <div
                style={{
                  width: `${hpPct * 100}%`,
                  height: "100%",
                  background: hpPct > 0.5 ? "#5cb85c" : hpPct > 0.25 ? "#e0a83c" : "#d9534f",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          )}
          {floatingText && (
            <div className="board-dmg-float" key={floatingText}>
              {floatingText}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/** Unrevealed-area fog: a dark plate over the map with holes cut for
 * revealed regions and brush circles (player-safe by construction — the
 * projection only ever contains revealed geometry). */
function FogOverlay({
  mapW,
  mapH,
  unit,
  revealed,
  brushes,
  opacity,
}: {
  mapW: number;
  mapH: number;
  unit: number;
  revealed: number[][][];
  brushes: { x: number; y: number; r: number }[];
  opacity: number;
}) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(mapW, 0);
    shape.lineTo(mapW, mapH);
    shape.lineTo(0, mapH);
    shape.closePath();
    for (const poly of revealed) {
      if (!poly || poly.length < 3) continue;
      const hole = new THREE.Path();
      hole.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i += 1) hole.lineTo(poly[i][0], poly[i][1]);
      hole.closePath();
      shape.holes.push(hole);
    }
    for (const b of brushes) {
      const hole = new THREE.Path();
      hole.absarc(b.x, b.y, b.r, 0, Math.PI * 2, false);
      shape.holes.push(hole);
    }
    return new THREE.ShapeGeometry(shape);
  }, [mapW, mapH, revealed, brushes]);
  return (
    <mesh
      geometry={geom}
      rotation-x={Math.PI / 2}
      position={[-mapW / 2, unit * 0.048, -mapH / 2]}
      renderOrder={5}
    >
      <meshBasicMaterial
        color="#04040a"
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** One expanding "look here" ping ring. */
function PingRing({ x, z, unit }: { x: number; z: number; unit: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  useFrame((state) => {
    if (!mesh.current) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / 1.2);
    mesh.current.scale.setScalar(0.3 + t * 2.8);
    (mesh.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
  });
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[x, unit * 0.12, z]} renderOrder={6}>
      <ringGeometry args={[unit * 0.5, unit * 0.64, 48]} />
      <meshBasicMaterial color="#ffd76a" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

/** The r3f scene — atmosphere, slab, grid, standees. */
function BoardScene(props: Board3DProps) {
  const {
    map,
    tokens,
    combatantByRef,
    activeRef,
    gridKind,
    selectedId,
    attackArmed,
    strike,
    darkness,
    weather,
    cinema,
    followTurn,
    onSelect,
    onMoveCommit,
    onPickTarget,
    readOnly = false,
    defeatedRefs,
    pings,
    fogOn = false,
    revealedRegions,
    brushReveals,
    fogOpacity = 0.35,
  } = props;

  const defeatedSet = useMemo(() => new Set(defeatedRefs ?? []), [defeatedRefs]);

  const unit = unitFor(map);
  const fit = Math.max(map.width, map.height) * 1.05;
  const { tex, error } = useBoardTexture(map.image_url);
  const { tex: domeTex } = useBoardTexture(map.backdrop_url);
  const vignette = useMemo(() => getVignetteTexture(), []);
  const glideRef = useRef<GlideAnim | null>(null);
  const strikeRef = useRef<StrikeAnim | null>(null);

  useEffect(() => {
    if (strike && strikeRef.current?.seq !== strike.seq) {
      strikeRef.current = { ...strike, start: null };
    }
  }, [strike]);

  const gridPositions = useMemo(
    () => (gridKind === "off" ? null : buildGrid(map, unit, gridKind)),
    [map, unit, gridKind],
  );

  const strikeTargetToken = strike ? tokens.find((t) => t.id === strike.targetId) : undefined;

  const activeToken = useMemo(() => {
    if (!activeRef) return null;
    return tokens.find((t) => (t.ref_id ?? t.id) === activeRef) ?? null;
  }, [tokens, activeRef]);

  const handleGround = (e: ThreeEvent<MouseEvent>) => {
    if (readOnly || e.delta > 5) return;
    e.stopPropagation();
    if (!selectedId) return;
    const token = tokens.find((t) => t.id === selectedId);
    if (!token) return;
    const px = Math.max(0, Math.min(map.width, e.point.x + map.width / 2));
    const py = Math.max(0, Math.min(map.height, e.point.z + map.height / 2));
    const [sx, sy] = snapPoint(px, py, unit, gridKind);
    glideRef.current = {
      id: token.id,
      fromX: token.x,
      fromY: token.y,
      toX: sx,
      toY: sy,
      start: null,
      done: false,
    };
  };

  const handleTokenClick = (t: TableToken) => (e: ThreeEvent<MouseEvent>) => {
    if (readOnly || e.delta > 5) return;
    e.stopPropagation();
    if (selectedId && selectedId !== t.id) {
      const sel = tokens.find((x) => x.id === selectedId);
      if (sel && sel.kind !== "light" && t.kind !== "light" && (attackArmed || sel.kind !== t.kind)) {
        onPickTarget(selectedId, t.id);
        return;
      }
    }
    onSelect(selectedId === t.id ? null : t.id);
  };

  // Midday: bright daylight HAZE, far away — the void should read as sunny
  // air, not space. Night: dark fog, close. The dial is the day-night cycle.
  const fogColor = useMemo(
    () => mixHex("#8f96ad", "#07070d", darkness),
    [darkness],
  );

  return (
    <>
      <fog
        attach="fog"
        args={[fogColor, fit * (2.5 - 1.0 * darkness), fit * (4.8 - 1.4 * darkness)]}
      />
      <Exposure darkness={darkness} />
      <LightRig fit={fit} darkness={darkness} />
      {domeTex && <BackdropDome tex={domeTex} fit={fit} darkness={darkness} />}
      <CameraRig
        mapW={map.width}
        mapH={map.height}
        drift={cinema}
        follow={
          followTurn && activeToken
            ? { x: activeToken.x - map.width / 2, z: activeToken.y - map.height / 2, k: activeToken.id }
            : null
        }
      />

      {/* under-plane so orbiting never shows void. It wears the FOG COLOR
          exactly, so it vanishes into the haze — aerial perspective instead
          of a gray plate. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-unit * 0.56}>
        <planeGeometry args={[fit * 8, fit * 8]} />
        <meshBasicMaterial color={fogColor} />
      </mesh>
      {/* board slab */}
      <mesh position-y={-unit * 0.26}>
        <boxGeometry args={[map.width + unit * 0.35, unit * 0.5, map.height + unit * 0.35]} />
        <meshLambertMaterial color="#191527" />
      </mesh>
      {/* the map itself (material keyed on the texture — see Standee note) */}
      <mesh
        rotation-x={-Math.PI / 2}
        onClick={handleGround}
        onContextMenu={(e) => {
          e.stopPropagation();
          onSelect(null);
        }}
      >
        <planeGeometry args={[map.width, map.height]} />
        <meshLambertMaterial
          key={tex ? `map-${tex.uuid}` : "map-flat"}
          map={tex ?? undefined}
          color={tex ? "#ffffff" : error ? "#2a2433" : "#111119"}
        />
      </mesh>
      {/* edge fade — mostly a night effect; barely-there at fey midday */}
      <mesh rotation-x={-Math.PI / 2} position-y={unit * 0.055} renderOrder={4}>
        <planeGeometry args={[map.width * 1.6, map.height * 1.6]} />
        <meshBasicMaterial
          map={vignette}
          transparent
          opacity={0.12 + 0.88 * darkness}
          depthWrite={false}
        />
      </mesh>
      {gridPositions && gridPositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[gridPositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.14 * (1 - darkness * 0.6)}
            depthWrite={false}
          />
        </lineSegments>
      )}
      {fogOn && (
        <FogOverlay
          mapW={map.width}
          mapH={map.height}
          unit={unit}
          revealed={revealedRegions ?? []}
          brushes={brushReveals ?? []}
          opacity={fogOpacity}
        />
      )}
      {(pings ?? []).map((p) => (
        <PingRing key={p.id} x={p.x - map.width / 2} z={p.y - map.height / 2} unit={unit} />
      ))}
      <Weather kind={weather} mapW={map.width} mapH={map.height} unit={unit} />
      {error && (
        <Html center position={[0, unit, 0]}>
          <div style={{ color: "#e0a83c", background: "rgba(0,0,0,0.7)", padding: "6px 12px", borderRadius: 8, fontSize: 13, whiteSpace: "nowrap" }}>
            Map image failed to load (CORS?) — board still works.
          </div>
        </Html>
      )}
      {tokens.map((t) => {
        const combatant = (t.ref_id && combatantByRef.get(t.ref_id)) || null;
        const ref = t.ref_id ?? t.id;
        const showDamage =
          strike && strike.targetId === t.id
            ? strike.amount === "miss"
              ? "miss"
              : `−${strike.amount}`
            : null;
        return (
          <Standee
            key={t.id}
            token={t}
            combatant={combatant}
            defeated={combatant?.defeated ?? defeatedSet.has(ref)}
            unit={unit}
            mapW={map.width}
            mapH={map.height}
            darkness={darkness}
            isSelected={selectedId === t.id}
            isActive={activeRef !== null && ref === activeRef}
            glideRef={glideRef}
            strikeRef={strikeRef}
            strikeTarget={
              strike && strike.attackerId === t.id && strikeTargetToken
                ? { x: strikeTargetToken.x, y: strikeTargetToken.y }
                : null
            }
            floatingText={showDamage}
            onMoveCommit={onMoveCommit}
            onClick={handleTokenClick(t)}
          />
        );
      })}
      {cinema && (
        <EffectComposer>
          <DepthOfField focusDistance={0.12} focalLength={0.08} bokehScale={2.2} />
          <Vignette eskil={false} offset={0.18} darkness={0.7} />
        </EffectComposer>
      )}
    </>
  );
}

/** Public component: the Canvas wrapper (keeps three types out of the page). */
export default function Board3D(props: Board3DProps) {
  const fit = Math.max(props.map.width, props.map.height) * 1.05;
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 45, near: Math.max(1, fit * 0.004), far: fit * 6, position: [0, fit * 0.6, fit * 0.7] }}
      style={{ background: "#06060b" }}
    >
      <BoardScene {...props} />
    </Canvas>
  );
}
