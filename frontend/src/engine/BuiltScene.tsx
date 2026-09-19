import { MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";

import type { MapDef } from "./maps";
import { toWorld } from "./maps";
import { usePbr } from "./materials";
import { useQuality } from "./quality";

/**
 * The full-3D floor — the built scene's ground (Plan 108).
 *
 * Same layout, same walls, same torches, same character as the hybrid; the
 * only thing that changes is the floor: photoscanned cobbles everywhere, and
 * worn planks laid where the map's definition says there are boards. This is
 * what "built from tiles" looks like with real materials and without a single
 * painted pixel.
 */
function Patch({
  map,
  seg,
  set,
  onClick,
}: {
  map: MapDef;
  seg: [number, number, number, number];
  set: ReturnType<typeof usePbr>;
  onClick: (p: THREE.Vector3) => void;
}) {
  const [x0, z0] = toWorld(map, seg[0], seg[1]);
  const [x1, z1] = toWorld(map, seg[2], seg[3]);
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

export function BuiltFloor({ map, onClick }: { map: MapDef; onClick: (p: THREE.Vector3) => void }) {
  const cobble = usePbr(map.ground ?? "floor", [map.w / 2.2, map.h / 2.2]);
  // Scanned sand has ridges a hand deep; at table scale that reads as rough ground. Softer.
  const bump = map.ground === "sand" ? 0.3 : 0.8;
  const planks = usePbr("planks", [7, 3]);
  // The mirror is a whole extra render of the room: Cinema only, never in Fast.
  const { fast, cinema } = useQuality();
  const wet = !!map.wet && !fast && cinema;
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
        <planeGeometry args={[map.w, map.h]} />
        {wet ? (
          <MeshReflectorMaterial
            map={cobble.map}
            normalMap={cobble.normalMap}
            roughnessMap={cobble.roughnessMap}
            normalScale={new THREE.Vector2(bump, bump)}
            resolution={512}
            mirror={0.35}
            mixBlur={1}
            mixStrength={0.9}
            blur={[320, 140]}
            depthScale={0.8}
            minDepthThreshold={0.85}
            maxDepthThreshold={1.3}
            roughness={0.75}
            metalness={0}
            distortion={0.15}
            distortionMap={cobble.normalMap}
          />
        ) : (
          <meshStandardMaterial
            map={cobble.map}
            normalMap={cobble.normalMap}
            roughnessMap={cobble.roughnessMap}
            normalScale={new THREE.Vector2(bump, bump)}
            roughness={1}
            metalness={0}
          />
        )}
      </mesh>
      {map.planks?.map((seg, i) => (
        <Patch key={i} map={map} seg={seg} set={planks} onClick={onClick} />
      ))}
    </group>
  );
}
