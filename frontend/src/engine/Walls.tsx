import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
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
 *
 * A wall standing between the camera and what it is looking at (the orbit
 * target — the active figure when the table follows the turn, wherever the DM
 * put it otherwise) fades to a ghost so the room reads from any side.
 */
const FADED = 0.16;
const _cam = new THREE.Vector3();
/** Does the wall (a→b, on the floor) cross the line of sight from the camera to the target — ahead of the camera, short of the target? */
function inTheWay(cam: THREE.Vector3, tgt: THREE.Vector3, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = tgt.x - cam.x;
  const dz = tgt.z - cam.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return false;
  // Segment intersection in the floor plane: sight = cam + t·d, wall = a + u·e.
  const ex = bx - ax;
  const ez = bz - az;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) > 1e-6) {
    const wx = ax - cam.x;
    const wz = az - cam.z;
    const t = (wx * ez - wz * ex) / den;
    const u = (wx * dz - wz * dx) / den;
    // Within the wall, and between a stride past the camera and just short of the target.
    if (u >= -0.05 && u <= 1.05 && t * len > 0.3 && t * len < len - 0.45) return true;
  }
  // No crossing: the wall's ends brushing the sight line still hide the shoulder.
  const ux = dx / len;
  const uz = dz / len;
  for (const [px0, pz0] of [[ax, az], [bx, bz]]) {
    const px = px0 - cam.x;
    const pz = pz0 - cam.z;
    const along = px * ux + pz * uz;
    const across = Math.abs(px * uz - pz * ux);
    if (along > 0.3 && along < len - 0.45 && across < 0.55) return true;
  }
  return false;
}

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
          a: [x0, z0] as [number, number],
          b: [x1, z1] as [number, number],
        };
      }),
    [map, height, thick],
  );
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target?: THREE.Vector3 } | null;
  useFrame((_, dt) => {
    const tgt = controls?.target;
    if (!tgt) return;
    camera.getWorldPosition(_cam);
    const k = Math.min(1, dt * 6);
    walls.forEach((w, i) => {
      const m = mats.current[i];
      if (!m) return;
      const want = inTheWay(_cam, tgt, w.a[0], w.a[1], w.b[0], w.b[1]) ? FADED : 1;
      if (Math.abs(m.opacity - want) < 0.005) {
        m.opacity = want;
        return;
      }
      m.opacity += (want - m.opacity) * k;
    });
  });
  return (
    <group>
      {walls.map((w, i) => (
        <mesh key={i} geometry={w.geom} position={w.pos} rotation={[0, w.rot, 0]} castShadow receiveShadow>
          <meshStandardMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            transparent
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
