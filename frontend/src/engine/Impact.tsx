import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { LIFE, type Mark, type MarkKind } from "./impactMarks";

/**
 * What a blow leaves behind (Plan 113, the Tuesday push): blood on the boards
 * where a blade landed, a scorch where fire did, frost, acid, rot; a spray of
 * it at the moment of impact; and a pool that spreads under whoever went
 * down. Every mark is painted on the spot from a canvas — no files — and
 * fades on its own clock, so a long fight leaves the floor telling its story
 * without ever filling it. The marks themselves live in impactMarks.ts.
 */
const RGB: Record<string, [number, number, number]> = {
  blood: [96, 4, 9],
  acid: [96, 205, 40],
  rot: [64, 18, 84],
  pool: [92, 4, 10],
};
const cache = new Map<string, THREE.CanvasTexture>();

function splatTexture(kind: MarkKind, seed: number): THREE.CanvasTexture {
  const key = `${kind}:${seed}`;
  const had = cache.get(key);
  if (had) return had;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const cx = size / 2;
  const cy = size / 2;
  const disc = (x: number, y: number, r: number, rgb: [number, number, number], a: number, soft = 0.25) => {
    const g = ctx.createRadialGradient(x, y, r * soft, x, y, r);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  if (kind === "blood" || kind === "acid" || kind === "rot") {
    const rgb = RGB[kind];
    // A main splash, satellites thrown one way, and a scatter of drops.
    const throwAng = rnd() * Math.PI * 2;
    disc(cx, cy, size * 0.17, rgb, 0.92, 0.45);
    const blobs = 12 + Math.floor(rnd() * 8);
    for (let i = 0; i < blobs; i++) {
      const ang = throwAng + (rnd() - 0.5) * 1.6;
      const d = size * (0.08 + rnd() * 0.34);
      disc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, size * (0.025 + rnd() * 0.07), rgb, 0.55 + rnd() * 0.4, 0.4);
    }
    for (let i = 0; i < 46; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = size * (0.12 + rnd() * 0.36);
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.55 + rnd() * 0.45})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, 1 + rnd() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "pool") {
    const rgb = RGB.pool;
    disc(cx, cy, size * 0.46, rgb, 0.96, 0.55);
    for (let i = 0; i < 9; i++) {
      const ang = rnd() * Math.PI * 2;
      disc(cx + Math.cos(ang) * size * 0.3, cy + Math.sin(ang) * size * 0.3, size * (0.08 + rnd() * 0.1), rgb, 0.9, 0.5);
    }
  } else if (kind === "scorch") {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.46);
    g.addColorStop(0, "rgba(8,5,3,0.94)");
    g.addColorStop(0.45, "rgba(18,10,6,0.7)");
    g.addColorStop(0.8, "rgba(40,20,9,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // A ragged rim, then embers that will still glow.
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 16; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = size * (0.32 + rnd() * 0.18);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, size * (0.04 + rnd() * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < 26; i++) {
      const ang = rnd() * Math.PI * 2;
      const d = size * (0.06 + rnd() * 0.3);
      ctx.fillStyle = `rgba(255,${110 + Math.floor(rnd() * 90)},30,${0.5 + rnd() * 0.5})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, 1 + rnd() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "frost") {
    ctx.strokeStyle = "rgba(205,236,255,0.9)";
    ctx.lineWidth = 3;
    const arms = 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < arms; i++) {
      const ang = (i / arms) * Math.PI * 2 + rnd() * 0.4;
      const len = size * (0.24 + rnd() * 0.2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      ctx.stroke();
      for (let j = 1; j < 4; j++) {
        const t = j / 4;
        const bx = cx + Math.cos(ang) * len * t;
        const by = cy + Math.sin(ang) * len * t;
        const bl = len * 0.2 * (1 - t);
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ang + sgn * 0.9) * bl, by + Math.sin(ang + sgn * 0.9) * bl);
          ctx.stroke();
        }
      }
    }
    disc(cx, cy, size * 0.42, [190, 228, 255], 0.5, 0.05);
  } else {
    // glow: a soft golden ring, the mark of radiant light
    const g = ctx.createRadialGradient(cx, cy, size * 0.18, cx, cy, size * 0.46);
    g.addColorStop(0, "rgba(255,236,170,0)");
    g.addColorStop(0.65, "rgba(255,236,170,0.55)");
    g.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** How wet, dull or bright a kind of mark is. */
const SURFACE: Record<MarkKind, { roughness: number; emissive?: string; additive?: boolean }> = {
  blood: { roughness: 0.28 },
  pool: { roughness: 0.18 },
  acid: { roughness: 0.3, emissive: "#1f4a0a" },
  rot: { roughness: 0.6 },
  scorch: { roughness: 0.95 },
  frost: { roughness: 0.2, emissive: "#0a1a26" },
  glow: { roughness: 1, additive: true },
};

/** A mark on the floor. It arrives with the blow, spreads a little, and fades at the end of its life. */
function Splatter({ mark }: { mark: Mark }) {
  const tex = useMemo(() => splatTexture(mark.kind, mark.seed), [mark.kind, mark.seed]);
  const mesh = useRef<THREE.Mesh>(null);
  const sf = SURFACE[mark.kind];
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const age = (performance.now() - mark.t0) / 1000;
    const life = LIFE[mark.kind];
    m.visible = age >= 0 && age < life;
    if (!m.visible) return;
    const fadeIn = Math.min(1, age / (mark.kind === "pool" ? 1.2 : 0.1));
    const fadeOut = age > life - 15 ? Math.max(0, (life - age) / 15) : 1;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.opacity = (mark.kind === "glow" ? 0.75 : 0.96) * fadeIn * fadeOut;
    let grow = 1;
    if (mark.kind === "pool") {
      // Blood spreads for eight seconds, then stops.
      const k = Math.min(1, age / 8);
      grow = 0.35 + 0.65 * (1 - (1 - k) * (1 - k));
    } else if (mark.kind === "blood" || mark.kind === "acid") grow = 0.8 + 0.2 * Math.min(1, age / 0.5);
    m.scale.setScalar(mark.size * grow);
  });
  return (
    <mesh ref={mesh} position={[mark.at.x, 0.02 + mark.lift, mark.at.z]} rotation={[-Math.PI / 2, 0, mark.yaw]} renderOrder={1} visible={false}>
      <planeGeometry args={[1, 1]} />
      {sf.additive ? (
        <meshBasicMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      ) : (
        <meshStandardMaterial
          map={tex}
          transparent
          depthWrite={false}
          roughness={sf.roughness}
          metalness={0}
          emissive={sf.emissive ?? "#000000"}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      )}
    </mesh>
  );
}

const SPRAY: Record<Exclude<MarkKind, "pool">, { color: string; size: number; additive: boolean; count: number; gravity: number }> = {
  blood: { color: "#6e0810", size: 0.065, additive: false, count: 36, gravity: 9.5 },
  scorch: { color: "#ffb347", size: 0.05, additive: true, count: 30, gravity: 6 },
  frost: { color: "#d6f0ff", size: 0.05, additive: true, count: 26, gravity: 7 },
  acid: { color: "#9dff3d", size: 0.06, additive: false, count: 30, gravity: 8 },
  rot: { color: "#8a3ac0", size: 0.06, additive: true, count: 22, gravity: 3 },
  glow: { color: "#ffe9a3", size: 0.05, additive: true, count: 22, gravity: 1.5 },
};

/** A deterministic scatter, so a re-render never reshuffles a spray in flight. */
const scatter = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** The spray at the moment of impact: it flies on past the target, falls, and stays where it lands for a breath. */
function Spray({ mark }: { mark: Mark }) {
  const spec = SPRAY[mark.kind as Exclude<MarkKind, "pool">] ?? SPRAY.blood;
  const n = spec.count;
  const points = useRef<THREE.Points>(null);
  const geom = useRef<THREE.BufferGeometry>(null);
  // Where each drop starts and how it flies — decided once, from the mark's seed.
  const start = useMemo(() => {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const sx = -mark.dir.z;
    const sz = mark.dir.x;
    for (let i = 0; i < n; i++) {
      const spread = (scatter(i, mark.seed + 1) - 0.5) * 1.6;
      const speed = 0.9 + scatter(i, mark.seed + 2) * 2.4;
      const up = 0.6 + scatter(i, mark.seed + 3) * 2.4;
      vel[i * 3] = (mark.dir.x * Math.cos(spread) + sx * Math.sin(spread)) * speed;
      vel[i * 3 + 1] = up;
      vel[i * 3 + 2] = (mark.dir.z * Math.cos(spread) + sz * Math.sin(spread)) * speed;
      pos[i * 3] = mark.at.x - mark.dir.x * 0.3 + (scatter(i, mark.seed + 4) - 0.5) * 0.1;
      pos[i * 3 + 1] = mark.hitY + (scatter(i, mark.seed + 5) - 0.5) * 0.25;
      pos[i * 3 + 2] = mark.at.z - mark.dir.z * 0.3 + (scatter(i, mark.seed + 6) - 0.5) * 0.1;
    }
    return { pos, vel };
  }, [mark, n]);
  const sim = useRef<{ vel: Float32Array; landed: Uint8Array; last: number } | null>(null);
  useFrame(() => {
    const p = points.current;
    const attr = geom.current?.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!p || !attr) return;
    const now = performance.now();
    const age = (now - mark.t0) / 1000;
    p.visible = age >= 0 && age < 2.2;
    if (!p.visible) return;
    if (!sim.current) sim.current = { vel: Float32Array.from(start.vel), landed: new Uint8Array(n), last: now };
    const s = sim.current;
    const dt = Math.min(0.05, (now - s.last) / 1000);
    s.last = now;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < n; i++) {
      if (s.landed[i]) continue;
      s.vel[i * 3 + 1] -= spec.gravity * dt;
      arr[i * 3] += s.vel[i * 3] * dt;
      arr[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
      arr[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
      if (arr[i * 3 + 1] <= 0.03) {
        arr[i * 3 + 1] = 0.03;
        s.landed[i] = 1;
      }
    }
    attr.needsUpdate = true;
    (p.material as THREE.PointsMaterial).opacity = age < 1.4 ? 1 : Math.max(0, (2.2 - age) / 0.8);
  });
  return (
    <points ref={points} frustumCulled={false} visible={false} renderOrder={3}>
      <bufferGeometry ref={geom}>
        <bufferAttribute attach="attributes-position" args={[start.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={spec.color}
        size={spec.size}
        sizeAttenuation
        transparent
        depthWrite={false}
        blending={spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending}
        toneMapped={!spec.additive}
      />
    </points>
  );
}

/** Everything on the floor and in the air, for the party to mount once. Each spray hides itself once it has fallen. */
export function Marks({ marks }: { marks: Mark[] }) {
  return (
    <group>
      {marks.map((m) => (
        <Splatter key={m.id} mark={m} />
      ))}
      {marks
        .filter((m) => m.kind !== "pool")
        .map((m) => (
          <Spray key={`s${m.id}`} mark={m} />
        ))}
    </group>
  );
}
