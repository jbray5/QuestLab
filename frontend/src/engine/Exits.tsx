import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { MapDef } from "./maps";
import { toWorld } from "./maps";

/**
 * Ways off a map (Plan 108, third pass).
 *
 * Justin: "would love a ladder down to her creepy abode." Down: a trapdoor
 * thrown open on the floor, a ladder standing in it, a sickly green light
 * seeping up from below. Up: the same ladder rising to whatever is above,
 * with the warm light of the room above coming down it. Click one to go.
 *
 * The notes say the door down is hidden under abjuration until found; the
 * engine shows it for now, and revealing it becomes a DM control later.
 */
function Ladder({ height, y }: { height: number; y: number }) {
  const { rail, rung, wood } = useMemo(
    () => ({
      rail: new THREE.CylinderGeometry(0.03, 0.03, height, 6),
      rung: new THREE.CylinderGeometry(0.02, 0.02, 0.38, 6),
      wood: new THREE.MeshStandardMaterial({ color: "#3a2c1e", roughness: 1 }),
    }),
    [height],
  );
  const rungs = useMemo(() => {
    const out: number[] = [];
    for (let r = -height / 2 + 0.2; r < height / 2; r += 0.25) out.push(r);
    return out;
  }, [height]);
  return (
    <group position={[0, y, -0.34]} rotation={[-0.18, 0, 0]}>
      <mesh geometry={rail} material={wood} position={[-0.19, 0, 0]} castShadow />
      <mesh geometry={rail} material={wood} position={[0.19, 0, 0]} castShadow />
      {rungs.map((r) => (
        <mesh key={r} geometry={rung} material={wood} position={[0, r, 0]} rotation={[0, 0, Math.PI / 2]} castShadow />
      ))}
    </group>
  );
}

function Hatch({
  at,
  kind,
  onClick,
}: {
  at: [number, number];
  kind: "down" | "up";
  onClick: () => void;
}) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    // Down: a slow, uneasy breathing, nothing like the torches' flicker.
    const t = clock.elapsedTime;
    if (light.current && kind === "down") light.current.intensity = 5 + 2.2 * Math.sin(t * 0.9) * Math.sin(t * 2.3);
  });
  return (
    <group
      position={[at[0], 0, at[1]]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {kind === "down" ? (
        <>
          {/* the hole: a frame of dark timber round a square of nothing */}
          <mesh position={[0, 0.02, 0]} receiveShadow>
            <boxGeometry args={[1.0, 0.05, 1.0]} />
            <meshStandardMaterial color="#2a2018" roughness={1} />
          </mesh>
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.82, 0.82]} />
            <meshBasicMaterial color="#020403" />
          </mesh>
          {/* the trapdoor, thrown open into the room; the ladder leans on the far edge */}
          <mesh position={[0, 0.45, -0.52]} rotation={[1.35, 0, 0]} castShadow>
            <boxGeometry args={[0.9, 0.05, 0.86]} />
            <meshStandardMaterial color="#3a2c1e" roughness={1} />
          </mesh>
          <group rotation={[0, Math.PI, 0]}>
            <Ladder height={1.5} y={0.25} />
          </group>
          <pointLight ref={light} position={[0, 0.35, 0]} color="#5cff8a" intensity={5} distance={5} decay={2} />
        </>
      ) : (
        <>
          <Ladder height={2.4} y={1.2} />
          {/* the room above, seen up the ladder */}
          <pointLight position={[0, 2.2, -0.3]} color="#ffb56b" intensity={9} distance={6} decay={2} />
        </>
      )}
    </group>
  );
}

export function Exits({ map, onExit }: { map: MapDef; onExit: (label: string, to?: string) => void }) {
  return (
    <group>
      {map.exits?.map((e, i) => {
        const [x, z] = toWorld(map, e.u, e.v);
        return <Hatch key={i} at={[x, z]} kind={e.kind ?? "down"} onClick={() => onExit(e.label, e.to)} />;
      })}
    </group>
  );
}
