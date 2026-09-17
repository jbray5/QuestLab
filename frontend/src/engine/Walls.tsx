import { useMemo } from "react";
import * as THREE from "three";

import type { MapDef } from "./maps";
import { toWorld } from "./maps";
import { usePbr } from "./materials";

/**
 * A map's wall segments extruded to height (Plan 108).
 *
 * Each traced segment becomes a box standing on the picture's own wall line,
 * so it occludes the painted wall beneath it. One brick material is shared by
 * every wall; each wall's UVs are scaled to its length so long walls tile
 * instead of stretching — one material and one set of textures, however many
 * walls.
 */
export function Walls({ map, thick = 0.3 }: { map: MapDef; thick?: number }) {
  const spec = map.wall ?? { material: "wall" as const, height: 2.1, tint: "#8f8983" };
  const height = spec.height;
  const brick = usePbr(spec.material, [1, 1]);
  const walls = useMemo(
    () =>
      map.walls.map(([u0, v0, u1, v1]) => {
        const [x0, z0] = toWorld(map, u0, v0);
        const [x1, z1] = toWorld(map, u1, v1);
        const len = Math.hypot(x1 - x0, z1 - z0) + thick;
        const angle = Math.atan2(z1 - z0, x1 - x0);
        const geom = new THREE.BoxGeometry(len, height, thick);
        // Tile the brick by real size: one repeat per 1.6 units.
        const uv = geom.attributes.uv as THREE.BufferAttribute;
        const along = len / 1.6;
        const up = height / 1.6;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, uv.getX(i) * along, uv.getY(i) * up);
        }
        uv.needsUpdate = true;
        return {
          geom,
          pos: [(x0 + x1) / 2, height / 2, (z0 + z1) / 2] as [number, number, number],
          rot: -angle,
        };
      }),
    [map, height, thick],
  );
  return (
    <group>
      {walls.map((w, i) => (
        <mesh key={i} geometry={w.geom} position={w.pos} rotation={[0, w.rot, 0]} castShadow receiveShadow>
          <meshStandardMaterial
            map={brick.map}
            normalMap={brick.normalMap}
            roughnessMap={brick.roughnessMap}
            color={spec.tint}
            normalScale={new THREE.Vector2(0.9, 0.9)}
            roughness={1}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}
