import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { MapDef } from "./maps";

/**
 * The DM's weather, in the air over the whole map (Plan 110).
 *
 * The presets are the table's own — none, embers, fireflies, rain, snow, dust
 * (Plan 46) — so the engine matches what the HUD set rather than inventing
 * its own. Embers, fireflies and dust are drifting sparks; rain and snow are
 * a cloud of points that fall and wrap.
 */
/** A deterministic scatter, so a re-render never reshuffles the sky. */
const scatter = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Falling({ map, kind }: { map: MapDef; kind: "rain" | "snow" }) {
  const count = kind === "rain" ? 2400 : 1400;
  const top = 9;
  const geom = useRef<THREE.BufferGeometry>(null);
  const seeds = useMemo(() => Float32Array.from({ length: count }, (_, i) => scatter(i, 7)), [count]);
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (scatter(i, 1) - 0.5) * map.w;
      a[i * 3 + 1] = scatter(i, 2) * top;
      a[i * 3 + 2] = (scatter(i, 3) - 0.5) * map.h;
    }
    return a;
  }, [count, map.w, map.h]);
  useFrame((state, dt) => {
    const attr = geom.current?.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    const d = Math.min(dt, 0.05);
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      let y = arr[i * 3 + 1];
      let x = arr[i * 3];
      if (kind === "rain") y -= d * (11 + s * 6);
      else {
        y -= d * (0.9 + s * 0.9);
        x += Math.sin(t * 0.8 + s * 20) * d * 0.5;
      }
      if (y < 0) y = top;
      if (x > map.w / 2) x = -map.w / 2;
      if (x < -map.w / 2) x = map.w / 2;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
    }
    attr.needsUpdate = true;
  });
  return (
    <points>
      <bufferGeometry ref={geom}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={kind === "rain" ? "#9fb3c8" : "#e8eef8"}
        size={kind === "rain" ? 0.05 : 0.09}
        transparent
        opacity={kind === "rain" ? 0.55 : 0.85}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

export function Weather({ map, kind }: { map: MapDef; kind: string | null | undefined }) {
  if (!kind || kind === "none") return null;
  if (kind === "rain" || kind === "snow") return <Falling map={map} kind={kind} />;
  if (kind === "embers")
    return <Sparkles count={160} scale={[map.w, 3, map.h]} position={[0, 1.5, 0]} size={2.4} speed={0.6} color="#ff8a3c" opacity={0.85} noise={1.2} />;
  if (kind === "fireflies")
    return <Sparkles count={160} scale={[map.w, 2.2, map.h]} position={[0, 1.1, 0]} size={4.5} speed={0.35} color="#d4ffa8" opacity={1} noise={0.8} />;
  if (kind === "dust")
    return <Sparkles count={400} scale={[map.w, 3, map.h]} position={[0, 1.5, 0]} size={1.2} speed={0.12} color="#d9cfb6" opacity={0.35} noise={0.3} />;
  return null;
}
