import { Html, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

/**
 * A character who walks to the cell it is told (Plan 108; instanced for a
 * whole table in Plan 109).
 *
 * The placeholder is three.js's Soldier — real proportions, Idle/Walk clips —
 * loaded from a CDN; the party's own models come in Milestone 3. Each figure
 * gets its own cloned skeleton so many can animate at once. The rule every
 * model will obey: a move is a *walk* — a turn to face the way, a walk cycle
 * while under way, a settle into idle on arrival.
 *
 * Under the feet: a ring in the side's colour, brighter and breathing when it
 * is this figure's turn, grey when it is down. Over the head: the name.
 */
const SOLDIER = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Soldier.glb";
/** One unit is five feet; a six-foot human is 1.2 units. The model is ~1.8 tall. */
const SCALE = 0.66;
const SPEED = 1.5; // units per second — a brisk walk
/** The Soldier faces -Z; flip the yaw so it walks forward, not backward. */
const FACING = Math.PI;

export function Walker({
  cell,
  tint = "#d6af36",
  active = false,
  down = false,
  size = 1,
  label,
  hit,
}: {
  /** Where this figure should be. Changing it makes the figure walk there. */
  cell: THREE.Vector3;
  tint?: string;
  active?: boolean;
  down?: boolean;
  /** In grid squares — a Large creature is 2. */
  size?: number;
  label?: string;
  /** Changes when this figure takes damage; it flinches. */
  hit?: string;
}) {
  const flinch = useRef<{ t: number } | null>(null);
  const lastHit = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (hit && hit !== lastHit.current) {
      lastHit.current = hit;
      flinch.current = { t: 0 };
    }
  }, [hit]);
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const { scene, animations } = useGLTF(SOLDIER);
  const body = useMemo(() => {
    const c = cloneSkeleton(scene);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  const { actions } = useAnimations(animations, group);
  const walking = useRef(false);
  const pos = useRef(new THREE.Vector3(cell.x, 0, cell.z));
  const yaw = useRef(0);

  useEffect(() => {
    actions.Idle?.reset().play();
  }, [actions]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const p = pos.current;
    const dx = cell.x - p.x;
    const dz = cell.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.08 && !down) {
      if (!walking.current) {
        walking.current = true;
        actions.Idle?.fadeOut(0.2);
        actions.Walk?.reset().fadeIn(0.2).play();
      }
      const step = Math.min(dist, SPEED * dt);
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
      const want = Math.atan2(dx, dz) + FACING;
      let d = want - yaw.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw.current += d * Math.min(1, dt * 10);
    } else if (walking.current) {
      walking.current = false;
      actions.Walk?.fadeOut(0.25);
      actions.Idle?.reset().fadeIn(0.25).play();
    }
    g.position.copy(p);
    g.rotation.y = yaw.current;
    // The flinch: a short, sharp recoil and a stagger back to standing.
    const f = flinch.current;
    if (f) {
      f.t += dt;
      const k = Math.min(1, f.t / 0.38);
      const punch = Math.sin(k * Math.PI);
      g.position.y = -0.04 * punch;
      g.rotation.x = -0.18 * punch;
      if (k >= 1) {
        flinch.current = null;
        g.rotation.x = 0;
        g.position.y = 0;
      }
    }
    if (ring.current && active) {
      const t = performance.now() / 1000;
      ring.current.scale.setScalar(1 + 0.08 * Math.sin(t * 4));
    }
  });

  const ringColor = down ? "#5a5a60" : tint;
  const glow = active ? 3.2 : down ? 0.6 : 1.4;
  const c = new THREE.Color(ringColor).multiplyScalar(glow);
  const scale = SCALE * (size > 1 ? 1 + (size - 1) * 0.5 : 1);
  return (
    <group ref={group}>
      <group scale={scale} rotation={[down ? -Math.PI / 2 : 0, 0, 0]} position={[0, down ? 0.12 : 0, 0]}>
        <primitive object={body} />
      </group>
      <mesh ref={ring} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36 * size, 0.46 * size, 32]} />
        <meshBasicMaterial color={c} toneMapped={false} transparent opacity={active ? 0.95 : 0.7} />
      </mesh>
      {label && (
        <Html position={[0, 1.55 * scale + 0.35, 0]} center distanceFactor={7} style={{ pointerEvents: "none" }}>
          <div
            style={{
              font: "600 12px system-ui, sans-serif",
              color: down ? "#9a95a3" : "#f0e6c8",
              background: "rgba(10,8,16,0.72)",
              border: `1px solid ${active ? tint : "rgba(255,255,255,0.14)"}`,
              borderRadius: 8,
              padding: "3px 8px",
              whiteSpace: "nowrap",
              textDecoration: down ? "line-through" : "none",
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

useGLTF.preload(SOLDIER);
