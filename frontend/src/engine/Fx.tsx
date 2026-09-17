import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
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
}: {
  at: THREE.Vector3;
  kind: "damage" | "heal";
  amount: number | null;
  onDone: () => void;
}) {
  const [y, setY] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / 1500);
      setY(k);
      if (k < 1) raf = requestAnimationFrame(tick);
      else onDone();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
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
