import { Cloud, Clouds, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { MapDef } from "./maps";
import { toWorld } from "./maps";
import { usePbr } from "./materials";

/**
 * Water (Plan 108, third pass — Restwater's hot springs).
 *
 * A pool is a disc of reflective water with a stone rim, ripples that move (a
 * scrolling normal map), steam drifting above it, and a faint cool light so
 * the water glows the way the painter had it glow. In the built scene the
 * picture is gone, so the rim is the pool's edge; on the painted map it sits
 * over the painted one. The engine supplies the part a picture can't — the
 * reflection of the lantern on the surface.
 */
const WATER_NORMALS = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/waternormals.jpg";

function useRipples() {
  const loaded = useTexture(WATER_NORMALS);
  return useMemo(() => {
    const c = loaded.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(3, 3);
    c.needsUpdate = true;
    return c;
  }, [loaded]);
}

/** Keeps one ripple texture moving. Every pool shares it, so it is scrolled once. */
function Scroll({ tex }: { tex: THREE.Texture }) {
  const ref = useRef(tex);
  useFrame((_, dt) => {
    ref.current.offset.x += dt * 0.018;
    ref.current.offset.y += dt * 0.011;
  });
  return null;
}

/**
 * Water without a mirror. A reflector re-renders the whole room for every pool,
 * every frame — four extra passes at Restwater, the same cost as the torch
 * shadows were. Physical water instead: the room's environment in the
 * specular, a wet clearcoat, ripples from the normal map. The mirror image of
 * figures is the only thing lost, and at table distance nobody looked for it.
 */
function Water({ ripples, scale, y = 0.03 }: { ripples: THREE.Texture; scale: [number, number]; y?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} scale={[scale[0], scale[1], 1]}>
      <circleGeometry args={[1, 48]} />
      <meshPhysicalMaterial
        color="#2d9a93"
        roughness={0.12}
        metalness={0}
        clearcoat={1}
        clearcoatRoughness={0.05}
        envMapIntensity={1.6}
        normalMap={ripples}
        normalScale={new THREE.Vector2(0.22, 0.22)}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}

/** A low stone rim round a pool, an oval ring standing a hand's height. */
function Rim({ scale, stone }: { scale: [number, number]; stone: ReturnType<typeof usePbr> }) {
  return (
    <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[scale[0], scale[1], 1]} castShadow receiveShadow>
      <ringGeometry args={[1, 1.09, 48]} />
      <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color="#8a847b" roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** A stone basin with water in it — Restwater's hall fountain, the well outside. */
function Basin({ at, ripples, stone }: { at: [number, number, number]; ripples: THREE.Texture; stone: ReturnType<typeof usePbr> }) {
  const [x, z, r] = at;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 1.08, 0.44, 24, 1, true]} />
        <meshStandardMaterial
          map={stone.map}
          normalMap={stone.normalMap}
          roughnessMap={stone.roughnessMap}
          color="#7a746c"
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Water ripples={ripples} scale={[r * 0.92, r * 0.92]} y={0.35} />
      <pointLight position={[0, 0.9, 0]} color="#8fe8dc" intensity={3} distance={5} decay={2} />
    </group>
  );
}

export function Pools({ map }: { map: MapDef }) {
  const ripples = useRipples();
  const stone = usePbr("wall", [3, 0.5]);
  return (
    <group>
      <Scroll tex={ripples} />
      {map.pools?.map((p, i) => {
        const [x, z] = toWorld(map, p.u, p.v);
        const rx = p.rx * map.w;
        const rz = p.ry * map.h;
        return (
          <group key={i} position={[x, 0, z]}>
            <Rim scale={[rx, rz]} stone={stone} />
            <Water ripples={ripples} scale={[rx * 0.97, rz * 0.97]} />
            <pointLight position={[0, 0.6, 0]} color="#7fe0d6" intensity={4} distance={rx * 2.4} decay={2} />
            {/* steam */}
            <Clouds material={THREE.MeshBasicMaterial} limit={60}>
              <Cloud
                seed={i + 3}
                segments={12}
                bounds={[rx * 0.9, 0.5, rz * 0.9]}
                volume={2.4}
                color="#d9f0ee"
                opacity={0.14}
                fade={10}
                speed={0.1}
                growth={2}
                position={[0, 0.9, 0]}
              />
            </Clouds>
          </group>
        );
      })}
      {map.basins?.map((b, i) => {
        const [x, z] = toWorld(map, b.u, b.v);
        return <Basin key={i} at={[x, z, b.r]} ripples={ripples} stone={stone} />;
      })}
    </group>
  );
}
