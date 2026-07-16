import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { getHorizonTexture, type WeatherKind } from "./boardTheme";

/**
 * atmosphere — the immersion layer for the 3D board (Plan 45 Tier 1+2).
 *
 * Lighting rig (the darkness dial becomes actual light), weather particle
 * systems, and the AI-backdrop skybox dome. All animation mutates refs inside
 * useFrame; particle layouts use a seeded PRNG so render stays pure
 * (react-compiler rules). Non-component shared values live in boardTheme.ts.
 */

/** Deterministic PRNG — render-safe (no Math.random in render). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Lighting ─────────────────────────────────────────────────────────────────

// Day is FEY MIDDAY — bright, silver-warm, a world lit from everywhere.
const DAY_AMBIENT = new THREE.Color("#fff8ea");
const NIGHT_AMBIENT = new THREE.Color("#39466f");
const DAY_KEY = new THREE.Color("#fff3d6");
const NIGHT_KEY = new THREE.Color("#8fa3ff");

/** Ambient + key light whose color/intensity follow the darkness dial. */
export function LightRig({ fit, darkness }: { fit: number; darkness: number }) {
  const ambient = useMemo(
    () => DAY_AMBIENT.clone().lerp(NIGHT_AMBIENT, darkness),
    [darkness],
  );
  const key = useMemo(() => DAY_KEY.clone().lerp(NIGHT_KEY, darkness), [darkness]);
  return (
    <>
      {/* Floors keep the map readable even at full darkness — the dial sets
          mood, not blindness. Day (darkness 0) is genuinely bright. */}
      <ambientLight color={ambient} intensity={1.2 - 0.78 * darkness} />
      <directionalLight
        color={key}
        intensity={1.45 - 1.02 * darkness}
        position={[fit * 0.25, fit * 0.7, fit * 0.3]}
      />
    </>
  );
}

// ── Weather ──────────────────────────────────────────────────────────────────

interface WeatherCfg {
  count: number;
  color: string;
  size: number; // in units
  opacity: number;
  additive: boolean;
}

const WEATHER_CFG: Record<Exclude<WeatherKind, "none">, WeatherCfg> = {
  embers: { count: 350, color: "#ff9a45", size: 0.055, opacity: 0.9, additive: true },
  fireflies: { count: 220, color: "#d8f27a", size: 0.07, opacity: 0.85, additive: true },
  rain: { count: 1300, color: "#9fb6d8", size: 0.03, opacity: 0.5, additive: false },
  snow: { count: 750, color: "#eef2ff", size: 0.05, opacity: 0.8, additive: false },
  dust: { count: 420, color: "#cbb98a", size: 0.035, opacity: 0.35, additive: true },
};

interface WeatherProps {
  kind: WeatherKind;
  mapW: number;
  mapH: number;
  unit: number;
}

/** One instanced Points system per weather preset, animated in useFrame. */
export function Weather({ kind, mapW, mapH, unit }: WeatherProps) {
  const cfg = kind === "none" ? null : WEATHER_CFG[kind];
  const count = cfg?.count ?? 0;
  const hRange = unit * 10;
  const spanX = mapW * 1.35;
  const spanZ = mapH * 1.35;

  const { positions, seeds } = useMemo(() => {
    const rnd = mulberry32(1337);
    const pos = new Float32Array(count * 3);
    const sd = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (rnd() - 0.5) * spanX;
      pos[i * 3 + 1] = rnd() * hRange;
      pos[i * 3 + 2] = (rnd() - 0.5) * spanZ;
      sd[i] = rnd();
    }
    return { positions: pos, seeds: sd };
  }, [count, spanX, spanZ, hRange]);

  const geom = useRef<THREE.BufferGeometry>(null);
  const mat = useRef<THREE.PointsMaterial>(null);

  useFrame((state, dt) => {
    if (!cfg || kind === "none") return;
    const attr = geom.current?.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    const t = state.clock.elapsedTime;
    const d = Math.min(dt, 0.05);
    for (let i = 0; i < count; i += 1) {
      const s = seeds[i];
      let x = arr[i * 3];
      let y = arr[i * 3 + 1];
      let z = arr[i * 3 + 2];
      if (kind === "rain") {
        y -= d * unit * (13 + s * 7);
      } else if (kind === "snow") {
        y -= d * unit * (1.1 + s * 1.2);
        x += Math.sin(t * 0.8 + s * 20) * d * unit * 0.7;
      } else if (kind === "embers") {
        y += d * unit * (0.7 + s * 1.5);
        x += Math.sin(t * 1.3 + s * 30) * d * unit * 0.5;
      } else if (kind === "fireflies") {
        x += Math.sin(t * 0.5 + s * 40) * d * unit * 0.9;
        z += Math.cos(t * 0.4 + s * 25) * d * unit * 0.9;
        y += Math.sin(t * 0.9 + s * 15) * d * unit * 0.35;
        y = Math.min(Math.max(y, unit * 0.2), hRange * 0.4);
      } else {
        x += d * unit * 0.18;
        y += Math.sin(t * 0.3 + s * 10) * d * unit * 0.06;
      }
      if (y < 0) y = kind === "embers" ? 0 : hRange;
      if (y > hRange) y = kind === "embers" ? 0 : hRange;
      if (x > spanX / 2) x = -spanX / 2;
      if (x < -spanX / 2) x = spanX / 2;
      if (z > spanZ / 2) z = -spanZ / 2;
      if (z < -spanZ / 2) z = spanZ / 2;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;
    if (mat.current && kind === "fireflies") {
      mat.current.opacity = 0.5 + 0.35 * Math.sin(t * 2.1);
    }
  });

  if (!cfg || kind === "none") return null;
  return (
    <points key={`${kind}-${count}`} frustumCulled={false}>
      <bufferGeometry ref={geom}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={mat}
        color={cfg.color}
        size={cfg.size * unit}
        transparent
        opacity={cfg.opacity}
        depthWrite={false}
        sizeAttenuation
        blending={cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  );
}

// ── Backdrop dome (Tier 2) ───────────────────────────────────────────────────

interface DomeProps {
  tex: THREE.Texture;
  fit: number;
  darkness: number;
}

/** Inverted sphere carrying the AI-generated panorama; fog-immune.
 *
 * The dome is kept dimmer than the board (the board is the star) and a
 * horizon gradient band blends its base into the dark under-world so the
 * seam between sky and table disappears.
 */
export function BackdropDome({ tex, fit, darkness }: DomeProps) {
  // Full brightness at midday (it's the sky); heavy dim at night so the
  // torch-lit board stays the star.
  const tint = useMemo(
    () => new THREE.Color("#f4f4f9").lerp(new THREE.Color("#232a45"), darkness * 0.9),
    [darkness],
  );
  const horizon = useMemo(() => getHorizonTexture(), []);
  return (
    <group>
      <mesh scale={[-1, 1, 1]} rotation-y={Math.PI}>
        <sphereGeometry args={[fit * 2.55, 48, 32]} />
        <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} color={tint} />
      </mesh>
      <mesh position-y={fit * 0.1}>
        <cylinderGeometry args={[fit * 2.45, fit * 2.45, fit * 0.6, 48, 1, true]} />
        <meshBasicMaterial
          map={horizon}
          side={THREE.BackSide}
          transparent
          fog={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
