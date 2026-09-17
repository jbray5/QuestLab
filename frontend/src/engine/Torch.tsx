import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

/**
 * A wall torch: a bracket, a flame the bloom pass picks up, and a point light
 * that flickers (Plan 108). This is the light everything else is lit by —
 * floor, walls and character together — which is the whole design rule.
 *
 * Point-light shadows cost six renders each, so only a few torches cast them.
 */
export function Torch({
  position,
  shadow = false,
  intensity = 34,
}: {
  position: [number, number, number];
  shadow?: boolean;
  intensity?: number;
}) {
  const light = useRef<THREE.PointLight>(null);
  const flame = useRef<THREE.Mesh>(null);
  // Each torch flickers on its own beat, seeded by where it hangs.
  const seed = position[0] * 7.3 + position[2] * 3.1;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 9 + seed;
    const f = 0.86 + 0.14 * (Math.sin(t) * 0.5 + Math.sin(t * 2.3) * 0.3 + Math.sin(t * 5.1) * 0.2);
    if (light.current) light.current.intensity = intensity * f;
    if (flame.current) flame.current.scale.setScalar(0.9 + 0.2 * f);
  });
  return (
    <group position={position}>
      <mesh position={[0, -0.16, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 0.26, 7]} />
        <meshStandardMaterial color="#2c2018" roughness={1} />
      </mesh>
      <mesh ref={flame}>
        <sphereGeometry args={[0.1, 10, 10]} />
        {/* Brighter than white so the bloom threshold catches it. */}
        <meshBasicMaterial color={[5, 2.4, 0.7]} toneMapped={false} />
      </mesh>
      <pointLight
        ref={light}
        color="#ff9a3c"
        intensity={intensity}
        distance={18}
        decay={2}
        castShadow={shadow}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.003}
        shadow-radius={3}
      />
    </group>
  );
}
