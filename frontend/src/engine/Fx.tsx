import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Combat cinema, in the room (Plan 110): the DM's ping ripples on the floor
 * where they clicked; damage and healing float up from the figure that took
 * it; a scene title lands when the DM sets one. All of it is transient — the
 * page owns the list and drops each one when it has played.
 */

/** A ring that spreads from a point and fades, for a DM ping. */
export function Ping({ at, onDone }: { at: THREE.Vector3; onDone: () => void }) {
  const ring = useRef<THREE.Mesh>(null);
  const t0 = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = clock.elapsedTime - t0.current;
    const k = Math.min(1, t / 1.6);
    if (ring.current) {
      ring.current.scale.setScalar(0.4 + k * 2.6);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    }
    if (k >= 1) onDone();
  });
  return (
    <mesh ref={ring} position={[at.x, 0.04, at.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.42, 0.5, 40]} />
      <meshBasicMaterial color={[2.6, 2.2, 1.0]} toneMapped={false} transparent depthWrite={false} />
    </mesh>
  );
}

/** A number that rises and fades over a figure. */
export function FloatingNumber({
  at,
  kind,
  amount,
  onDone,
  delay = 0,
}: {
  at: THREE.Vector3;
  kind: "damage" | "heal";
  amount: number | null;
  onDone: () => void;
  /** Milliseconds to wait before rising — until the blow lands (Plan 113). */
  delay?: number;
}) {
  const [y, setY] = useState(delay > 0 ? -1 : 0);
  useEffect(() => {
    const start = performance.now() + delay;
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / 1500);
      if (k < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setY(k);
      if (k < 1) raf = requestAnimationFrame(tick);
      else onDone();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone, delay]);
  if (y < 0) return null;
  const text = amount === null ? (kind === "heal" ? "+" : "−") : `${kind === "heal" ? "+" : "−"}${amount}`;
  return (
    <Html position={[at.x, 1.9 + y * 1.1, at.z]} center distanceFactor={7} style={{ pointerEvents: "none" }}>
      <div
        style={{
          font: "800 22px Cinzel, Georgia, serif",
          color: kind === "heal" ? "#8ff0a0" : "#ff6a5a",
          textShadow: "0 0 10px rgba(0,0,0,0.9), 0 2px 2px #000",
          opacity: 1 - y * y,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </Html>
  );
}

/**
 * The scene title, landing over the table for a few seconds when it changes.
 * The card is keyed by the title, so a new one restarts the animation; the
 * animation ends invisible, so nothing has to be torn down. A title the table
 * already had when we arrived is not announced.
 */
export function TitleCard({ title }: { title: string }) {
  // Set once on arrival and never updated: the title the table already had.
  const [arrivedWith] = useState(title);
  if (!title || title === arrivedWith) return null;
  return (
    <div className="et-title" key={title}>
      <div>{title}</div>
    </div>
  );
}

/**
 * A strike that crosses the room (Plan 113): an arrow's streak or a spell's
 * bolt in the damage type's colour, from the attacker's chest to the target's,
 * leaving at `launchMs` and landing at `impactMs` after `t0`; a burst and a
 * ring on the floor where it lands. Times are absolute (performance.now) so
 * the target's flinch and the floating number line up with it.
 */
export function Bolt({
  from,
  to,
  color,
  kind,
  launchMs,
  impactMs,
  t0,
  onDone,
  holdMs,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  kind: "shoot" | "cast";
  launchMs: number;
  impactMs: number;
  t0: number;
  onDone?: () => void;
  /** Debug: show the bolt as it is this many ms in, and stay there. */
  holdMs?: number;
}) {
  const head = useRef<THREE.Mesh>(null);
  const trail = useRef<THREE.Group>(null);
  const burst = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const finished = useRef(false);
  const c = useMemo(() => new THREE.Color(color).multiplyScalar(kind === "shoot" ? 1.8 : 3.4), [color, kind]);
  const dir = useMemo(() => to.clone().sub(from), [from, to]);
  const aim = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()), [dir]);
  const arc = kind === "cast" ? 0.28 : 0.1;
  useFrame(() => {
    const t = holdMs ?? performance.now() - t0;
    const fly = Math.min(1, Math.max(0, (t - launchMs) / Math.max(1, impactMs - launchMs)));
    const flying = t >= launchMs && t < impactMs;
    if (head.current) {
      head.current.visible = flying;
      head.current.position.copy(from).addScaledVector(dir, fly);
      head.current.position.y += arc * Math.sin(fly * Math.PI);
      head.current.quaternion.copy(aim);
    }
    if (trail.current) {
      trail.current.visible = flying;
      trail.current.children.forEach((m, i) => {
        const k = Math.max(0, fly - (i + 1) * 0.045);
        m.position.copy(from).addScaledVector(dir, k);
        m.position.y += arc * Math.sin(k * Math.PI);
        m.scale.setScalar(1 - (i + 1) * 0.14);
      });
    }
    const b = Math.min(1, Math.max(0, (t - impactMs) / 420));
    const bursting = t >= impactMs && b < 1;
    if (burst.current) {
      burst.current.visible = bursting;
      burst.current.position.copy(to);
      burst.current.scale.setScalar(0.08 + b * (kind === "cast" ? 0.9 : 0.35));
      (burst.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - b);
    }
    if (ring.current) {
      ring.current.visible = bursting;
      ring.current.position.set(to.x, 0.04, to.z);
      ring.current.scale.setScalar(0.3 + b * 1.5);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - b);
    }
    if (b >= 1 && !finished.current) {
      finished.current = true;
      onDone?.();
    }
  });
  return (
    <group>
      <mesh ref={head} visible={false}>
        {kind === "shoot" ? <cylinderGeometry args={[0.012, 0.012, 0.44, 6]} /> : <sphereGeometry args={[0.085, 12, 12]} />}
        <meshBasicMaterial color={c} toneMapped={false} />
      </mesh>
      <group ref={trail} visible={false}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[kind === "shoot" ? 0.018 : 0.06, 8, 8]} />
            <meshBasicMaterial color={c} toneMapped={false} transparent opacity={0.6 - i * 0.1} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <mesh ref={burst} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color={c} toneMapped={false} transparent depthWrite={false} />
      </mesh>
      <mesh ref={ring} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.5, 40]} />
        <meshBasicMaterial color={c} toneMapped={false} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/** A flash and a ring where a blow lands (Plan 113) — melee has no bolt to burst, so this is its impact. */
export function Burst({ at, color, t0, onDone }: { at: THREE.Vector3; color: string; t0: number; onDone?: () => void }) {
  const flash = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const finished = useRef(false);
  const c = useMemo(() => new THREE.Color(color).multiplyScalar(2.2), [color]);
  useFrame(() => {
    const t = performance.now() - t0;
    const b = Math.min(1, Math.max(0, t / 340));
    const on = t >= 0 && b < 1;
    if (flash.current) {
      flash.current.visible = on;
      flash.current.position.copy(at);
      flash.current.scale.setScalar(0.06 + b * 0.32);
      (flash.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - b);
    }
    if (ring.current) {
      ring.current.visible = on;
      ring.current.position.set(at.x, 0.04, at.z);
      ring.current.scale.setScalar(0.25 + b * 1.1);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - b);
    }
    if (b >= 1 && !finished.current) {
      finished.current = true;
      onDone?.();
    }
  });
  return (
    <group>
      <mesh ref={flash} visible={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={c} toneMapped={false} transparent depthWrite={false} />
      </mesh>
      <mesh ref={ring} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.5, 40]} />
        <meshBasicMaterial color={c} toneMapped={false} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}
