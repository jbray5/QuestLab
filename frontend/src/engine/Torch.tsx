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
  post = false,
  color = "#ff9a3c",
}: {
  position: [number, number, number];
  shadow?: boolean;
  intensity?: number;
  /** A lantern on a pole standing on its own, rather than a sconce on a wall. */
  post?: boolean;
  /** Torchlight unless said otherwise — a witch's lamp burns another colour. */
  color?: string;
}) {
  // The flame is the light's colour, pushed past white so the bloom catches it.
  const flame = new THREE.Color(color).multiplyScalar(5);
  const light = useRef<THREE.PointLight>(null);
  const flameMesh = useRef<THREE.Mesh>(null);
  // Each torch flickers on its own beat, seeded by where it hangs.
  const seed = position[0] * 7.3 + position[2] * 3.1;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 9 + seed;
    const f = 0.86 + 0.14 * (Math.sin(t) * 0.5 + Math.sin(t * 2.3) * 0.3 + Math.sin(t * 5.1) * 0.2);
    if (light.current) light.current.intensity = intensity * f;
    if (flameMesh.current) flameMesh.current.scale.setScalar(0.9 + 0.2 * f);
  });
  return (
    <group position={position}>
      {post ? (
        <mesh position={[0, -position[1] / 2 - 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.06, position[1] - 0.1, 7]} />
          <meshStandardMaterial color="#2c2018" roughness={1} />
        </mesh>
      ) : (
        <mesh position={[0, -0.16, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 0.26, 7]} />
          <meshStandardMaterial color="#2c2018" roughness={1} />
        </mesh>
      )}
      <mesh ref={flameMesh}>
        <sphereGeometry args={[0.1, 10, 10]} />
        <meshBasicMaterial color={flame} toneMapped={false} />
      </mesh>
      <pointLight
        ref={light}
        color={color}
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
