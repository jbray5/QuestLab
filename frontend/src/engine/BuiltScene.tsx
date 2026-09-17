import * as THREE from "three";

import { usePbr } from "./materials";
import { TAVERN_H, TAVERN_W, toWorld } from "./tavern";

/**
 * The full-3D floor — the built scene's ground (Plan 108).
 *
 * Same layout, same walls, same torches, same character as the hybrid; the
 * only thing that changes is the floor: photoscanned cobbles everywhere, and
 * worn planks laid over the taproom and the wing where the painted map has
 * boards. This is what "built from tiles" looks like with real materials and
 * without a single painted pixel.
 */
function Patch({
  u0,
  v0,
  u1,
  v1,
  set,
  onClick,
}: {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  set: ReturnType<typeof usePbr>;
  onClick: (p: THREE.Vector3) => void;
}) {
  const [x0, z0] = toWorld(u0, v0);
  const [x1, z1] = toWorld(u1, v1);
  return (
    <mesh
      position={[(x0 + x1) / 2, 0.012, (z0 + z1) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.point);
      }}
    >
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      <meshStandardMaterial
        map={set.map}
        normalMap={set.normalMap}
        roughnessMap={set.roughnessMap}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

export function BuiltFloor({ onClick }: { onClick: (p: THREE.Vector3) => void }) {
  const cobble = usePbr("floor", [TAVERN_W / 2.2, TAVERN_H / 2.2]);
  const planks = usePbr("planks", [7, 3]);
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick(e.point);
        }}
      >
        <planeGeometry args={[TAVERN_W, TAVERN_H]} />
        <meshStandardMaterial
          map={cobble.map}
          normalMap={cobble.normalMap}
          roughnessMap={cobble.roughnessMap}
          normalScale={new THREE.Vector2(0.8, 0.8)}
          roughness={1}
          metalness={0}
        />
      </mesh>
      {/* Boards where the tavern has boards: the taproom and the wing. */}
      <Patch u0={0.105} v0={0.24} u1={0.69} v1={0.415} set={planks} onClick={onClick} />
      <Patch u0={0.69} v0={0.075} u1={0.88} v1={0.415} set={planks} onClick={onClick} />
    </group>
  );
}
