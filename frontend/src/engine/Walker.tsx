import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useFigure } from "./figureModel";
import { DEFAULT_HEIGHT_FT } from "./heights";

/**
 * A character who walks to the cell it is told (Plan 108; instanced for a
 * whole table in Plan 109; any model in Plan 111).
 *
 * The rule every model obeys: a move is a *walk* — a turn to face the way, a
 * walk cycle while under way (a run, when it is far), a settle into idle on
 * arrival. A hit is a stagger — the rig's hit clip when it has one, a recoil
 * when it has not. Going down is a fall — the death clip, or a topple. The
 * model is whatever the token carries; the Soldier when it carries nothing.
 *
 * Under the feet: a ring in the side's colour, brighter and breathing when it
 * is this figure's turn, grey when it is down. Over the head: the name.
 */
export interface FigureModel {
  url: string | null;
  /** How tall the figure stands, in feet; the model is scaled to it. */
  heightFt?: number | null;
}

const WALK = 1.5; // units per second — a brisk walk
const RUN = 3.4;
const RUN_FROM = 3.5; // cells: farther than this, and the figure runs if it can
const TOPPLE_S = 0.55;

type Mode = "idle" | "walk" | "run" | "hit" | "death";

export function Walker({
  cell,
  tint = "#d6af36",
  active = false,
  down = false,
  size = 1,
  label,
  hit,
  model = null,
}: {
  /** Where this figure should be. Changing it makes the figure walk there. */
  cell: THREE.Vector3;
  tint?: string;
  active?: boolean;
  down?: boolean;
  /** In grid squares — a Large creature is 2. Sets the ring, not the height. */
  size?: number;
  label?: string;
  /** Changes when this figure takes damage; it flinches. */
  hit?: string;
  model?: FigureModel | null;
}) {
  const fig = useFigure(model?.url ?? null, model?.heightFt ?? DEFAULT_HEIGHT_FT);
  const group = useRef<THREE.Group>(null);
  const pose = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  // The mixer drives the cloned body; its actions live in a ref so the
  // one-shot settings (loop, clamp, time) can be written as they change.
  const mixer = useMemo(() => new THREE.AnimationMixer(fig.body), [fig.body]);
  const actions = useRef<Partial<Record<Mode, THREE.AnimationAction>>>({});

  const mode = useRef<Mode>("idle");
  const current = useRef<THREE.AnimationAction | null>(null);
  const pos = useRef(new THREE.Vector3(cell.x, 0, cell.z));
  const yaw = useRef(0);
  const flinch = useRef<{ t: number } | null>(null);
  const lastHit = useRef<string | undefined>(undefined);
  /** 0 standing, 1 on the floor — the topple, when there is no death clip. */
  const fallen = useRef(down ? 1 : 0);
  const firstDown = useRef(down);

  /** Crossfade to a clip; a one-shot clip holds its last frame when `clamp`. Reads only refs, so it is stable. */
  const play = useCallback((name: Mode, fade = 0.2, once = false, clamp = false, fromEnd = false) => {
    const next = actions.current[name];
    if (!next) return false;
    if (current.current && current.current !== next) current.current.fadeOut(fade);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = clamp;
    next.fadeIn(fade).play();
    if (fromEnd) next.time = next.getClip().duration;
    current.current = next;
    mode.current = name;
    return true;
  }, []);

  // The rig arrived (or changed): build its actions; stand idle, or lie where it fell.
  useEffect(() => {
    const built: Partial<Record<Mode, THREE.AnimationAction>> = {};
    for (const clip of fig.clips) built[clip.name as Mode] = mixer.clipAction(clip);
    actions.current = built;
    current.current = null;
    if (down && built.death) play("death", 0, true, true, firstDown.current);
    else play("idle", 0);
    firstDown.current = false;
    return () => {
      mixer.stopAllAction();
      for (const clip of fig.clips) mixer.uncacheClip(clip);
      actions.current = {};
    };
  }, [mixer, fig.clips, down, play]);

  // A hit clip plays once and returns to standing.
  useEffect(() => {
    const onDone = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== actions.current.hit || mode.current !== "hit") return;
      play("idle", 0.2);
    };
    mixer.addEventListener("finished", onDone);
    return () => mixer.removeEventListener("finished", onDone);
  }, [mixer, play]);

  useEffect(() => {
    if (hit && hit !== lastHit.current) {
      lastHit.current = hit;
      if (!down && actions.current.hit) play("hit", 0.08, true);
      else flinch.current = { t: 0 };
    }
  }, [hit, down, play]);

  useFrame((_, dt) => {
    mixer.update(dt);
    const g = group.current;
    const p = pos.current;
    if (!g) return;
    const dx = cell.x - p.x;
    const dz = cell.z - p.z;
    const dist = Math.hypot(dx, dz);
    const moving = mode.current === "walk" || mode.current === "run";
    if (dist > 0.08 && !down) {
      if (!moving && mode.current !== "hit") {
        if (!(dist > RUN_FROM && play("run", 0.2))) play("walk", 0.2);
      }
      const speed = mode.current === "run" ? RUN : WALK;
      const step = Math.min(dist, speed * dt);
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
      const want = Math.atan2(dx, dz);
      let d = want - yaw.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw.current += d * Math.min(1, dt * 10);
    } else if (moving) {
      play("idle", 0.25);
    }
    g.position.copy(p);
    g.rotation.y = yaw.current - fig.forwardYaw;

    // The topple and the rise, when the rig has no death clip.
    const wantFall = down && !actions.current.death ? 1 : 0;
    if (fallen.current !== wantFall) {
      const k = Math.min(1, dt / TOPPLE_S);
      fallen.current += Math.sign(wantFall - fallen.current) * k;
      fallen.current = Math.min(1, Math.max(0, fallen.current));
    }
    const f = fallen.current;
    const ease = f * f * (3 - 2 * f);
    if (pose.current) {
      pose.current.rotation.x = (-Math.PI / 2) * ease;
      pose.current.position.y = 0.12 * ease;
    }
    // The recoil: a short, sharp lean back and a stagger to standing.
    const fl = flinch.current;
    if (fl) {
      fl.t += dt;
      const k = Math.min(1, fl.t / 0.38);
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
  return (
    <group ref={group}>
      <group ref={pose}>
        <group scale={fig.scale} position={[0, fig.lift, 0]}>
          <primitive object={fig.body} />
        </group>
      </group>
      <mesh ref={ring} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36 * size, 0.46 * size, 32]} />
        <meshBasicMaterial color={c} toneMapped={false} transparent opacity={active ? 0.95 : 0.7} />
      </mesh>
      {label && (
        <Html position={[0, fig.height + 0.32, 0]} center distanceFactor={7} style={{ pointerEvents: "none" }}>
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
